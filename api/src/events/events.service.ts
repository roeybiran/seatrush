import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EventEntity, SeatEntity } from '../db/entities';
import { CreateEventDto } from './create-event.dto';

@Injectable()
export class EventsService {
  constructor(private readonly dataSource: DataSource) {}

  async create(input: CreateEventDto) {
    const { rowCount, seatsPerRow } = input;
    const eventId = await this.dataSource.transaction(async (manager) => {
      const event = await manager.save(EventEntity, {
        name: input.name.trim(),
        venue: input.venue.trim(),
        eventTime: new Date(input.eventTime),
        dropTime: new Date(input.dropTime),
        rowCount,
        seatsPerRow,
      });
      const seats: Array<{
        eventId: string;
        rowIndex: number;
        number: number;
        zoneIndex: number;
        priceAgorot: number;
      }> = [];
      for (const [zoneIndex, zone] of input.zones.entries()) {
        for (
          let rowIndex = zone.startRow;
          rowIndex <= zone.endRow;
          rowIndex++
        ) {
          for (let number = 0; number < seatsPerRow; number++) {
            seats.push({
              eventId: event.id,
              rowIndex,
              number,
              zoneIndex,
              priceAgorot: zone.priceAgorot,
            });
          }
        }
      }
      for (let start = 0; start < seats.length; start += 5000) {
        await manager.insert(SeatEntity, seats.slice(start, start + 5000));
      }
      return event.id;
    });
    return this.detail(eventId);
  }

  async list() {
    return this.dataSource.getRepository(EventEntity).find({
      order: { eventTime: 'ASC', id: 'ASC' },
    });
  }

  async detail(eventId: string) {
    const event = await this.dataSource
      .getRepository(EventEntity)
      .findOneBy({ id: eventId });
    if (!event) throw new NotFoundException('Event not found.');
    const [seats, time] = await Promise.all([
      this.dataSource.query(
        `
        SELECT seat.row_index AS "rowIndex", seat.number, seat.zone_index AS "zoneIndex",
          seat.price_agorot AS "priceAgorot",
          CASE WHEN orders.id IS NOT NULL THEN 'sold'
               WHEN hold.expires_at > statement_timestamp() THEN 'held'
               ELSE 'available' END AS status
        FROM seats AS seat
        LEFT JOIN holds AS hold ON hold.id = seat.hold_id AND hold.event_id = seat.event_id
        LEFT JOIN orders ON orders.hold_id = hold.id
        WHERE seat.event_id = $1 ORDER BY seat.row_index, seat.number
      `,
        [eventId],
      ) as Promise<
        Array<{
          rowIndex: number;
          number: number;
          zoneIndex: number;
          priceAgorot: number;
          status: 'sold' | 'held' | 'available';
        }>
      >,
      this.dataSource.query('SELECT clock_timestamp() AS now') as Promise<
        Array<{ now: Date }>
      >,
    ]);
    const rows: Array<{
      rowIndex: number;
      zoneNumber: number;
      seats: Array<{
        seatNumber: number;
        status: 'sold' | 'held' | 'available';
      }>;
    }> = [];
    const zones: Array<{
      number: number;
      priceAgorot: number;
      startRow: number;
      endRow: number;
    }> = [];
    for (const seat of seats) {
      if (!rows[seat.rowIndex]) {
        rows[seat.rowIndex] = {
          rowIndex: seat.rowIndex,
          zoneNumber: seat.zoneIndex,
          seats: [],
        };
      }
      rows[seat.rowIndex].seats.push({
        seatNumber: seat.number,
        status: seat.status,
      });

      if (!zones[seat.zoneIndex]) {
        zones[seat.zoneIndex] = {
          number: seat.zoneIndex,
          priceAgorot: seat.priceAgorot,
          startRow: seat.rowIndex,
          endRow: seat.rowIndex,
        };
      }
      zones[seat.zoneIndex].endRow = seat.rowIndex;
    }
    return {
      ...event,
      serverTime: time[0].now,
      zones,
      rows,
    };
  }
}
