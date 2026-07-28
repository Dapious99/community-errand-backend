import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddErrandPriorityColumns1700001500000
  implements MigrationInterface
{
  name = 'AddErrandPriorityColumns1700001500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "errands" ADD "requiredRunners" integer NOT NULL DEFAULT 1`
    );
    await queryRunner.query(
      `ALTER TABLE "errands" ADD "priorityUntil" TIMESTAMP`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "errands" DROP COLUMN "priorityUntil"`);
    await queryRunner.query(
      `ALTER TABLE "errands" DROP COLUMN "requiredRunners"`
    );
  }
}
