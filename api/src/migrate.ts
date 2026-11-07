import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { CreateEvents1730000000000 } from './migrations/1730000000000-create-events';

async function migrate() {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
    migrations: [CreateEvents1730000000000],
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
