import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEvents1794048735619 implements MigrationInterface {
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
      CREATE TABLE zones (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        zone_index integer NOT NULL CHECK (zone_index >= 0),
        price_agorot integer NOT NULL CHECK (price_agorot >= 0),
        UNIQUE (event_id, zone_index),
        UNIQUE (event_id, id)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE event_rows (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
        zone_id uuid NOT NULL,
        row_index integer NOT NULL CHECK (row_index >= 0),
        UNIQUE (event_id, row_index),
        UNIQUE (event_id, id),
        FOREIGN KEY (event_id, zone_id) REFERENCES zones(event_id, id)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE seats (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        event_id uuid NOT NULL,
        row_id uuid NOT NULL,
        number integer NOT NULL CHECK (number > 0),
        UNIQUE (row_id, number),
        FOREIGN KEY (event_id, row_id) REFERENCES event_rows(event_id, id) ON DELETE CASCADE
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE seats');
    await queryRunner.query('DROP TABLE event_rows');
    await queryRunner.query('DROP TABLE zones');
    await queryRunner.query('DROP TABLE events');
  }
}
