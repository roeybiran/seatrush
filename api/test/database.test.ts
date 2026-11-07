import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

test('the application connects to PostgreSQL', async () => {
  assert.ok(process.env.DATABASE_URL, 'Set DATABASE_URL to a test PostgreSQL database');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
    abortOnError: false,
  });

  try {
    const dataSource = app.get(DataSource);
    const rows: Array<{ database: string }> = await dataSource.query(
      'SELECT current_database() AS database',
    );
    assert.ok(rows[0]?.database);
  } finally {
    await app.close();
  }
});
