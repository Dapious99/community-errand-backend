import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWhatsappToUser1700003000000 implements MigrationInterface {
  name = 'AddWhatsappToUser1700003000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "whatsappNumber" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "UQ_users_whatsappNumber" UNIQUE ("whatsappNumber")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_users_whatsappNumber" ON "users" ("whatsappNumber")`
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "whatsappVerifiedAt" timestamp`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "whatsappVerifiedAt"`);
    await queryRunner.query(`DROP INDEX "IDX_users_whatsappNumber"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "UQ_users_whatsappNumber"`
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "whatsappNumber"`);
  }
}
