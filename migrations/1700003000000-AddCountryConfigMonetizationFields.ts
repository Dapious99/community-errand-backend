import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCountryConfigMonetizationFields1700003000000
  implements MigrationInterface
{
  name = 'AddCountryConfigMonetizationFields1700003000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "country_configs" ADD "lightKycPriceThreshold" numeric(12,2)`
    );
    await queryRunner.query(
      `ALTER TABLE "country_configs" ADD "proPlatformFeePercent" numeric(5,2)`
    );
    await queryRunner.query(
      `ALTER TABLE "country_configs" ADD "surgeThresholdOpenErrands" integer`
    );
    await queryRunner.query(
      `ALTER TABLE "country_configs" ADD "surgeMultiplier" numeric(4,2)`
    );

    // Backfill Nigeria (the only configured country so far): errands under
    // 5,000 only need submitted KYC, Pro runners pay half the standard fee,
    // and boost price surges 50% once 50+ errands are open at once.
    await queryRunner.query(`
      UPDATE "country_configs"
      SET
        "lightKycPriceThreshold" = 5000,
        "proPlatformFeePercent" = 5,
        "surgeThresholdOpenErrands" = 50,
        "surgeMultiplier" = 1.5
      WHERE "country" = 'Nigeria'
    `);

    await queryRunner.query(
      `ALTER TABLE "country_configs" ALTER COLUMN "lightKycPriceThreshold" SET NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "country_configs" ALTER COLUMN "proPlatformFeePercent" SET NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "country_configs" ALTER COLUMN "surgeThresholdOpenErrands" SET NOT NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "country_configs" ALTER COLUMN "surgeMultiplier" SET NOT NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "country_configs" DROP COLUMN "surgeMultiplier"`
    );
    await queryRunner.query(
      `ALTER TABLE "country_configs" DROP COLUMN "surgeThresholdOpenErrands"`
    );
    await queryRunner.query(
      `ALTER TABLE "country_configs" DROP COLUMN "proPlatformFeePercent"`
    );
    await queryRunner.query(
      `ALTER TABLE "country_configs" DROP COLUMN "lightKycPriceThreshold"`
    );
  }
}
