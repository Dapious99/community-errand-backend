import { Entity, PrimaryColumn, Column, UpdateDateColumn } from "typeorm";
import { DecimalColumnTransformer } from "../../common/transformers/decimal.transformer";

/**
 * Per-country platform configuration - currency, boost pricing, platform
 * fee, and which payment gateway that market uses. Distinct from the
 * generic key-value `PlatformSetting` store: everything here is a small,
 * explicit set of fields every supported country must define, looked up by
 * a user's `country` (see UsersService/AuthService) rather than a free-form
 * key. `paymentGatewayProvider` is a label only for now - actually routing
 * payments through a gateway other than Paystack is not yet implemented.
 */
@Entity("country_configs")
export class CountryConfig {
  @PrimaryColumn()
  country: string;

  @Column()
  currencyCode: string;

  @Column()
  currencySymbol: string;

  @Column("decimal", {
    precision: 12,
    scale: 2,
    transformer: new DecimalColumnTransformer(),
  })
  boostPrice: number;

  @Column("decimal", {
    precision: 5,
    scale: 2,
    transformer: new DecimalColumnTransformer(),
  })
  platformFeePercent: number;

  @Column("decimal", {
    precision: 12,
    scale: 2,
    transformer: new DecimalColumnTransformer(),
  })
  minWithdrawalAmount: number;

  @Column("decimal", {
    precision: 5,
    scale: 2,
    transformer: new DecimalColumnTransformer(),
  })
  withdrawalFeePercent: number;

  @Column("decimal", {
    precision: 12,
    scale: 2,
    transformer: new DecimalColumnTransformer(),
  })
  referralBonus: number;

  /** Errand price at/above which it enters the Pro-only priority window (see ErrandsService.create). */
  @Column("decimal", {
    precision: 12,
    scale: 2,
    transformer: new DecimalColumnTransformer(),
  })
  priorityPriceThreshold: number;

  /** Keyed by SubscriptionPlan value ("monthly"/"quarterly"/"semi_annual"/"annual") -> price in this country's currency. */
  @Column("jsonb")
  subscriptionPrices: Record<string, number>;

  /**
   * Below this errand price, a runner whose KYC is merely PENDING (NIN +
   * photo submitted, not yet admin-reviewed) can still pick it up - full
   * APPROVED status is only required above this threshold, and always
   * before withdrawal regardless of price. See
   * ErrandsService.assertRunnerEligible.
   */
  @Column("decimal", {
    precision: 12,
    scale: 2,
    transformer: new DecimalColumnTransformer(),
  })
  lightKycPriceThreshold: number;

  /** Payout fee for a currently-Pro runner - replaces platformFeePercent for them (see PaymentsService.processPayout). */
  @Column("decimal", {
    precision: 5,
    scale: 2,
    transformer: new DecimalColumnTransformer(),
  })
  proPlatformFeePercent: number;

  /** Number of concurrently OPEN errands at/above which boost pricing surges (see ErrandsService.getBoostPriceQuote). */
  @Column()
  surgeThresholdOpenErrands: number;

  /** Multiplier applied to boostPrice while surge is active. */
  @Column("decimal", {
    precision: 4,
    scale: 2,
    transformer: new DecimalColumnTransformer(),
  })
  surgeMultiplier: number;

  @Column()
  paymentGatewayProvider: string;

  @Column({ default: true })
  isActive: boolean;

  @UpdateDateColumn()
  updatedAt: Date;
}
