import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateHoldDto } from './create-hold.dto';

@Injectable()
export class HoldsService {
  private readonly ttlSeconds = Number(process.env.HOLD_TTL_SECONDS ?? 300);
  private readonly maxSeatsPerUser = Number(process.env.MAX_SEATS_PER_USER ?? 4);

  constructor(private readonly dataSource: DataSource) {}

  async create(eventId: string, username: string, input: CreateHoldDto) {
    // Keep the checks and updates together; a rejection rolls back the entire hold.
    return this.dataSource.transaction(async (manager) => {
      // Read the drop time and seat-number limit, and lock the event to serialize inventory changes.
      const events: Array<{ drop_time: Date; row_count: number; seats_per_row: number }> = await manager.query(
        `
          SELECT drop_time, row_count, seats_per_row
          FROM events
          WHERE id = $1
          FOR UPDATE
        `, [eventId],
      );
      if (!events.length) throw new NotFoundException('Event not found.');
      // Read the database clock after acquiring the lock, so waiting cannot make it stale.
      const [{ now }]: Array<{ now: Date }> = await manager.query('SELECT clock_timestamp() AS now');
      if (now < events[0].drop_time) {
        throw new ConflictException({ code: 'DROP_NOT_OPEN', message: 'Tickets are not on sale yet.' });
      }
      for (const seat of input.seats) {
        if (seat.rowIndex >= events[0].row_count || seat.seatNumber >= events[0].seats_per_row) {
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
