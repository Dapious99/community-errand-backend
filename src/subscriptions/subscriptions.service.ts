import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  Subscription,
  SubscriptionPlan,
  SubscriptionStatus,
} from "./entities/subscription.entity";
import { User } from "../users/entities/user.entity";
import { WalletService } from "../wallet/wallet.service";
import { WalletTransactionType } from "../wallet/entities/wallet-transaction.entity";
import { SettingsService } from "../settings/settings.service";

const PLAN_PRICE_SETTINGS: Record<
  SubscriptionPlan,
  { key: string; default: number }
> = {
  [SubscriptionPlan.MONTHLY]: { key: "pro_price_monthly_ngn", default: 1500 },
  [SubscriptionPlan.QUARTERLY]: {
    key: "pro_price_quarterly_ngn",
    default: 4000,
  },
  [SubscriptionPlan.SEMI_ANNUAL]: {
    key: "pro_price_semi_annual_ngn",
    default: 7000,
  },
  [SubscriptionPlan.ANNUAL]: { key: "pro_price_annual_ngn", default: 12000 },
};

const PLAN_DURATION_DAYS: Record<SubscriptionPlan, number> = {
  [SubscriptionPlan.MONTHLY]: 30,
  [SubscriptionPlan.QUARTERLY]: 90,
  [SubscriptionPlan.SEMI_ANNUAL]: 180,
  [SubscriptionPlan.ANNUAL]: 365,
};

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @InjectRepository(Subscription)
    private subscriptionsRepository: Repository<Subscription>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private walletService: WalletService,
    private settingsService: SettingsService
  ) {}

  async getPlanPrice(plan: SubscriptionPlan): Promise<number> {
    const { key, default: fallback } = PLAN_PRICE_SETTINGS[plan];
    return this.settingsService.get<number>(key, fallback);
  }

  getPlanDurationDays(plan: SubscriptionPlan): number {
    return PLAN_DURATION_DAYS[plan];
  }

  /**
   * Debits the wallet for the plan's current price and extends Pro status.
   * If the user already has unexpired Pro time remaining, the new period is
   * added on top of it rather than overwriting - a subscriber renewing
   * early (or the auto-renewal job renewing right at expiry) never loses
   * paid-for time.
   */
  async subscribe(
    userId: string,
    plan: SubscriptionPlan,
    autoRenew = false
  ): Promise<Subscription> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException("User not found");
    }

    const price = await this.getPlanPrice(plan);
    const durationDays = this.getPlanDurationDays(plan);

    const transaction = await this.walletService.debit(
      userId,
      price,
      WalletTransactionType.SUBSCRIPTION,
      {
        description: `Pro subscription (${plan})`,
        metadata: { plan, autoRenew },
      }
    );

    const now = new Date();
    const base =
      user.proExpiresAt && user.proExpiresAt.getTime() > now.getTime()
        ? user.proExpiresAt
        : now;
    const expiresAt = new Date(
      base.getTime() + durationDays * 24 * 60 * 60 * 1000
    );

    const subscription = this.subscriptionsRepository.create({
      userId,
      plan,
      status: SubscriptionStatus.ACTIVE,
      startedAt: now,
      expiresAt,
      autoRenew,
      amountPaid: price,
      walletTransactionId: transaction.id,
    });
    const saved = await this.subscriptionsRepository.save(subscription);

    await this.usersRepository.update(userId, { proExpiresAt: expiresAt });

    return saved;
  }

  async cancelAutoRenew(userId: string): Promise<void> {
    const current = await this.subscriptionsRepository.findOne({
      where: { userId, status: SubscriptionStatus.ACTIVE },
      order: { createdAt: "DESC" },
    });
    if (!current) {
      throw new NotFoundException(
        "No active subscription to cancel auto-renew for"
      );
    }
    current.autoRenew = false;
    await this.subscriptionsRepository.save(current);
  }

  async getStatus(userId: string): Promise<{
    isPro: boolean;
    proExpiresAt: Date | null;
    plan: SubscriptionPlan | null;
    autoRenew: boolean;
  }> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    const isPro =
      !!user?.proExpiresAt && user.proExpiresAt.getTime() > Date.now();

    const current = await this.subscriptionsRepository.findOne({
      where: { userId, status: SubscriptionStatus.ACTIVE },
      order: { createdAt: "DESC" },
    });

    return {
      isPro,
      proExpiresAt: user?.proExpiresAt ?? null,
      plan: current?.plan ?? null,
      autoRenew: current?.autoRenew ?? false,
    };
  }

  /**
   * Scans for expired ACTIVE subscriptions. Auto-renewing ones attempt a
   * fresh charge at today's price; anything else (auto-renew off, or the
   * charge failed - e.g. insufficient wallet balance) lapses immediately,
   * no retry/grace period for v1.
   */
  async processRenewals(): Promise<{ renewed: number; lapsed: number }> {
    const expired = await this.subscriptionsRepository.find({
      where: { status: SubscriptionStatus.ACTIVE },
    });
    const now = Date.now();
    const dueForProcessing = expired.filter(
      (s) => s.expiresAt.getTime() <= now
    );

    let renewed = 0;
    let lapsed = 0;

    for (const subscription of dueForProcessing) {
      if (subscription.autoRenew) {
        try {
          await this.subscribe(subscription.userId, subscription.plan, true);
          subscription.status = SubscriptionStatus.EXPIRED;
          await this.subscriptionsRepository.save(subscription);
          renewed++;
          continue;
        } catch (error: any) {
          this.logger.warn(
            `Auto-renewal failed for user ${subscription.userId} (${subscription.plan}), lapsing: ${error.message}`
          );
        }
      }

      subscription.status = SubscriptionStatus.EXPIRED;
      subscription.autoRenew = false;
      await this.subscriptionsRepository.save(subscription);

      const user = await this.usersRepository.findOne({
        where: { id: subscription.userId },
      });
      if (user?.proExpiresAt && user.proExpiresAt.getTime() <= now) {
        await this.usersRepository.update(subscription.userId, {
          proExpiresAt: null,
        } as any);
      }
      lapsed++;
    }

    return { renewed, lapsed };
  }
}
