import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddErrandConcerns1700002600000 implements MigrationInterface {
  name = 'AddErrandConcerns1700002600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "errand_concerns_status_enum" AS ENUM ('open', 'acknowledged', 'resolved', 'reopened')`
    );
    await queryRunner.query(
      `CREATE TYPE "errand_concerns_reopenedby_enum" AS ENUM ('system', 'admin', 'runner')`
    );

    await queryRunner.query(`
      CREATE TABLE "errand_concerns" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "errandId" uuid NOT NULL,
        "raisedByUserId" uuid NOT NULL,
        "reason" text NOT NULL,
        "status" "errand_concerns_status_enum" NOT NULL DEFAULT 'open',
        "runnerReply" text,
        "acknowledgedAt" TIMESTAMP,
        "resolvedAt" TIMESTAMP,
        "reopenedAt" TIMESTAMP,
        "reopenedBy" "errand_concerns_reopenedby_enum",
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_errand_concerns" PRIMARY KEY ("id"),
        CONSTRAINT "FK_errand_concerns_errandId" FOREIGN KEY ("errandId") REFERENCES "errands"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_errand_concerns_raisedByUserId" FOREIGN KEY ("raisedByUserId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_errand_concerns_errandId_status" ON "errand_concerns" ("errandId", "status")`
    );

    await queryRunner.query(
      `ALTER TABLE "users" ADD "consecutiveErrandFailures" integer NOT NULL DEFAULT 0`
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "runnerBannedUntil" TIMESTAMP`
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "banEscalationLevel" integer NOT NULL DEFAULT 0`
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "permanentlyBannedFromPicking" boolean NOT NULL DEFAULT false`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "permanentlyBannedFromPicking"`
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "banEscalationLevel"`
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "runnerBannedUntil"`
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "consecutiveErrandFailures"`
    );
    await queryRunner.query(`DROP INDEX "IDX_errand_concerns_errandId_status"`);
    await queryRunner.query(`DROP TABLE "errand_concerns"`);
    await queryRunner.query(`DROP TYPE "errand_concerns_reopenedby_enum"`);
    await queryRunner.query(`DROP TYPE "errand_concerns_status_enum"`);
  }
}
