import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddErrandBoostColumns1700000600000 implements MigrationInterface {
  name = 'AddErrandBoostColumns1700000600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "errands" ADD "isBoosted" boolean NOT NULL DEFAULT false`
    );
    await queryRunner.query(`ALTER TABLE "errands" ADD "boostedAt" TIMESTAMP`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "errands" DROP COLUMN "boostedAt"`);
    await queryRunner.query(`ALTER TABLE "errands" DROP COLUMN "isBoosted"`);
  }
}
