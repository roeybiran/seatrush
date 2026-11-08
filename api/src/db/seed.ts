import 'reflect-metadata';
import { DataSource } from 'typeorm';

async function seed() {
  const dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL,
  });
  await dataSource.initialize();
  try {
    await dataSource.query(`
      WITH demo AS (
        INSERT INTO events (id, name, venue, event_time, drop_time, row_count, seats_per_row)
        VALUES (
          'b8c53910-6c0c-4a9c-a885-e6cce50eb004', 'SeatRush Live', 'Main Hall',
          now() + interval '1 year', now() - interval '1 day', 6, 10
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      )
      INSERT INTO seats (event_id, row_index, number, zone_index, price_agorot)
      SELECT demo.id, row_index, number,
        CASE WHEN row_index < 2 THEN 0 ELSE 1 END,
        CASE WHEN row_index < 2 THEN 20000 ELSE 12000 END
      FROM demo CROSS JOIN generate_series(0, 5) AS row_index
        CROSS JOIN generate_series(0, 9) AS number
    `);
  } finally {
    await dataSource.destroy();
  }
}

void seed().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
