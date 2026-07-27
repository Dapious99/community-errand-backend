import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWalletTransactions1700001000000 implements MigrationInterface {
  name = 'AddWalletTransactions1700001000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "wallet_transactions_type_enum" AS ENUM ('earning', 'withdrawal', 'bill_purchase', 'reversal')`
    );
    await queryRunner.query(
      `CREATE TYPE "wallet_transactions_status_enum" AS ENUM ('pending', 'processing', 'success', 'failed')`
    );

    await queryRunner.query(`
      CREATE TABLE "wallet_transactions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "walletId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "type" "wallet_transactions_type_enum" NOT NULL,
        "amount" numeric(12,2) NOT NULL,
        "status" "wallet_transactions_status_enum" NOT NULL DEFAULT 'pending',
        "balanceAfter" numeric(12,2) NOT NULL,
        "errandId" uuid,
        "reference" character varying,
        "description" text,
        "metadata" jsonb,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wallet_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_wallet_transactions_walletId" FOREIGN KEY ("walletId") REFERENCES "wallets"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_wallet_transactions_userId" ON "wallet_transactions" ("userId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_wallet_transactions_userId_type" ON "wallet_transactions" ("userId", "type")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_wallet_transactions_reference" ON "wallet_transactions" ("reference")`
    );
    // DB-level backstop: an errand's payout can only ever be credited once,
    // even if a status-update webhook/call is retried.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_wallet_transactions_earning_errandId" ON "wallet_transactions" ("errandId") WHERE "type" = 'earning'`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "wallet_transactions"`);
    await queryRunner.query(`DROP TYPE "wallet_transactions_status_enum"`);
    await queryRunner.query(`DROP TYPE "wallet_transactions_type_enum"`);
  }
}
