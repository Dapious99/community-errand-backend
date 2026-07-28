import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubscriptions1700001200000 implements MigrationInterface {
  name = 'AddSubscriptions1700001200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "subscriptions_plan_enum" AS ENUM ('monthly', 'quarterly', 'semi_annual', 'annual')`
    );
    await queryRunner.query(
      `CREATE TYPE "subscriptions_status_enum" AS ENUM ('active', 'expired', 'cancelled')`
    );

    await queryRunner.query(`
      CREATE TABLE "subscriptions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "plan" "subscriptions_plan_enum" NOT NULL,
        "status" "subscriptions_status_enum" NOT NULL DEFAULT 'active',
        "startedAt" TIMESTAMP NOT NULL,
        "expiresAt" TIMESTAMP NOT NULL,
        "autoRenew" boolean NOT NULL DEFAULT false,
        "amountPaid" numeric(12,2) NOT NULL,
        "walletTransactionId" character varying,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_subscriptions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_subscriptions_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_subscriptions_userId_status" ON "subscriptions" ("userId", "status")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "subscriptions"`);
    await queryRunner.query(`DROP TYPE "subscriptions_status_enum"`);
    await queryRunner.query(`DROP TYPE "subscriptions_plan_enum"`);
  }
}
