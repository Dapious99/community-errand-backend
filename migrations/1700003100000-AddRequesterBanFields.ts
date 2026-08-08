import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRequesterBanFields1700003100000 implements MigrationInterface {
  name = 'AddRequesterBanFields1700003100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "consecutivePostingFailures" integer NOT NULL DEFAULT 0`
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "requesterBannedUntil" TIMESTAMP`
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "postingBanEscalationLevel" integer NOT NULL DEFAULT 0`
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "permanentlyBannedFromPosting" boolean NOT NULL DEFAULT false`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "permanentlyBannedFromPosting"`
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "postingBanEscalationLevel"`
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "requesterBannedUntil"`
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "consecutivePostingFailures"`
    );
  }
}
