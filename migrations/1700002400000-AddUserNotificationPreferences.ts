import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserNotificationPreferences1700002400000 implements MigrationInterface {
  name = 'AddUserNotificationPreferences1700002400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "notifyNewErrandsNearby" boolean NOT NULL DEFAULT true`
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "notifyBoostedErrandAlerts" boolean NOT NULL DEFAULT true`
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "notifyNewMessages" boolean NOT NULL DEFAULT true`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "notifyNewMessages"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "notifyBoostedErrandAlerts"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "notifyNewErrandsNearby"`);
  }
}
