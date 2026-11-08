import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

describe('seat holds with PostgreSQL', () => {
  let admin: DataSource;
  let app: INestApplication;
  let database: DataSource;
  let schemaCreated = false;
  const schema = `seatrush_test_${randomUUID().replaceAll('-', '')}`;
  const originalUrl = process.env.DATABASE_URL;
  const originalTtl = process.env.HOLD_TTL_SECONDS;
  const originalLimit = process.env.MAX_SEATS_PER_USER;

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
    process.env.HOLD_TTL_SECONDS = '3';
    process.env.MAX_SEATS_PER_USER = '4';
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
    if (originalTtl === undefined) delete process.env.HOLD_TTL_SECONDS;
    else process.env.HOLD_TTL_SECONDS = originalTtl;
    if (originalLimit === undefined) delete process.env.MAX_SEATS_PER_USER;
    else process.env.MAX_SEATS_PER_USER = originalLimit;
  });

  async function createEvent(
    dropTime = '2000-01-01T00:00:00Z',
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/events')
      .send({
        name: 'Show',
        venue: 'Hall',
        eventTime: '2099-12-31T00:00:00Z',
        dropTime,
        rowCount: 1,
        seatsPerRow: 8,
        zones: [{ startRow: 0, endRow: 0, priceAgorot: 1000 }],
      })
      .expect(201);
    return response.body.id as string;
  }

  test('rejects holds before the drop and invalid requests', async () => {
    const future = await createEvent('2099-01-01T00:00:00Z');
    await request(app.getHttpServer())
      .post(`/events/${future}/holds`)
      .set('X-Username', 'fan')
      .send({ seats: [{ rowIndex: 0, seatNumber: 1 }] })
      .expect(409);
    const eventId = await createEvent();
    const endpoint = `/events/${eventId}/holds`;
    await request(app.getHttpServer())
      .post(endpoint)
      .send({ seats: [{ rowIndex: 0, seatNumber: 1 }] })
      .expect(400);
    for (const seats of [
      [],
      [
        { rowIndex: 0, seatNumber: 1 },
        { rowIndex: 0, seatNumber: 1 },
      ],
      Array.from({ length: 5 }, (_, index) => ({
        rowIndex: 0,
        seatNumber: index + 1,
      })),
      [{ rowIndex: 0, seatNumber: 9 }],
      [{ rowIndex: 0, seatNumber: 2147483647 }],
      [{ rowIndex: -1, seatNumber: 1 }],
      [{ rowIndex: 1, seatNumber: 1 }],
      [{ rowIndex: 0, seatNumber: 0 }],
    ]) {
      await request(app.getHttpServer())
        .post(endpoint)
        .set('X-Username', 'fan')
        .send({ seats })
        .expect(400);
    }
  });

  test('holds all requested seats or none, and only the owner can release', async () => {
    const eventId = await createEvent();
    const endpoint = `/events/${eventId}/holds`;
    const first = await request(app.getHttpServer())
      .post(endpoint)
      .set('X-Username', ' Alice ')
      .send({ seats: [{ rowIndex: 0, seatNumber: 1 }] })
      .expect(201);
    expect(first.body.seats).toEqual([
      { rowIndex: 0, seatNumber: 1, priceAgorot: 1000 },
    ]);
    expect(
      await database.query('SELECT number FROM seats WHERE hold_id = $1', [
        first.body.id,
      ]),
    ).toEqual([{ number: 1 }]);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('X-Username', 'Bob')
      .send({
        seats: [
          { rowIndex: 0, seatNumber: 1 },
          { rowIndex: 0, seatNumber: 2 },
        ],
      })
      .expect(409)
      .expect((response) =>
        expect(response.body).toMatchObject({
          code: 'SEATS_UNAVAILABLE',
          message: 'Someone just took A1.',
          seats: [{ rowIndex: 0, seatNumber: 1 }],
        }),
      );
    // A fan's own held seat is not reported as taken by someone else.
    await request(app.getHttpServer())
      .post(endpoint)
      .set('X-Username', 'Alice')
      .send({ seats: [{ rowIndex: 0, seatNumber: 1 }] })
      .expect(409)
      .expect((response) =>
        expect(response.body).toMatchObject({
          code: 'SEATS_UNAVAILABLE',
          message: 'You already have A1.',
          seats: [{ rowIndex: 0, seatNumber: 1 }],
        }),
      );
    const map = await request(app.getHttpServer())
      .get(`/events/${eventId}`)
      .expect(200);
    expect(
      map.body.rows[0].seats
        .slice(0, 2)
        .map((seat: { status: string }) => seat.status),
    ).toEqual(['held', 'available']);
    await request(app.getHttpServer())
      .delete(`${endpoint}/${first.body.id}`)
      .set('X-Username', 'Bob')
      .expect(403);
    await request(app.getHttpServer())
      .delete(`${endpoint}/${first.body.id}`)
      .set('X-Username', 'Alice')
      .expect(200);
    const released = await database.query(
      'SELECT id FROM holds WHERE id = $1',
      [first.body.id],
    );
    expect(released).toHaveLength(0);
    expect(
      await database.query('SELECT number FROM seats WHERE hold_id = $1', [
        first.body.id,
      ]),
    ).toHaveLength(0);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('X-Username', 'Bob')
      .send({
        seats: [
          { rowIndex: 0, seatNumber: 1 },
          { rowIndex: 0, seatNumber: 2 },
        ],
      })
      .expect(201);
  });

  test('matches exact coordinates across rows including row 26 and seat 27', async () => {
    const event = await request(app.getHttpServer())
      .post('/events')
      .send({
        name: 'Show',
        venue: 'Hall',
        eventTime: '2099-12-31T00:00:00Z',
        dropTime: '2000-01-01T00:00:00Z',
        rowCount: 27,
        seatsPerRow: 27,
        zones: [{ startRow: 0, endRow: 26, priceAgorot: 1000 }],
      })
      .expect(201);
    const endpoint = `/events/${event.body.id}/holds`;
    await request(app.getHttpServer())
      .post(endpoint)
      .set('X-Username', 'first')
      .send({
        seats: [
          { rowIndex: 0, seatNumber: 27 },
          { rowIndex: 26, seatNumber: 1 },
        ],
      })
      .expect(201);
    const second = await request(app.getHttpServer())
      .post(endpoint)
      .set('X-Username', 'second')
      .send({
        seats: [
          { rowIndex: 0, seatNumber: 1 },
          { rowIndex: 26, seatNumber: 27 },
        ],
      })
      .expect(201);
    expect(second.body.seats).toEqual([
      { rowIndex: 0, seatNumber: 1, priceAgorot: 1000 },
      { rowIndex: 26, seatNumber: 27, priceAgorot: 1000 },
    ]);
    const map = await request(app.getHttpServer())
      .get(`/events/${event.body.id}`)
      .expect(200);
    expect(map.body.rows[26].rowIndex).toBe(26);
    expect(map.body.rows[26].seats[26]).toEqual({
      seatNumber: 27,
      status: 'held',
    });
  });

  test('exactly one of 50 fans can hold the same seat', async () => {
    const eventId = await createEvent();
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, index) =>
        request(app.getHttpServer())
          .post(`/events/${eventId}/holds`)
          .set('X-Username', `fan-${index}`)
          .send({ seats: [{ rowIndex: 0, seatNumber: 1 }] }),
      ),
    );
    expect(results.filter((result) => result.status === 201)).toHaveLength(1);
    expect(results.filter((result) => result.status === 409)).toHaveLength(49);
    const rows = await database.query(
      'SELECT count(*) AS count FROM holds WHERE event_id = $1',
      [eventId],
    );
    expect(Number(rows[0].count)).toBe(1);
  });

  test('enforces the fan limit across concurrent requests', async () => {
    const eventId = await createEvent();
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        request(app.getHttpServer())
          .post(`/events/${eventId}/holds`)
          .set('X-Username', 'same-fan')
          .send({ seats: [{ rowIndex: 0, seatNumber: index + 1 }] }),
      ),
    );
    expect(results.filter((result) => result.status === 201)).toHaveLength(4);
    expect(results.filter((result) => result.status === 409)).toHaveLength(4);
  });

  test('expired holds stop blocking seats and remain in the database', async () => {
    const eventId = await createEvent();
    const endpoint = `/events/${eventId}/holds`;
    const hold = await request(app.getHttpServer())
      .post(endpoint)
      .set('X-Username', 'fan')
      .send({ seats: [{ rowIndex: 0, seatNumber: 1 }] })
      .expect(201);
    await delay(3200);
    const map = await request(app.getHttpServer())
      .get(`/events/${eventId}`)
      .expect(200);
    expect(map.body.rows[0].seats[0].status).toBe('available');
    await request(app.getHttpServer())
      .delete(`${endpoint}/${hold.body.id}`)
      .set('X-Username', 'fan')
      .expect(409);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('X-Username', 'other')
      .send({ seats: [{ rowIndex: 0, seatNumber: 1 }] })
      .expect(201);
    const stored = await database.query('SELECT id FROM holds WHERE id = $1', [
      hold.body.id,
    ]);
    expect(stored).toHaveLength(1);
  }, 10000);

  test('releasing an expired hold leaves it in place', async () => {
    const eventId = await createEvent();
    const endpoint = `/events/${eventId}/holds`;
    const hold = await request(app.getHttpServer())
      .post(endpoint)
      .set('X-Username', 'fan')
      .send({ seats: [{ rowIndex: 0, seatNumber: 1 }] })
      .expect(201);
    await database.query(
      "UPDATE holds SET expires_at = clock_timestamp() - interval '1 second' WHERE id = $1",
      [hold.body.id],
    );
    await request(app.getHttpServer())
      .delete(`${endpoint}/${hold.body.id}`)
      .set('X-Username', 'fan')
      .expect(409);
    expect(
      await database.query('SELECT id FROM holds WHERE id = $1', [
        hold.body.id,
      ]),
    ).toHaveLength(1);
  });

  test('an associated order keeps an expired hold sold and counts toward the fan limit', async () => {
    const eventId = await createEvent();
    const endpoint = `/events/${eventId}/holds`;
    const hold = await request(app.getHttpServer())
      .post(endpoint)
      .set('X-Username', 'fan')
      .send({
        seats: Array.from({ length: 4 }, (_, index) => ({
          rowIndex: 0,
          seatNumber: index + 1,
        })),
      })
      .expect(201);
    await database.query('INSERT INTO orders (hold_id) VALUES ($1)', [
      hold.body.id,
    ]);
    await database.query(
      "UPDATE holds SET expires_at = clock_timestamp() - interval '1 second' WHERE id = $1",
      [hold.body.id],
    );

    const map = await request(app.getHttpServer())
      .get(`/events/${eventId}`)
      .expect(200);
    expect(
      map.body.rows[0].seats
        .slice(0, 4)
        .map((seat: { status: string }) => seat.status),
    ).toEqual(['sold', 'sold', 'sold', 'sold']);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('X-Username', 'other')
      .send({ seats: [{ rowIndex: 0, seatNumber: 1 }] })
      .expect(409);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('X-Username', 'fan')
      .send({ seats: [{ rowIndex: 0, seatNumber: 5 }] })
      .expect(409);
    await request(app.getHttpServer())
      .delete(`${endpoint}/${hold.body.id}`)
      .set('X-Username', 'fan')
      .expect(409);
    expect(
      await database.query('SELECT id FROM holds WHERE id = $1', [
        hold.body.id,
      ]),
    ).toHaveLength(1);
  });

  test('lists only the fan’s active holds so another tab can resume them', async () => {
    const eventId = await createEvent();
    const endpoint = `/events/${eventId}/holds`;
    const expired = await request(app.getHttpServer())
      .post(endpoint)
      .set('X-Username', 'fan')
      .send({ seats: [{ rowIndex: 0, seatNumber: 1 }] })
      .expect(201);
    await database.query(
      "UPDATE holds SET expires_at = clock_timestamp() - interval '1 second' WHERE id = $1",
      [expired.body.id],
    );
    const active = await request(app.getHttpServer())
      .post(endpoint)
      .set('X-Username', 'fan')
      .send({
        seats: [
          { rowIndex: 0, seatNumber: 3 },
          { rowIndex: 0, seatNumber: 4 },
        ],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('X-Username', 'other')
      .send({ seats: [{ rowIndex: 0, seatNumber: 6 }] })
      .expect(201);

    const listed = await request(app.getHttpServer())
      .get(endpoint)
      .set('X-Username', 'fan')
      .expect(200);
    expect(listed.body).toEqual([
      {
        id: active.body.id,
        eventId,
        seats: [
          { rowIndex: 0, seatNumber: 3, priceAgorot: 1000 },
          { rowIndex: 0, seatNumber: 4, priceAgorot: 1000 },
        ],
        expiresAt: active.body.expiresAt,
        serverTime: expect.any(String),
      },
    ]);
    await request(app.getHttpServer())
      .post(`${endpoint}/${active.body.id}/checkout`)
      .set('X-Username', 'fan')
      .expect(201);
    await request(app.getHttpServer())
      .get(endpoint)
      .set('X-Username', 'fan')
      .expect(200, []);
    await request(app.getHttpServer())
      .get(`/events/${randomUUID()}/holds`)
      .set('X-Username', 'fan')
      .expect(404);
    await request(app.getHttpServer()).get(endpoint).expect(400);
  });
});
