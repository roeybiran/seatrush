import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';

describe('event API with PostgreSQL', () => {
  let admin: DataSource;
  let app: INestApplication;
  let database: DataSource;
  let baseUrl: string;
  let schemaCreated = false;
  const schema = `seatrush_test_${randomUUID().replaceAll('-', '')}`;
  const originalUrl = process.env.DATABASE_URL;

  before(async () => {
    assert.ok(originalUrl, 'Set DATABASE_URL to a PostgreSQL database where the user can create schemas.');
    admin = new DataSource({ type: 'postgres', url: originalUrl });
    await admin.initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    const testUrl = new URL(originalUrl);
    testUrl.searchParams.set('options', `-c search_path=${schema}`);
    process.env.DATABASE_URL = testUrl.toString();
    const { AppModule } = await import('../src/app.module');
    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
    database = app.get(DataSource);
    await database.runMigrations();
    await app.listen(0, '127.0.0.1');
    baseUrl = await app.getUrl();
  });

  after(async () => {
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
    const response = await fetch(`${baseUrl}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Opening Night',
        venue: 'Hall',
        eventTime: '2030-07-01T20:00:00Z',
        dropTime: '2030-06-01T10:00:00Z',
        rowCount: 27,
        seatsPerRow: 2,
        zones: [
          { name: 'Front', priceAgorot: 20000, rows: ['A', 'B'] },
          { name: 'Back', priceAgorot: 12000, rows: 'CDEFGHIJKLMNOPQRSTUVWXYZ'.split('').concat('AA') },
        ],
      }),
    });
    assert.equal(response.status, 201);
    const event = await response.json() as {
      id: string; name: string; serverTime: string;
      zones: Array<{ id: string; name: string; priceAgorot: number }>;
      rows: Array<{ label: string; zoneId: string; seats: Array<{ id: string; status: string }> }>;
    };
    assert.equal(event.name, 'Opening Night');
    assert.ok(!Number.isNaN(Date.parse(event.serverTime)));
    assert.equal(event.rows.length, 27);
    assert.deepEqual([event.rows[0].label, event.rows[25].label, event.rows[26].label], ['A', 'Z', 'AA']);
    assert.deepEqual(event.rows[26].seats.map((seat) => seat.id), ['AA1', 'AA2']);
    assert.ok(event.rows.every((row) => row.seats.every((seat) => seat.status === 'available')));
    const front = event.zones.find((zone) => zone.name === 'Front');
    const back = event.zones.find((zone) => zone.name === 'Back');
    assert.equal(front?.priceAgorot, 20000);
    assert.equal(back?.priceAgorot, 12000);
    assert.equal(event.rows[0].zoneId, front?.id);
    assert.equal(event.rows[26].zoneId, back?.id);

    const detail = await fetch(`${baseUrl}/events/${event.id}`);
    assert.equal(detail.status, 200);
    assert.equal((await detail.json() as { id: string }).id, event.id);
    const list = await fetch(`${baseUrl}/events`);
    assert.equal(list.status, 200);
    assert.ok((await list.json() as Array<{ id: string }>).some((item) => item.id === event.id));
    assert.equal((await fetch(`${baseUrl}/events/${randomUUID()}`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/events/not-an-id`)).status, 400);
  });

  test('rejects invalid event and zone definitions without creating an event', async () => {
    const valid = {
      name: 'Test', venue: 'Hall', eventTime: '2030-07-01T20:00:00Z',
      dropTime: '2030-06-01T10:00:00Z', rowCount: 2, seatsPerRow: 2,
      zones: [{ name: 'Main', priceAgorot: 1000, rows: ['A', 'B'] }],
    };
    const invalid = [
      { ...valid, name: ' ' },
      { ...valid, eventTime: 'not a time' },
      { ...valid, eventTime: '2030-02-30T20:00:00Z' },
      { ...valid, rowCount: 0 },
      { ...valid, seatsPerRow: 1.5 },
      { ...valid, zones: [{ name: 'Main', priceAgorot: -1, rows: ['A', 'B'] }] },
      { ...valid, zones: [{ name: 'Main', priceAgorot: 1, rows: ['A'] }] },
      { ...valid, zones: [{ name: 'Main', priceAgorot: 1, rows: ['A', 'C'] }] },
      { ...valid, zones: [{ name: 'Main', priceAgorot: 1, rows: ['A', 'A', 'B'] }] },
      { ...valid, zones: [
        { name: 'Front', priceAgorot: 1, rows: ['A'] },
        { name: 'Back', priceAgorot: 2, rows: ['A', 'B'] },
      ] },
      { ...valid, zones: [
        { name: 'Same', priceAgorot: 1, rows: ['A'] },
        { name: 'Same', priceAgorot: 2, rows: ['B'] },
      ] },
    ];
    const beforeCount = Number((await database.query('SELECT count(*) AS count FROM events'))[0].count);
    for (const body of invalid) {
      const response = await fetch(`${baseUrl}/events`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      assert.equal(response.status, 400, JSON.stringify(body));
      assert.ok((await response.json() as { message: string }).message);
    }
    const afterCount = Number((await database.query('SELECT count(*) AS count FROM events'))[0].count);
    assert.equal(afterCount, beforeCount);
  });

  test('rolls back event creation if a seat insert fails', async () => {
    await database.query(`
      CREATE FUNCTION fail_seat_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'test insert failure'; END $$
    `);
    await database.query('CREATE TRIGGER fail_seat_insert BEFORE INSERT ON seats FOR EACH ROW EXECUTE FUNCTION fail_seat_insert()');
    try {
      const response = await fetch(`${baseUrl}/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Rollback', venue: 'Hall', eventTime: '2030-07-01T20:00:00Z',
          dropTime: '2030-06-01T10:00:00Z', rowCount: 1, seatsPerRow: 1,
          zones: [{ name: 'Main', priceAgorot: 1, rows: ['A'] }],
        }),
      });
      assert.equal(response.status, 500);
      const rows = await database.query("SELECT id FROM events WHERE name = 'Rollback'");
      assert.equal(rows.length, 0);
    } finally {
      await database.query('DROP TRIGGER fail_seat_insert ON seats');
      await database.query('DROP FUNCTION fail_seat_insert()');
    }
  });
});
