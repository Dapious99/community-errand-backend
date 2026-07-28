import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReferrals1700001300000 implements MigrationInterface {
  name = 'AddReferrals1700001300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "referrals_status_enum" AS ENUM ('pending', 'completed', 'void')`
    );

    await queryRunner.query(`
      CREATE TABLE "referrals" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "referrerId" uuid NOT NULL,
        "referredUserId" uuid NOT NULL,
        "status" "referrals_status_enum" NOT NULL DEFAULT 'pending',
        "bonusAmount" numeric(12,2),
        "completedAt" TIMESTAMP,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_referrals_referredUserId" UNIQUE ("referredUserId"),
        CONSTRAINT "PK_referrals" PRIMARY KEY ("id"),
        CONSTRAINT "FK_referrals_referrerId" FOREIGN KEY ("referrerId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_referrals_referredUserId" FOREIGN KEY ("referredUserId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_referrals_referrerId_status" ON "referrals" ("referrerId", "status")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "referrals"`);
    await queryRunner.query(`DROP TYPE "referrals_status_enum"`);
  }
}
