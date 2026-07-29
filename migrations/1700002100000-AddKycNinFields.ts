import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddKycNinFields1700002100000 implements MigrationInterface {
  name = 'AddKycNinFields1700002100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "kyc" ADD "nin" character varying`);
    await queryRunner.query(`ALTER TABLE "kyc" ADD "ninImageUrl" character varying`);
    await queryRunner.query(`ALTER TABLE "kyc" ADD "ninVerifiedAt" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "kyc" ADD "bvnVerifiedAt" TIMESTAMP`);
    await queryRunner.query(`ALTER TABLE "kyc" ADD "ninVerificationData" jsonb`);
    await queryRunner.query(`ALTER TABLE "kyc" ADD "bvnVerificationData" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "kyc" DROP COLUMN "bvnVerificationData"`);
    await queryRunner.query(`ALTER TABLE "kyc" DROP COLUMN "ninVerificationData"`);
    await queryRunner.query(`ALTER TABLE "kyc" DROP COLUMN "bvnVerifiedAt"`);
    await queryRunner.query(`ALTER TABLE "kyc" DROP COLUMN "ninVerifiedAt"`);
    await queryRunner.query(`ALTER TABLE "kyc" DROP COLUMN "ninImageUrl"`);
    await queryRunner.query(`ALTER TABLE "kyc" DROP COLUMN "nin"`);
  }
}
