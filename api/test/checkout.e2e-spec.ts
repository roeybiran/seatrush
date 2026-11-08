import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

describe('best available and checkout with PostgreSQL', () => {
  let admin: DataSource;
  let database: DataSource;
  let app: INestApplication;
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
    const url = new URL(originalUrl);
    url.searchParams.set('options', `-c search_path=${schema}`);
    process.env.DATABASE_URL = url.toString();
    process.env.HOLD_TTL_SECONDS = '300';
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

  async function createEvent(dropTime = '2000-01-01T00:00:00Z') {
    const response = await request(app.getHttpServer())
      .post('/events')
      .send({
        name: 'Show',
        venue: 'Hall',
        eventTime: '2099-12-31T00:00:00Z',
        dropTime,
        rowCount: 2,
        seatsPerRow: 8,
        zones: [
          { startRow: 0, endRow: 0, priceAgorot: 2000 },
          { startRow: 1, endRow: 1, priceAgorot: 1000 },
        ],
      })
      .expect(201);
    return response.body.id as string;
  }

  test('OpenAPI describes endpoint bodies, username headers, responses and errors', () => {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('SeatRush API').build(),
    );
    const paths = document.paths;
    expect(Object.keys(paths).sort()).toEqual(
      [
        '/events',
        '/events/{eventId}',
        '/events/{eventId}/holds',
        '/events/{eventId}/holds/best-available',
        '/events/{eventId}/holds/{holdId}',
        '/events/{eventId}/holds/{holdId}/checkout',
        '/my-tickets',
      ].sort(),
    );
    const create = paths['/events']!.post!;
    expect(create.requestBody).toBeDefined();
    expect(create.responses['201']).toBeDefined();
    expect(create.responses['400']).toBeDefined();
    const hold = paths['/events/{eventId}/holds']!.post!;
    expect(hold.requestBody).toBeDefined();
    expect(hold.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'X-Username',
          in: 'header',
          required: true,
        }),
      ]),
    );
    for (const status of ['201', '400', '404', '409'])
      expect(hold.responses[status]).toBeDefined();
    const checkout = paths['/events/{eventId}/holds/{holdId}/checkout']!.post!;
    for (const status of ['201', '400', '403', '404', '409'])
      expect(checkout.responses[status]).toBeDefined();
    const schemas = document.components!.schemas!;
    expect(schemas.CreateEventDto).toMatchObject({
      required: expect.arrayContaining(['name', 'zones', 'rowCount']),
    });
    expect(schemas.CreateHoldDto).toMatchObject({ required: ['seats'] });
    expect(schemas.BestAvailableDto).toMatchObject({
      required: ['count'],
      properties: {
        count: { type: 'integer', minimum: 1, maximum: 4 },
        zoneNumber: { type: 'integer', minimum: 0, nullable: true },
      },
    });
    expect(schemas.CreateHoldDto).toMatchObject({
      properties: { seats: { type: 'array', minItems: 1, maxItems: 4 } },
    });
    expect(schemas.CreateEventDto).toMatchObject({
      properties: { rowCount: { type: 'integer', minimum: 1, maximum: 702 } },
    });
    expect(schemas.EventDetailResponseDto).toMatchObject({
      required: expect.arrayContaining([
        'id',
        'name',
        'serverTime',
        'zones',
        'rows',
      ]),
      properties: { zones: { type: 'array' }, rows: { type: 'array' } },
    });
    expect(schemas.HoldResponseDto).toMatchObject({
      required: expect.arrayContaining([
        'id',
        'seats',
        'expiresAt',
        'serverTime',
      ]),
    });
    expect(schemas.OrderResponseDto).toMatchObject({
      required: expect.arrayContaining([
        'id',
        'holdId',
        'seats',
        'totalAgorot',
      ]),
    });
    expect(schemas.AccountOrderResponseDto).toMatchObject({
      required: expect.arrayContaining(['id', 'event', 'seats', 'totalAgorot']),
    });
    expect(schemas.ReleaseHoldResponseDto).toMatchObject({
      required: ['id', 'status'],
    });
    expect(hold.responses['201']).toMatchObject({
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/HoldResponseDto' },
        },
      },
    });
  });

  test('chooses the nearest row, then middle and lower starting seat, including the brief example', async () => {
    const eventId = await createEvent();
    const endpoint = `/events/${eventId}/holds`;
    const middle = await request(app.getHttpServer())
      .post(`${endpoint}/best-available`)
      .set('X-Username', 'middle')
      .send({ count: 2 })
      .expect(201);
    expect(
      middle.body.seats.map((seat: { seatNumber: number }) => seat.seatNumber),
    ).toEqual([4, 5]);
    await request(app.getHttpServer())
      .delete(`${endpoint}/${middle.body.id}`)
      .set('X-Username', 'middle')
      .expect(200);
    for (const start of [0, 4]) {
      await request(app.getHttpServer())
        .post(endpoint)
        .set('X-Username', `row-${start}`)
        .send({
          seats: Array.from({ length: 4 }, (_, offset) => ({
            rowIndex: 0,
            seatNumber: start + offset + 1,
          })),
        })
        .expect(201);
    }
    const sold = await request(app.getHttpServer())
      .post(endpoint)
      .set('X-Username', 'sold')
      .send({
        seats: [
          { rowIndex: 1, seatNumber: 4 },
          { rowIndex: 1, seatNumber: 5 },
        ],
      })
      .expect(201);
    await request(app.getHttpServer())
      .post(`${endpoint}/${sold.body.id}/checkout`)
      .set('X-Username', 'sold')
      .expect(201);
    const best = await request(app.getHttpServer())
      .post(`${endpoint}/best-available`)
      .set('X-Username', 'fan')
      .send({ count: 2 })
      .expect(201);
    expect(best.body.seats).toEqual([
      { rowIndex: 1, seatNumber: 2, priceAgorot: 1000 },
      { rowIndex: 1, seatNumber: 3, priceAgorot: 1000 },
    ]);
  });

  test('applies filters, validates requests, drop time and seat limit', async () => {
    const eventId = await createEvent();
    const endpoint = `/events/${eventId}/holds/best-available`;
    for (const body of [
      { count: 0 },
      { count: 5 },
      { count: 1.5 },
      { count: 1, zoneNumber: -1 },
      { count: 1, maxPriceAgorot: -1 },
    ]) {
      await request(app.getHttpServer())
        .post(endpoint)
        .set('X-Username', 'fan')
        .send(body)
        .expect(400);
    }
    const best = await request(app.getHttpServer())
      .post(endpoint)
      .set('X-Username', 'fan')
      .send({ count: 3, zoneNumber: 1, maxPriceAgorot: 1000 })
      .expect(201);
    expect(
      best.body.seats.map((seat: { rowIndex: number; seatNumber: number }) => [
        seat.rowIndex,
        seat.seatNumber,
      ]),
    ).toEqual([
      [1, 3],
      [1, 4],
      [1, 5],
    ]);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('X-Username', 'fan')
      .send({ count: 2 })
      .expect(409);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('X-Username', 'other')
      .send({ count: 1, zoneNumber: 0, maxPriceAgorot: 1000 })
      .expect(409);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('X-Username', 'other')
      .send({ count: 1, zoneNumber: 9999999999 })
      .expect(409);
    const future = await createEvent('2099-01-01T00:00:00Z');
    await request(app.getHttpServer())
      .post(`/events/${future}/holds/best-available`)
      .set('X-Username', 'fan')
      .send({ count: 1 })
      .expect(409);
  });

  test('concurrent best-available requests do not assign the same seats', async () => {
    const eventId = await createEvent();
    const responses = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        request(app.getHttpServer())
          .post(`/events/${eventId}/holds/best-available`)
          .set('X-Username', `fan-${index}`)
          .send({ count: 2 }),
      ),
    );
    expect(
      responses.filter((response) => response.status === 201),
    ).toHaveLength(6);
    expect(
      responses.filter((response) => response.status === 409),
    ).toHaveLength(6);
    const coordinates = responses
      .filter((response) => response.status === 201)
      .flatMap((response) =>
        response.body.seats.map(
          (seat: { rowIndex: number; seatNumber: number }) =>
            `${seat.rowIndex}:${seat.seatNumber}`,
        ),
      );
    expect(new Set(coordinates).size).toBe(12);
  });

  test('checkout is owner-only, atomic and idempotent even after expiry', async () => {
    const eventId = await createEvent();
    const endpoint = `/events/${eventId}/holds`;
    const hold = await request(app.getHttpServer())
      .post(endpoint)
      .set('X-Username', 'owner')
      .send({
        seats: [
          { rowIndex: 0, seatNumber: 1 },
          { rowIndex: 1, seatNumber: 1 },
        ],
      })
      .expect(201);
    const checkout = `${endpoint}/${hold.body.id}/checkout`;
    await request(app.getHttpServer())
      .post(checkout)
      .set('X-Username', 'other')
      .expect(403);
    const responses = await Promise.all(
      Array.from({ length: 12 }, () =>
        request(app.getHttpServer()).post(checkout).set('X-Username', 'owner'),
      ),
    );
    expect(responses.every((response) => response.status === 201)).toBe(true);
    expect(
      responses.every(
        (response) =>
          JSON.stringify(response.body) === JSON.stringify(responses[0].body),
      ),
    ).toBe(true);
    expect(responses[0].body).toMatchObject({
      holdId: hold.body.id,
      eventId,
      totalAgorot: 3000,
      seats: hold.body.seats,
    });
    expect(
      await database.query('SELECT id FROM orders WHERE hold_id = $1', [
        hold.body.id,
      ]),
    ).toHaveLength(1);
    await database.query(
      "UPDATE holds SET expires_at = clock_timestamp() - interval '1 second' WHERE id = $1",
      [hold.body.id],
    );
    const retry = await request(app.getHttpServer())
      .post(checkout)
      .set('X-Username', 'owner')
      .expect(201);
    expect(retry.body).toEqual(responses[0].body);
    const map = await request(app.getHttpServer())
      .get(`/events/${eventId}`)
      .expect(200);
    expect(map.body.rows[0].seats[0].status).toBe('sold');
    await request(app.getHttpServer())
      .post(endpoint)
      .set('X-Username', 'other')
      .send({ seats: [{ rowIndex: 0, seatNumber: 1 }] })
      .expect(409);
    await request(app.getHttpServer())
      .delete(`${endpoint}/${hold.body.id}`)
      .set('X-Username', 'owner')
      .expect(409);
  });

  test('best available can reclaim an expired hold without cleanup', async () => {
    const eventId = await createEvent();
    const endpoint = `/events/${eventId}/holds`;
    const hold = await request(app.getHttpServer())
      .post(endpoint)
      .set('X-Username', 'first')
      .send({
        seats: [
          { rowIndex: 0, seatNumber: 4 },
          { rowIndex: 0, seatNumber: 5 },
        ],
      })
      .expect(201);
    await database.query(
      "UPDATE holds SET expires_at = clock_timestamp() - interval '1 second' WHERE id = $1",
      [hold.body.id],
    );
    const best = await request(app.getHttpServer())
      .post(`${endpoint}/best-available`)
      .set('X-Username', 'second')
      .send({ count: 2 })
      .expect(201);
    expect(
      best.body.seats.map((seat: { seatNumber: number }) => seat.seatNumber),
    ).toEqual([4, 5]);
    expect(
      await database.query('SELECT id FROM holds WHERE id = $1', [
        hold.body.id,
      ]),
    ).toHaveLength(1);
  });

  test('my account lists only the username’s checked-out orders with event and ticket details', async () => {
    const eventId = await createEvent();
    const secondEventId = await createEvent();
    const endpoint = `/events/${eventId}/holds`;
    const firstHold = await request(app.getHttpServer())
      .post(endpoint)
      .set('X-Username', 'account-owner')
      .send({
        seats: [
          { rowIndex: 1, seatNumber: 2 },
          { rowIndex: 0, seatNumber: 1 },
        ],
      })
      .expect(201);
    const firstOrder = await request(app.getHttpServer())
      .post(`${endpoint}/${firstHold.body.id}/checkout`)
      .set('X-Username', 'account-owner')
      .expect(201);
    const secondHold = await request(app.getHttpServer())
      .post(`/events/${secondEventId}/holds`)
      .set('X-Username', 'account-owner')
      .send({ seats: [{ rowIndex: 0, seatNumber: 3 }] })
      .expect(201);
    const secondOrder = await request(app.getHttpServer())
      .post(`/events/${secondEventId}/holds/${secondHold.body.id}/checkout`)
      .set('X-Username', 'account-owner')
      .expect(201);
    const otherHold = await request(app.getHttpServer())
      .post(endpoint)
      .set('X-Username', 'someone-else')
      .send({ seats: [{ rowIndex: 0, seatNumber: 4 }] })
      .expect(201);
    await request(app.getHttpServer())
      .post(`${endpoint}/${otherHold.body.id}/checkout`)
      .set('X-Username', 'someone-else')
      .expect(201);
    await request(app.getHttpServer())
      .post(endpoint)
      .set('X-Username', 'account-owner')
      .send({ seats: [{ rowIndex: 0, seatNumber: 5 }] })
      .expect(201);
    await database.query(
      "UPDATE holds SET expires_at = clock_timestamp() - interval '1 second' WHERE id = $1",
      [firstHold.body.id],
    );

    await request(app.getHttpServer()).get('/my-tickets').expect(400);
    const empty = await request(app.getHttpServer())
      .get('/my-tickets')
      .set('X-Username', 'no-orders')
      .expect(200);
    expect(empty.body).toEqual([]);
    const account = await request(app.getHttpServer())
      .get('/my-tickets')
      .set('X-Username', ' account-owner ')
      .expect(200);
    expect(account.body).toHaveLength(2);
    expect(account.body).toEqual(
      expect.arrayContaining([
        {
          id: firstOrder.body.id,
          holdId: firstHold.body.id,
          eventId,
          event: {
            name: 'Show',
            venue: 'Hall',
            eventTime: '2099-12-31T00:00:00.000Z',
          },
          seats: [
            { rowIndex: 0, seatNumber: 1, priceAgorot: 2000 },
            { rowIndex: 1, seatNumber: 2, priceAgorot: 1000 },
          ],
          totalAgorot: 3000,
        },
        {
          id: secondOrder.body.id,
          holdId: secondHold.body.id,
          eventId: secondEventId,
          event: {
            name: 'Show',
            venue: 'Hall',
            eventTime: '2099-12-31T00:00:00.000Z',
          },
          seats: [{ rowIndex: 0, seatNumber: 3, priceAgorot: 2000 }],
          totalAgorot: 2000,
        },
      ]),
    );
    const other = await request(app.getHttpServer())
      .get('/my-tickets')
      .set('X-Username', 'someone-else')
      .expect(200);
    expect(other.body).toHaveLength(1);
    expect(other.body[0].holdId).toBe(otherHold.body.id);
    const caseSensitive = await request(app.getHttpServer())
      .get('/my-tickets')
      .set('X-Username', 'Account-owner')
      .expect(200);
    expect(caseSensitive.body).toEqual([]);
  });

  test('checkout wins against a competing hold for an unexpired seat', async () => {
    const eventId = await createEvent();
    const endpoint = `/events/${eventId}/holds`;
    const hold = await request(app.getHttpServer())
      .post(endpoint)
      .set('X-Username', 'owner')
      .send({ seats: [{ rowIndex: 0, seatNumber: 1 }] })
      .expect(201);
    const results = await Promise.all([
      request(app.getHttpServer())
        .post(`${endpoint}/${hold.body.id}/checkout`)
        .set('X-Username', 'owner'),
      request(app.getHttpServer())
        .post(endpoint)
        .set('X-Username', 'other')
        .send({ seats: [{ rowIndex: 0, seatNumber: 1 }] }),
    ]);
    expect(results.map((response) => response.status)).toEqual([201, 409]);
    expect(
      await database.query('SELECT id FROM orders WHERE hold_id = $1', [
        hold.body.id,
      ]),
    ).toHaveLength(1);
  });

  test('expired holds cannot be checked out even when the seats are re-held', async () => {
    const eventId = await createEvent();
    const endpoint = `/events/${eventId}/holds`;
    const hold = await request(app.getHttpServer())
      .post(endpoint)
      .set('X-Username', 'owner')
      .send({ seats: [{ rowIndex: 0, seatNumber: 1 }] })
      .expect(201);
    await database.query(
      "UPDATE holds SET expires_at = clock_timestamp() - interval '1 second' WHERE id = $1",
      [hold.body.id],
    );
    const results = await Promise.all([
      request(app.getHttpServer())
        .post(`${endpoint}/${hold.body.id}/checkout`)
        .set('X-Username', 'owner'),
      request(app.getHttpServer())
        .post(endpoint)
        .set('X-Username', 'other')
        .send({ seats: [{ rowIndex: 0, seatNumber: 1 }] }),
    ]);
    expect(results.map((response) => response.status)).toEqual([409, 201]);
    expect(
      await database.query('SELECT id FROM orders WHERE hold_id = $1', [
        hold.body.id,
      ]),
    ).toHaveLength(0);
  });
});
