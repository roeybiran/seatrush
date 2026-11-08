import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

describe('event API with PostgreSQL', () => {
  let admin: DataSource;
  let app: INestApplication;
  let database: DataSource;
  let schemaCreated = false;
  const schema = `seatrush_test_${randomUUID().replaceAll('-', '')}`;
  const originalUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    if (!originalUrl)
      throw new Error(
        'Set DATABASE_URL to a PostgreSQL database where the user can create schemas.',
      );
    admin = new DataSource({ type: 'postgres', url: originalUrl });
    await admin.initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    const testUrl = new URL(originalUrl);
    testUrl.searchParams.set('options', `-c search_path=${schema}`);
    process.env.DATABASE_URL = testUrl.toString();
    const { AppModule } = await import('../src/app.module');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication({ logger: false });
    database = app.get(DataSource);
    await database.runMigrations();
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (admin?.isInitialized) {
      try {
        if (schemaCreated) await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await admin.destroy();
      }
    }
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
  });

  test('creates and lists a seat map with ordered rows, zones, and prices', async () => {
    const response = await request(app.getHttpServer())
      .post('/events')
      .send({
        name: 'Opening Night',
        venue: 'Hall',
        eventTime: '2030-07-01T20:00:00',
        dropTime: '2030-06-01T10:00:00Z',
        rowCount: 27,
        seatsPerRow: 2,
        zones: [
          { startRow: 0, endRow: 1, priceAgorot: 20000 },
          { startRow: 2, endRow: 26, priceAgorot: 12000 },
        ],
      });
    expect(response.status).toBe(201);
    const event = response.body as {
      id: string;
      name: string;
      serverTime: string;
      zones: Array<{
        number: number;
        startRow: number;
        endRow: number;
        priceAgorot: number;
      }>;
      rows: Array<{
        rowIndex: number;
        zoneNumber: number;
        seats: Array<{ seatNumber: number; status: string }>;
      }>;
    };
    expect(event.name).toBe('Opening Night');
    expect(Number.isNaN(Date.parse(event.serverTime))).toBe(false);
    expect(event.rows).toHaveLength(27);
    expect([
      event.rows[0].rowIndex,
      event.rows[25].rowIndex,
      event.rows[26].rowIndex,
    ]).toEqual([0, 25, 26]);
    const storedRows = await database.query(
      'SELECT DISTINCT row_index FROM seats WHERE event_id = $1 ORDER BY row_index',
      [event.id],
    );
    expect(
      storedRows.map((row: { row_index: number }) => row.row_index),
    ).toEqual(Array.from({ length: 27 }, (_, index) => index));
    expect(event.rows[26].seats.map((seat) => seat.seatNumber)).toEqual([1, 2]);
    expect(
      event.rows.every((row) =>
        row.seats.every((seat) => seat.status === 'available'),
      ),
    ).toBe(true);
    const front = event.zones.find((zone) => zone.number === 0);
    const back = event.zones.find((zone) => zone.number === 1);
    expect(front?.priceAgorot).toBe(20000);
    expect(back?.priceAgorot).toBe(12000);
    expect([
      front?.startRow,
      front?.endRow,
      back?.startRow,
      back?.endRow,
    ]).toEqual([0, 1, 2, 26]);
    expect(event.rows[0].zoneNumber).toBe(0);
    expect(event.rows[26].zoneNumber).toBe(1);
    const storedSeats = await database.query(
      'SELECT row_index, number, zone_index, price_agorot FROM seats WHERE event_id = $1 AND number = 1 ORDER BY row_index',
      [event.id],
    );
    expect(storedSeats[0]).toEqual({
      row_index: 0,
      number: 1,
      zone_index: 0,
      price_agorot: 20000,
    });
    expect(storedSeats[26]).toEqual({
      row_index: 26,
      number: 1,
      zone_index: 1,
      price_agorot: 12000,
    });

    const detail = await request(app.getHttpServer())
      .get(`/events/${event.id}`)
      .expect(200);
    expect(detail.body.id).toBe(event.id);
    const list = await request(app.getHttpServer()).get('/events').expect(200);
    expect(list.body).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: event.id })]),
    );
    await request(app.getHttpServer())
      .get(`/events/${randomUUID()}`)
      .expect(404);
    await request(app.getHttpServer()).get('/events/not-an-id').expect(400);
  });

  test('groups ordered rows when zones are provided out of row order', async () => {
    const response = await request(app.getHttpServer())
      .post('/events')
      .send({
        name: 'Show',
        venue: 'Hall',
        eventTime: '2030-07-01T20:00:00Z',
        dropTime: '2030-06-01T10:00:00Z',
        rowCount: 3,
        seatsPerRow: 2,
        zones: [
          { startRow: 1, endRow: 2, priceAgorot: 1000 },
          { startRow: 0, endRow: 0, priceAgorot: 2000 },
        ],
      })
      .expect(201);
    expect(response.body.zones).toEqual([
      { number: 0, priceAgorot: 1000, startRow: 1, endRow: 2 },
      { number: 1, priceAgorot: 2000, startRow: 0, endRow: 0 },
    ]);
    expect(
      response.body.rows.map((row: { zoneNumber: number }) => row.zoneNumber),
    ).toEqual([1, 0, 0]);
    expect(
      response.body.rows.map((row: { seats: unknown[] }) => row.seats.length),
    ).toEqual([2, 2, 2]);
  });

  test('rejects invalid event and zone definitions without creating an event', async () => {
    const valid = {
      name: 'Test',
      venue: 'Hall',
      eventTime: '2030-07-01T20:00:00Z',
      dropTime: '2030-06-01T10:00:00Z',
      rowCount: 2,
      seatsPerRow: 2,
      zones: [{ startRow: 0, endRow: 1, priceAgorot: 1000 }],
    };
    const invalid = [
      { ...valid, name: ' ' },
      { ...valid, eventTime: 'not a time' },
      { ...valid, eventTime: '2030-02-30T20:00:00Z' },
      { ...valid, rowCount: 0 },
      { ...valid, seatsPerRow: 1.5 },
      {
        ...valid,
        rowCount: 101,
        seatsPerRow: 1000,
        zones: [{ startRow: 0, endRow: 100, priceAgorot: 1 }],
      },
      { ...valid, zones: [null] },
      { ...valid, zones: [[{ startRow: 0, endRow: 1, priceAgorot: 1 }]] },
      { ...valid, zones: [{ startRow: -1, endRow: 1, priceAgorot: 1 }] },
      { ...valid, zones: [{ startRow: 0, endRow: 1, priceAgorot: -1 }] },
      { ...valid, zones: [{ startRow: 0, endRow: 0, priceAgorot: 1 }] },
      { ...valid, zones: [{ startRow: 0, endRow: 2, priceAgorot: 1 }] },
      { ...valid, zones: [{ startRow: 1, endRow: 0, priceAgorot: 1 }] },
      {
        ...valid,
        zones: [
          { startRow: 0, endRow: 0, priceAgorot: 1 },
          { startRow: 0, endRow: 1, priceAgorot: 2 },
        ],
      },
    ];
    const beforeCount = Number(
      (await database.query('SELECT count(*) AS count FROM events'))[0].count,
    );
    for (const body of invalid) {
      const response = await request(app.getHttpServer())
        .post('/events')
        .send(body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(response.body.message).toBeTruthy();
    }
    const afterCount = Number(
      (await database.query('SELECT count(*) AS count FROM events'))[0].count,
    );
    expect(afterCount).toBe(beforeCount);
  });

  test('reports DTO errors before checking zone ranges', async () => {
    const response = await request(app.getHttpServer())
      .post('/events')
      .send({
        name: 'Test',
        venue: 'Hall',
        eventTime: '2030-07-01T20:00:00Z',
        dropTime: '2030-06-01T10:00:00Z',
        rowCount: 2,
        seatsPerRow: 2,
        zones: [null],
      });
    expect(response.status).toBe(400);
    expect(response.body.message).toEqual(
      expect.arrayContaining([expect.stringContaining('zones')]),
    );
  });

  test('rolls back event creation if a seat insert fails', async () => {
    await database.query(`
      CREATE FUNCTION fail_seat_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'test insert failure'; END $$
    `);
    await database.query(
      'CREATE TRIGGER fail_seat_insert BEFORE INSERT ON seats FOR EACH ROW EXECUTE FUNCTION fail_seat_insert()',
    );
    try {
      const response = await request(app.getHttpServer())
        .post('/events')
        .send({
          name: 'Rollback',
          venue: 'Hall',
          eventTime: '2030-07-01T20:00:00Z',
          dropTime: '2030-06-01T10:00:00Z',
          rowCount: 1,
          seatsPerRow: 1,
          zones: [{ startRow: 0, endRow: 0, priceAgorot: 1 }],
        });
      expect(response.status).toBe(500);
      const rows = await database.query(
        "SELECT id FROM events WHERE name = 'Rollback'",
      );
      expect(rows).toHaveLength(0);
    } finally {
      await database.query('DROP TRIGGER fail_seat_insert ON seats');
      await database.query('DROP FUNCTION fail_seat_insert()');
    }
  });
});
