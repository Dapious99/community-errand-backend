import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlatformSettings1700000300000 implements MigrationInterface {
  name = 'AddPlatformSettings1700000300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "platform_settings" (
        "key" character varying NOT NULL,
        "value" text NOT NULL,
        "description" character varying,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_platform_settings" PRIMARY KEY ("key")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "platform_settings"`);
  }
}
