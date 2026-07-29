import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUsername1700001800000 implements MigrationInterface {
  name = 'AddUsername1700001800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "username" character varying`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "UQ_users_username" UNIQUE ("username")`
    );
    await queryRunner.query(`CREATE INDEX "IDX_users_username" ON "users" ("username")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_users_username"`);
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "UQ_users_username"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "username"`);
  }
}
