import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddErrandApplications1700002300000 implements MigrationInterface {
  name = 'AddErrandApplications1700002300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "errand_applications_status_enum" AS ENUM ('pending', 'accepted', 'declined')`
    );

    await queryRunner.query(`
      CREATE TABLE "errand_applications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "errandId" uuid NOT NULL,
        "runnerId" uuid NOT NULL,
        "status" "errand_applications_status_enum" NOT NULL DEFAULT 'pending',
        "message" text,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_errand_applications" PRIMARY KEY ("id"),
        CONSTRAINT "FK_errand_applications_errandId" FOREIGN KEY ("errandId") REFERENCES "errands"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_errand_applications_runnerId" FOREIGN KEY ("runnerId") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_errand_applications_errandId_runnerId" ON "errand_applications" ("errandId", "runnerId")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_errand_applications_errandId" ON "errand_applications" ("errandId")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "errand_applications"`);
    await queryRunner.query(`DROP TYPE "errand_applications_status_enum"`);
  }
}
