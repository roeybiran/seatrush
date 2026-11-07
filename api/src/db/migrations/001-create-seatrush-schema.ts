import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSeatRushSchema1794048735619 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name text NOT NULL CHECK (length(trim(name)) > 0),
        venue text NOT NULL CHECK (length(trim(venue)) > 0),
        event_time timestamptz NOT NULL,
        drop_time timestamptz NOT NULL,
        row_count integer NOT NULL CHECK (row_count > 0),
        seats_per_row integer NOT NULL CHECK (seats_per_row > 0)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE seats (
        event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        row_index integer NOT NULL CHECK (row_index >= 0),
        number integer NOT NULL CHECK (number >= 0),
        zone_index integer NOT NULL CHECK (zone_index >= 0),
        price_agorot integer NOT NULL CHECK (price_agorot >= 0),
        hold_id uuid,
        PRIMARY KEY (event_id, row_index, number)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE holds (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id uuid NOT NULL REFERENCES events(id),
        username text NOT NULL CHECK (length(trim(username)) > 0),
        created_at timestamptz NOT NULL,
        expires_at timestamptz NOT NULL,
        UNIQUE (event_id, id)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE orders (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        hold_id uuid NOT NULL UNIQUE REFERENCES holds(id)
      )
    `);
    await queryRunner.query(`
      ALTER TABLE seats ADD FOREIGN KEY (event_id, hold_id)
        REFERENCES holds(event_id, id) ON DELETE SET NULL (hold_id)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE seats');
    await queryRunner.query('DROP TABLE orders');
    await queryRunner.query('DROP TABLE holds');
    await queryRunner.query('DROP TABLE events');
  }
}
