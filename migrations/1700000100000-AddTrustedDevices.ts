import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTrustedDevices1700000100000 implements MigrationInterface {
  name = 'AddTrustedDevices1700000100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "trusted_devices" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "userId" uuid NOT NULL,
        "deviceId" character varying NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "lastUsedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_trusted_devices_userId_deviceId" UNIQUE ("userId", "deviceId"),
        CONSTRAINT "PK_trusted_devices" PRIMARY KEY ("id"),
        CONSTRAINT "FK_trusted_devices_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_trusted_devices_userId" ON "trusted_devices" ("userId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "trusted_devices"`);
  }
}
