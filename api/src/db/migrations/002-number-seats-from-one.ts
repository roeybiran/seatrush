import { MigrationInterface, QueryRunner } from 'typeorm';

/** Seats are numbered from 1, as printed on tickets (B7 is the seventh seat in row B). */
export class NumberSeatsFromOne1794048735620 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE seats DROP CONSTRAINT seats_number_check',
    );
    // Shift through negative values so no row collides with the primary key mid-update.
    await queryRunner.query('UPDATE seats SET number = -number - 1');
    await queryRunner.query('UPDATE seats SET number = -number');
    await queryRunner.query(
      'ALTER TABLE seats ADD CONSTRAINT seats_number_check CHECK (number >= 1)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE seats DROP CONSTRAINT seats_number_check',
    );
    await queryRunner.query('UPDATE seats SET number = -number');
    await queryRunner.query('UPDATE seats SET number = -number - 1');
    await queryRunner.query(
      'ALTER TABLE seats ADD CONSTRAINT seats_number_check CHECK (number >= 0)',
    );
  }
}
