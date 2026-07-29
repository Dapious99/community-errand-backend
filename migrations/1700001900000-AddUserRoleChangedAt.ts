import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserRoleChangedAt1700001900000 implements MigrationInterface {
  name = 'AddUserRoleChangedAt1700001900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "roleChangedAt" TIMESTAMP`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "roleChangedAt"`);
  }
}
