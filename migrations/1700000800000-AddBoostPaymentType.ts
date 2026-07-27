import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `ALTER TYPE ... ADD VALUE` is allowed inside a transaction on Postgres 12+,
 * but the new value still can't be *used* (inserted into a row) within that
 * same transaction. Nothing else in this migration touches 'boost', so it's
 * safe even under the CLI's default `--transaction all` - but `transaction =
 * false` is set anyway as a belt-and-suspenders guard against ever combining
 * this with a same-run migration that seeds a 'boost' row.
 */
export class AddBoostPaymentType1700000800000 implements MigrationInterface {
  name = 'AddBoostPaymentType1700000800000';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "payments_type_enum" ADD VALUE IF NOT EXISTS 'boost'`
    );
  }

  public async down(): Promise<void> {
    // Postgres has no DROP VALUE for enums; reverting would require
    // recreating the type and every column that depends on it. Not
    // implemented - this migration is not reversible.
  }
}
