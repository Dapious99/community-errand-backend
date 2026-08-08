import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWalletTransactionBusinessCreditType1700003200000
  implements MigrationInterface
{
  name = 'AddWalletTransactionBusinessCreditType1700003200000';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "wallet_transactions_type_enum" ADD VALUE IF NOT EXISTS 'business_credit_purchase'`
    );
  }

  public async down(): Promise<void> {
    // Postgres has no DROP VALUE for enums; reverting would require
    // recreating the type and every column that depends on it. Not
    // implemented - this migration is not reversible.
  }
}
