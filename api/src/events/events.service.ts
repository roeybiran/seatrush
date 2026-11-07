import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EventEntity, EventRowEntity, SeatEntity, ZoneEntity } from '../db/entities';
import { CreateEventDto } from './create-event.dto';
import { rowLabel } from '../utils/row-label';

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
      const rowZones = new Map<number, string>();
      for (const [zoneIndex, zone] of input.zones.entries()) {
        const saved = await manager.save(ZoneEntity, {
          eventId: event.id, zoneIndex, priceAgorot: zone.priceAgorot,
        });
        for (let row = zone.startRow; row <= zone.endRow; row++) rowZones.set(row, saved.id);
      }
      const seats: Array<{ eventId: string; rowId: string; number: number }> = [];
      for (let index = 0; index < rowCount; index++) {
        const row = await manager.save(EventRowEntity, {
          eventId: event.id, zoneId: rowZones.get(index)!, rowIndex: index,
        });
        for (let number = 1; number <= seatsPerRow; number++) {
          seats.push({ eventId: event.id, rowId: row.id, number });
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
    const event = await this.dataSource.getRepository(EventEntity).findOneBy({ id: eventId });
    if (!event) throw new NotFoundException('Event not found.');
    const [zones, rows, seats, time] = await Promise.all([
      this.dataSource.getRepository(ZoneEntity).find({ where: { eventId }, order: { zoneIndex: 'ASC' } }),
      this.dataSource.getRepository(EventRowEntity).find({ where: { eventId }, order: { rowIndex: 'ASC' } }),
      this.dataSource.getRepository(SeatEntity).find({ where: { eventId }, order: { number: 'ASC' } }),
      this.dataSource.query('SELECT clock_timestamp() AS now') as Promise<Array<{ now: Date }>>,
    ]);
    const seatsByRow = new Map<string, SeatEntity[]>();
    for (const seat of seats) {
      const rowSeats = seatsByRow.get(seat.rowId) ?? [];
      rowSeats.push(seat);
      seatsByRow.set(seat.rowId, rowSeats);
    }
    const zoneNumbers = new Map(zones.map((zone) => [zone.id, zone.zoneIndex]));
    return {
      ...event,
      serverTime: time[0].now,
      zones: zones.map((zone) => {
        const zoneRows = rows.filter((row) => row.zoneId === zone.id);
        return { number: zone.zoneIndex, priceAgorot: zone.priceAgorot,
          startRow: zoneRows[0]?.rowIndex, endRow: zoneRows.at(-1)?.rowIndex };
      }),
      rows: rows.map((row) => {
        const label = rowLabel(row.rowIndex);
        return {
          label,
          zoneNumber: zoneNumbers.get(row.zoneId),
          seats: (seatsByRow.get(row.id) ?? []).map((seat) => ({
            id: `${label}${seat.number}`,
            number: seat.number,
            status: 'available',
          })),
        };
      }),
    };
  }
}
