import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { EventEntity, EventRowEntity, SeatEntity, ZoneEntity } from './entities';

@Injectable()
export class EventsService {
  constructor(private readonly dataSource: DataSource) {}

  async create(body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new BadRequestException('Provide an event object.');
    }
    const input = body as Record<string, unknown>;
    if (typeof input.name !== 'string' || !input.name.trim() ||
        typeof input.venue !== 'string' || !input.venue.trim()) {
      throw new BadRequestException('Name and venue are required.');
    }
    if (typeof input.eventTime !== 'string' || typeof input.dropTime !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(input.eventTime) ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(input.dropTime) ||
        Number.isNaN(Date.parse(input.eventTime)) || Number.isNaN(Date.parse(input.dropTime))) {
      throw new BadRequestException('Event and drop times must be valid ISO timestamps with a timezone.');
    }
    for (const timestamp of [input.eventTime, input.dropTime]) {
      const [year, month, day] = timestamp.slice(0, 10).split('-').map(Number);
      const calendarDate = new Date(0);
      calendarDate.setUTCFullYear(year, month - 1, day);
      if (year < 1 || calendarDate.getUTCFullYear() !== year ||
          calendarDate.getUTCMonth() !== month - 1 || calendarDate.getUTCDate() !== day) {
        throw new BadRequestException('Event and drop times must contain valid calendar dates.');
      }
    }
    if (!Number.isInteger(input.rowCount) || !Number.isInteger(input.seatsPerRow) ||
        (input.rowCount as number) < 1 || (input.rowCount as number) > 702 ||
        (input.seatsPerRow as number) < 1 || (input.seatsPerRow as number) > 10000 ||
        (input.rowCount as number) * (input.seatsPerRow as number) > 100000) {
      throw new BadRequestException('Provide positive row and seat counts, with at most 702 rows and 100,000 seats.');
    }
    if (!Array.isArray(input.zones) || input.zones.length === 0) {
      throw new BadRequestException('Provide at least one zone.');
    }
    const rowCount = input.rowCount as number;
    const seatsPerRow = input.seatsPerRow as number;
    const labels: string[] = [];
    for (let index = 1; index <= rowCount; index++) {
      let remaining = index;
      let label = '';
      while (remaining > 0) {
        remaining--;
        label = String.fromCharCode(65 + remaining % 26) + label;
        remaining = Math.floor(remaining / 26);
      }
      labels.push(label);
    }
    const expectedRows = new Set(labels);
    const assignedRows = new Set<string>();
    const zoneNames = new Set<string>();
    const zones: Array<{ name: string; priceAgorot: number; rows: string[] }> = [];
    for (const value of input.zones) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new BadRequestException('Each zone must have a name, price, and rows.');
      }
      const zone = value as Record<string, unknown>;
      if (typeof zone.name !== 'string' || !zone.name.trim() ||
          !Number.isInteger(zone.priceAgorot) || (zone.priceAgorot as number) < 0 ||
          (zone.priceAgorot as number) > 2147483647 ||
          !Array.isArray(zone.rows) || zone.rows.length === 0) {
        throw new BadRequestException('Each zone needs a name, nonnegative price in agorot, and at least one row.');
      }
      const name = zone.name.trim();
      if (zoneNames.has(name)) throw new BadRequestException('Zone names must be unique.');
      zoneNames.add(name);
      for (const row of zone.rows) {
        if (typeof row !== 'string' || !expectedRows.has(row)) {
          throw new BadRequestException('Zone rows must be valid row labels.');
        }
        if (assignedRows.has(row)) throw new BadRequestException(`Row ${row} is assigned more than once.`);
        assignedRows.add(row);
      }
      zones.push({ name, priceAgorot: zone.priceAgorot as number, rows: zone.rows as string[] });
    }
    if (assignedRows.size !== rowCount) {
      throw new BadRequestException('Every row must belong to exactly one zone.');
    }

    const eventId = await this.dataSource.transaction(async (manager) => {
      const event = await manager.save(EventEntity, {
        name: (input.name as string).trim(),
        venue: (input.venue as string).trim(),
        eventTime: new Date(input.eventTime as string),
        dropTime: new Date(input.dropTime as string),
        rowCount,
        seatsPerRow,
      });
      const rowZones = new Map<string, string>();
      for (const zone of zones) {
        const saved = await manager.save(ZoneEntity, {
          eventId: event.id, name: zone.name, priceAgorot: zone.priceAgorot,
        });
        for (const label of zone.rows) rowZones.set(label, saved.id);
      }
      const seats: Array<{ eventId: string; rowId: string; number: number }> = [];
      for (const [index, label] of labels.entries()) {
        const row = await manager.save(EventRowEntity, {
          eventId: event.id, zoneId: rowZones.get(label)!, rowIndex: index + 1, label,
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
      this.dataSource.getRepository(ZoneEntity).find({ where: { eventId }, order: { name: 'ASC' } }),
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
    return {
      ...event,
      serverTime: time[0].now,
      zones: zones.map(({ id, name, priceAgorot }) => ({ id, name, priceAgorot })),
      rows: rows.map((row) => ({
        label: row.label,
        zoneId: row.zoneId,
        seats: (seatsByRow.get(row.id) ?? []).map((seat) => ({
          id: `${row.label}${seat.number}`,
          number: seat.number,
          status: 'available',
        })),
      })),
    };
  }
}
