export interface BusinessCreditPackage {
  id: string;
  label: string;
  /** Amount actually charged via the payment gateway, in the country's currency. */
  payAmount: number;
  /** Bonus percentage credited on top of payAmount into the wallet. */
  bonusPercent: number;
}

/**
 * Fixed NGN-denominated packages for businesses that want a standing errand-
 * posting budget - pay a lump sum, get a bigger wallet credit than what was
 * paid, then post errands out of that balance same as any other requester.
 * Nigeria-only for now, like every other hardcoded default in this codebase
 * - revisit per-country once a second market is a real near-term plan (see
 * PRODUCT_STRATEGY.md).
 *
 * This is only the fallback used when the "business_credit_packages"
 * platform setting hasn't been overridden - see PaymentsService and
 * src/settings/settings-catalog.ts. An admin can add/remove/reprice packages
 * via `PATCH /admin/settings/business_credit_packages` without a redeploy.
 */
export const DEFAULT_BUSINESS_CREDIT_PACKAGES: BusinessCreditPackage[] = [
  { id: "starter", label: "Starter", payAmount: 20000, bonusPercent: 10 },
  { id: "growth", label: "Growth", payAmount: 50000, bonusPercent: 15 },
  { id: "scale", label: "Scale", payAmount: 100000, bonusPercent: 20 },
];

export function findBusinessCreditPackage(
  packages: BusinessCreditPackage[],
  packageId: string
): BusinessCreditPackage | undefined {
  return packages.find((p) => p.id === packageId);
}

export function creditAmountFor(pkg: BusinessCreditPackage): number {
  return Number((pkg.payAmount * (1 + pkg.bonusPercent / 100)).toFixed(2));
}
