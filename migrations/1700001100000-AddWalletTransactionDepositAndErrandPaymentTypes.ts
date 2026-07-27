import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWalletTransactionDepositAndErrandPaymentTypes1700001100000
  implements MigrationInterface
{
  name = 'AddWalletTransactionDepositAndErrandPaymentTypes1700001100000';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "wallet_transactions_type_enum" ADD VALUE IF NOT EXISTS 'deposit'`
    );
    await queryRunner.query(
      `ALTER TYPE "wallet_transactions_type_enum" ADD VALUE IF NOT EXISTS 'errand_payment'`
    );
  }

  public async down(): Promise<void> {
    // Postgres has no DROP VALUE for enums; reverting would require
    // recreating the type and every column that depends on it. Not
    // implemented - this migration is not reversible.
  }
}
