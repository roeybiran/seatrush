import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { CreateSeatRushSchema1794048735619 } from './migrations/001-create-seatrush-schema';

async function migrate() {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    migrations: [CreateSeatRushSchema1794048735619],
  });
  await dataSource.initialize();
  try {
    await dataSource.runMigrations();
  } finally {
    await dataSource.destroy();
  }
}

void migrate().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
