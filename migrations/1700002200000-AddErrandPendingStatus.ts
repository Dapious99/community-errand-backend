import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Same ALTER TYPE ... ADD VALUE caveat as AddBoostPaymentType: not usable
 * within the same transaction it's added in, so transaction is disabled and
 * this migration does nothing else. Not reversible (Postgres has no DROP
 * VALUE for enums).
 */
export class AddErrandPendingStatus1700002200000 implements MigrationInterface {
  name = 'AddErrandPendingStatus1700002200000';
  transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "errands_status_enum" ADD VALUE IF NOT EXISTS 'pending'`
    );
  }

  public async down(): Promise<void> {
    // Not implemented - see class comment.
  }
}
