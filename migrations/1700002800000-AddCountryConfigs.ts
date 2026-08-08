import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCountryConfigs1700002800000 implements MigrationInterface {
  name = 'AddCountryConfigs1700002800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "country_configs" (
        "country" character varying NOT NULL,
        "currencyCode" character varying NOT NULL,
        "currencySymbol" character varying NOT NULL,
        "boostPrice" numeric(12,2) NOT NULL,
        "platformFeePercent" numeric(5,2) NOT NULL,
        "minWithdrawalAmount" numeric(12,2) NOT NULL,
        "withdrawalFeePercent" numeric(5,2) NOT NULL,
        "referralBonus" numeric(12,2) NOT NULL,
        "priorityPriceThreshold" numeric(12,2) NOT NULL,
        "subscriptionPrices" jsonb NOT NULL,
        "paymentGatewayProvider" character varying NOT NULL,
        "isActive" boolean NOT NULL DEFAULT true,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_country_configs" PRIMARY KEY ("country")
      )
    `);

    // Seed the only market this platform has operated in so far, matching
    // every existing global default (ai_boost_price_ngn, PLATFORM_FEE_PERCENT,
    // min_withdrawal_amount_ngn, withdrawal_fee_percent, referral_bonus_ngn,
    // pro_priority_price_threshold_ngn, pro_price_*_ngn).
    await queryRunner.query(`
      INSERT INTO "country_configs"
        ("country", "currencyCode", "currencySymbol", "boostPrice", "platformFeePercent",
         "minWithdrawalAmount", "withdrawalFeePercent", "referralBonus", "priorityPriceThreshold",
         "subscriptionPrices", "paymentGatewayProvider", "isActive")
      VALUES
        ('Nigeria', 'NGN', '₦', 2500, 10,
         2000, 3.5, 500, 20000,
         '{"monthly":1500,"quarterly":4000,"semi_annual":7000,"annual":12000}', 'paystack', true)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "country_configs"`);
  }
}
