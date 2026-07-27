import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKycRejectionReason1700000700000 implements MigrationInterface {
  name = 'AddKycRejectionReason1700000700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "kyc" ADD "rejectionReason" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "kyc" DROP COLUMN "rejectionReason"`);
  }
}
