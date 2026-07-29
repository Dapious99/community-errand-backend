import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserProfileDetails1700002000000 implements MigrationInterface {
  name = 'AddUserProfileDetails1700002000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "dateOfBirth" date`);
    await queryRunner.query(`ALTER TABLE "users" ADD "gender" character varying`);
    await queryRunner.query(`ALTER TABLE "users" ADD "maritalStatus" character varying`);
    await queryRunner.query(`ALTER TABLE "users" ADD "religion" character varying`);
    await queryRunner.query(`ALTER TABLE "users" ADD "address" character varying`);
    await queryRunner.query(`ALTER TABLE "users" ADD "state" character varying`);
    await queryRunner.query(`ALTER TABLE "users" ADD "city" character varying`);
    await queryRunner.query(`ALTER TABLE "users" ADD "occupation" character varying`);
    await queryRunner.query(`ALTER TABLE "users" ADD "employer" character varying`);
    await queryRunner.query(`ALTER TABLE "users" ADD "emergencyContactName" character varying`);
    await queryRunner.query(`ALTER TABLE "users" ADD "emergencyContactPhone" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "emergencyContactPhone"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "emergencyContactName"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "employer"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "occupation"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "city"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "state"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "address"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "religion"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "maritalStatus"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "gender"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "dateOfBirth"`);
  }
}
