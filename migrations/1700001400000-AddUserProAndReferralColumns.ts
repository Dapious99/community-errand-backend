import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserProAndReferralColumns1700001400000
  implements MigrationInterface
{
  name = 'AddUserProAndReferralColumns1700001400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "proExpiresAt" TIMESTAMP`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD "referredByUserId" uuid`
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_users_referredByUserId" FOREIGN KEY ("referredByUserId") REFERENCES "users"("id") ON DELETE SET NULL`
    );

    // referralCode: add nullable, backfill from each row's own id (already
    // globally unique), then tighten to NOT NULL + UNIQUE. Existing rows
    // predate the referral program, so there's nothing else to backfill from.
    await queryRunner.query(
      `ALTER TABLE "users" ADD "referralCode" character varying`
    );
    await queryRunner.query(`
      UPDATE "users"
      SET "referralCode" = UPPER(SUBSTRING(REPLACE(id::text, '-', ''), 1, 8))
      WHERE "referralCode" IS NULL
    `);
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "referralCode" SET NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "UQ_users_referralCode" UNIQUE ("referralCode")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_users_referralCode" ON "users" ("referralCode")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_users_referralCode"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "UQ_users_referralCode"`
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "referralCode"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_users_referredByUserId"`
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "referredByUserId"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "proExpiresAt"`);
  }
}
