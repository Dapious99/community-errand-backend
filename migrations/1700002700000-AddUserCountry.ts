import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserCountry1700002700000 implements MigrationInterface {
  name = 'AddUserCountry1700002700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "country" character varying`);
    // Backfill existing accounts - this platform has only ever operated in
    // Nigeria up to this point.
    await queryRunner.query(
      `UPDATE "users" SET "country" = 'Nigeria' WHERE "country" IS NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "country"`);
  }
}
