import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { BestAvailableDto } from './best-available.dto';
import { CreateHoldDto } from './create-hold.dto';

@Injectable()
export class HoldsService {
  private readonly ttlSeconds = Number(process.env.HOLD_TTL_SECONDS ?? 300);
  private readonly maxSeatsPerUser = Number(process.env.MAX_SEATS_PER_USER ?? 4);

  constructor(private readonly dataSource: DataSource) {}

  async create(eventId: string, username: string, input: CreateHoldDto) {
    // Keep selection, checks, and updates in one transaction.
    return this.dataSource.transaction(async (manager) => {
      const { event, now } = await this.lockEvent(manager, eventId);
      return this.createHold(manager, eventId, username, input, event, now);
    });
  }

  async bestAvailable(eventId: string, username: string, input: BestAvailableDto) {
    return this.dataSource.transaction(async (manager) => {
      const { event, now } = await this.lockEvent(manager, eventId);
      // Read only eligible seats that are not sold or held at the locked time.
      const available: Array<{ row_index: number; number: number }> = await manager.query(`
        SELECT seat.row_index, seat.number
        FROM seats AS seat
        LEFT JOIN holds AS hold ON hold.id = seat.hold_id AND hold.event_id = seat.event_id
        LEFT JOIN orders ON orders.hold_id = hold.id
        WHERE seat.event_id = $1
          AND orders.id IS NULL AND (hold.id IS NULL OR hold.expires_at <= $2)
          AND ($3::numeric IS NULL OR seat.zone_index = $3)
          AND ($4::numeric IS NULL OR seat.price_agorot <= $4)
        ORDER BY seat.row_index, seat.number
      `, [eventId, now, input.zoneNumber ?? null, input.maxPriceAgorot ?? null]);
      const coordinates = new Set(available.map((seat) => `${seat.row_index}:${seat.number}`));
      let best: { rowIndex: number; seatNumber: number; distance: number } | undefined;
      for (const seat of available) {
        if (best && seat.row_index > best.rowIndex) break;
        const consecutive = Array.from({ length: input.count }, (_, offset) =>
          coordinates.has(`${seat.row_index}:${seat.number + offset}`),
        ).every(Boolean);
        if (!consecutive) continue;
        const distance = Math.abs(2 * seat.number + input.count - event.seats_per_row);
        if (!best || distance < best.distance) {
          best = { rowIndex: seat.row_index, seatNumber: seat.number, distance };
        }
      }
      if (!best) {
        throw new ConflictException({ code: 'NO_SEATS_AVAILABLE', message: 'No matching consecutive seats are available.' });
      }
      const seats = Array.from({ length: input.count }, (_, offset) => ({
        rowIndex: best!.rowIndex, seatNumber: best!.seatNumber + offset,
      }));
      return this.createHold(manager, eventId, username, { seats }, event, now);
    });
  }

  private async lockEvent(manager: EntityManager, eventId: string) {
    // Lock the event to serialize inventory changes and read its dimensions.
    const events: Array<{ drop_time: Date; row_count: number; seats_per_row: number }> = await manager.query(`
      SELECT drop_time, row_count, seats_per_row FROM events WHERE id = $1 FOR UPDATE
    `, [eventId]);
    if (!events.length) throw new NotFoundException('Event not found.');
    // Read the database clock after acquiring the lock, so waiting cannot make it stale.
    const [{ now }]: Array<{ now: Date }> = await manager.query('SELECT clock_timestamp() AS now');
    if (now < events[0].drop_time) {
      throw new ConflictException({ code: 'DROP_NOT_OPEN', message: 'Tickets are not on sale yet.' });
    }
    return { event: events[0], now };
  }

  private async createHold(
    manager: EntityManager, eventId: string, username: string, input: CreateHoldDto,
    event: { row_count: number; seats_per_row: number }, now: Date,
  ) {
    for (const seat of input.seats) {
      if (seat.rowIndex >= event.row_count || seat.seatNumber >= event.seats_per_row) {
        throw new BadRequestException(`Seat at row ${seat.rowIndex}, number ${seat.seatNumber} does not exist in this event.`);
      }
    }
    const rowIndexes = input.seats.map((seat) => seat.rowIndex);
    const seatNumbers = input.seats.map((seat) => seat.seatNumber);
    // Pair the requested coordinates and read each seat's price.
    const candidates: Array<{ row_index: number; number: number; price_agorot: number }> =
      await manager.query(`
        SELECT seat.row_index, seat.number, seat.price_agorot
        FROM seats AS seat
        JOIN unnest($2::int[], $3::int[]) AS requested(row_index, number)
          ON requested.row_index = seat.row_index AND requested.number = seat.number
        WHERE seat.event_id = $1
      `, [eventId, rowIndexes, seatNumbers]);
    const seats = input.seats.map((seat) => {
      const candidate = candidates.find((item) => item.row_index === seat.rowIndex && item.number === seat.seatNumber);
      if (!candidate) throw new BadRequestException(`Seat at row ${seat.rowIndex}, number ${seat.seatNumber} does not exist in this event.`);
      return candidate;
    });

    // Find requested seats blocked by an unexpired hold or an order.
    // Join on both IDs to keep the seat and hold in the same event.
    const taken: Array<{ row_index: number; number: number }> = await manager.query(`
      SELECT seat.row_index, seat.number FROM seats AS seat
      JOIN unnest($2::int[], $3::int[]) AS requested(row_index, number)
        ON requested.row_index = seat.row_index AND requested.number = seat.number
      JOIN holds AS hold ON hold.id = seat.hold_id AND hold.event_id = seat.event_id
      WHERE seat.event_id = $1
        AND (hold.expires_at > $4 OR EXISTS (SELECT 1 FROM orders WHERE orders.hold_id = hold.id))
    `, [eventId, rowIndexes, seatNumbers, now]);
    if (taken.length) {
      const unavailable = taken.map((seat) => ({ rowIndex: seat.row_index, seatNumber: seat.number }));
      throw new ConflictException({ code: 'SEATS_UNAVAILABLE', message: 'Someone just took one or more selected seats.', seats: unavailable });
    }
    // Count this fan's unexpired held and ordered seats for this event.
    const [{ count }]: Array<{ count: string }> = await manager.query(`
      SELECT count(*) AS count FROM seats AS seat
      JOIN holds AS hold ON hold.id = seat.hold_id AND hold.event_id = seat.event_id
      WHERE hold.event_id = $1 AND hold.username = $2
        AND (hold.expires_at > $3 OR EXISTS (SELECT 1 FROM orders WHERE orders.hold_id = hold.id))
    `, [eventId, username, now]);
    if (Number(count) + seats.length > this.maxSeatsPerUser) {
      throw new ConflictException({ code: 'SEAT_LIMIT', message: `You can hold up to ${this.maxSeatsPerUser} seats for this event.` });
    }
    // Create the hold using the database time and configured lifetime.
    // Return its ID for the seat update and its expiry for the response.
    const [hold]: Array<{ id: string; expires_at: Date }> = await manager.query(`
      INSERT INTO holds (event_id, username, created_at, expires_at)
      VALUES ($1, $2, $3, $3::timestamptz + $4 * interval '1 second')
      RETURNING id, expires_at
    `, [eventId, username, now, this.ttlSeconds]);
    // Attach every requested seat to the new hold within the same transaction.
    await manager.query(
      `
        UPDATE seats SET hold_id = $1
        WHERE event_id = $2 AND (row_index, number) IN (
          SELECT * FROM unnest($3::int[], $4::int[])
        )
      `,
      [hold.id, eventId, rowIndexes, seatNumbers],
    );
    return { id: hold.id, eventId, seats: seats.map((seat) => ({ rowIndex: seat.row_index, seatNumber: seat.number, priceAgorot: seat.price_agorot })), expiresAt: hold.expires_at, serverTime: now };
  }

  async checkout(eventId: string, holdId: string, username: string) {
    return this.dataSource.transaction(async (manager) => {
      // Serialize checkout with every other inventory change for this event.
      const events = await manager.query('SELECT id FROM events WHERE id = $1 FOR UPDATE', [eventId]);
      if (!events.length) throw new NotFoundException('Event not found.');
      // Read the clock after acquiring the inventory lock.
      const [{ now }]: Array<{ now: Date }> = await manager.query('SELECT clock_timestamp() AS now');
      // Verify the hold belongs to this event and user before returning an existing order.
      const holds: Array<{ username: string; expires_at: Date }> = await manager.query(
        'SELECT username, expires_at FROM holds WHERE event_id = $1 AND id = $2', [eventId, holdId],
      );
      const hold = holds[0];
      if (!hold) throw new NotFoundException('Hold not found.');
      if (hold.username !== username) throw new ForbiddenException('Only the hold owner can check out.');
      // An existing order makes retries successful even after the original hold expires.
      const orders: Array<{ id: string }> = await manager.query('SELECT id FROM orders WHERE hold_id = $1', [holdId]);
      if (!orders.length && hold.expires_at <= now) {
        throw new ConflictException({ code: 'HOLD_INACTIVE', message: 'This hold is no longer active.' });
      }
      const seats: Array<{ row_index: number; number: number; price_agorot: number }> = await manager.query(`
        SELECT row_index, number, price_agorot FROM seats
        WHERE event_id = $1 AND hold_id = $2 ORDER BY row_index, number
      `, [eventId, holdId]);
      if (!seats.length) throw new ConflictException({ code: 'HOLD_INACTIVE', message: 'This hold has no seats.' });
      if (!orders.length) {
        // The unique hold ID guarantees only one order can be created for a hold.
        orders.push(...await manager.query('INSERT INTO orders (hold_id) VALUES ($1) RETURNING id', [holdId]));
      }
      return {
        id: orders[0].id, holdId, eventId,
        seats: seats.map((seat) => ({ rowIndex: seat.row_index, seatNumber: seat.number, priceAgorot: seat.price_agorot })),
        totalAgorot: seats.reduce((total, seat) => total + seat.price_agorot, 0),
      };
    });
  }

  async release(eventId: string, holdId: string, username: string) {
    // Serialize release with other inventory changes for the same event.
    return this.dataSource.transaction(async (manager) => {
      // Check the event exists and acquire its inventory lock.
      const events = await manager.query(`
        SELECT id FROM events WHERE id = $1 FOR UPDATE
      `, [eventId]);
      if (!events.length) throw new NotFoundException('Event not found.');
      // Evaluate expiry using the database clock after taking the lock.
      const [{ now }]: Array<{ now: Date }> = await manager.query('SELECT clock_timestamp() AS now');
      // Read this hold's owner and expiry; derive checkout state from an associated order.
      const holds: Array<{ username: string; checked_out: boolean; expires_at: Date }> = await manager.query(`
        SELECT username, expires_at, EXISTS (SELECT 1 FROM orders WHERE orders.hold_id = holds.id) AS checked_out
        FROM holds WHERE event_id = $1 AND id = $2
      `, [eventId, holdId]);
      const hold = holds[0];
      if (!hold) throw new NotFoundException('Hold not found.');
      if (hold.username !== username) throw new ForbiddenException('Only the hold owner can release it.');
      if (hold.checked_out || hold.expires_at <= now) {
        throw new ConflictException({ code: 'HOLD_INACTIVE', message: 'This hold is no longer active.' });
      }
      // Delete the hold; the seat foreign key clears its hold IDs automatically.
      await manager.query('DELETE FROM holds WHERE event_id = $1 AND id = $2', [eventId, holdId]);
      return { id: holdId, status: 'released' };
    });
  }
}
