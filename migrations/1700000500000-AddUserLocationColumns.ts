import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserLocationColumns1700000500000 implements MigrationInterface {
  name = 'AddUserLocationColumns1700000500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "lastLatitude" numeric(10,8)`);
    await queryRunner.query(`ALTER TABLE "users" ADD "lastLongitude" numeric(11,8)`);
    await queryRunner.query(`ALTER TABLE "users" ADD "lastLocationAt" TIMESTAMP`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "lastLocationAt"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "lastLongitude"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "lastLatitude"`);
  }
}
