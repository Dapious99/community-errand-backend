import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKycBankAccountName1700002900000 implements MigrationInterface {
  name = 'AddKycBankAccountName1700002900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "kyc" ADD "bankAccountName" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "kyc" DROP COLUMN "bankAccountName"`);
  }
}
