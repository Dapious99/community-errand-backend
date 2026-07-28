import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWalletTransactionSubscriptionAndReferralTypes1700001600000
  implements MigrationInterface
{
  name = 'AddWalletTransactionSubscriptionAndReferralTypes1700001600000';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "wallet_transactions_type_enum" ADD VALUE IF NOT EXISTS 'subscription'`
    );
    await queryRunner.query(
      `ALTER TYPE "wallet_transactions_type_enum" ADD VALUE IF NOT EXISTS 'referral_bonus'`
    );
  }

  public async down(): Promise<void> {
    // Postgres has no DROP VALUE for enums; reverting would require
    // recreating the type and every column that depends on it. Not
    // implemented - this migration is not reversible.
  }
}
