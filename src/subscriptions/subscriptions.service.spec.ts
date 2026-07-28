import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { SubscriptionsService } from "./subscriptions.service";
import {
  Subscription,
  SubscriptionPlan,
  SubscriptionStatus,
} from "./entities/subscription.entity";
import { User } from "../users/entities/user.entity";
import { WalletService } from "../wallet/wallet.service";
import { WalletTransactionType } from "../wallet/entities/wallet-transaction.entity";
import { SettingsService } from "../settings/settings.service";

describe("SubscriptionsService", () => {
  let service: SubscriptionsService;
  let subscriptionsRepo: any;
  let usersRepo: any;
  let walletService: jest.Mocked<WalletService>;
  let settingsService: jest.Mocked<SettingsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        {
          provide: getRepositoryToken(Subscription),
          useValue: {
            create: jest.fn((data) => ({ id: "sub-1", ...data })),
            save: jest.fn((data) => Promise.resolve(data)),
            findOne: jest.fn(),
            find: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            update: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: WalletService,
          useValue: { debit: jest.fn() },
        },
        {
          provide: SettingsService,
          useValue: { get: jest.fn((key: string, fallback: any) => fallback) },
        },
      ],
    }).compile();

    service = module.get(SubscriptionsService);
    subscriptionsRepo = module.get(getRepositoryToken(Subscription));
    usersRepo = module.get(getRepositoryToken(User));
    walletService = module.get(WalletService);
    settingsService = module.get(SettingsService);
  });

  describe("subscribe", () => {
    it("debits the wallet at the plan's current price and sets expiresAt from now", async () => {
      usersRepo.findOne.mockResolvedValue({ id: "user-1", proExpiresAt: null });
      walletService.debit.mockResolvedValue({ id: "tx-1" } as any);

      const result = await service.subscribe(
        "user-1",
        SubscriptionPlan.MONTHLY,
        false
      );

      expect(settingsService.get).toHaveBeenCalledWith(
        "pro_price_monthly_ngn",
        1500
      );
      expect(walletService.debit).toHaveBeenCalledWith(
        "user-1",
        1500,
        WalletTransactionType.SUBSCRIPTION,
        expect.any(Object)
      );
      expect(result.status).toBe(SubscriptionStatus.ACTIVE);
      expect(usersRepo.update).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({ proExpiresAt: expect.any(Date) })
      );
    });

    it("extends from the current expiry instead of overwriting remaining Pro time", async () => {
      const futureExpiry = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // 10 days out
      usersRepo.findOne.mockResolvedValue({
        id: "user-1",
        proExpiresAt: futureExpiry,
      });
      walletService.debit.mockResolvedValue({ id: "tx-1" } as any);

      await service.subscribe("user-1", SubscriptionPlan.MONTHLY, false);

      const [, update] = usersRepo.update.mock.calls[0];
      expect(update.proExpiresAt.getTime()).toBeGreaterThan(
        futureExpiry.getTime()
      );
    });

    it("throws when the user doesn't exist", async () => {
      usersRepo.findOne.mockResolvedValue(null);

      await expect(
        service.subscribe("ghost", SubscriptionPlan.MONTHLY)
      ).rejects.toThrow(NotFoundException);
      expect(walletService.debit).not.toHaveBeenCalled();
    });

    it("propagates insufficient-balance rejections from the wallet", async () => {
      usersRepo.findOne.mockResolvedValue({ id: "user-1", proExpiresAt: null });
      walletService.debit.mockRejectedValue(
        new BadRequestException("Insufficient wallet balance")
      );

      await expect(
        service.subscribe("user-1", SubscriptionPlan.MONTHLY)
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe("cancelAutoRenew", () => {
    it("turns off auto-renew on the current active subscription", async () => {
      const current = {
        id: "sub-1",
        autoRenew: true,
        status: SubscriptionStatus.ACTIVE,
      };
      subscriptionsRepo.findOne.mockResolvedValue(current);

      await service.cancelAutoRenew("user-1");

      expect(subscriptionsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ autoRenew: false })
      );
    });

    it("throws when there's no active subscription", async () => {
      subscriptionsRepo.findOne.mockResolvedValue(null);

      await expect(service.cancelAutoRenew("user-1")).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe("getStatus", () => {
    it("reports isPro true when proExpiresAt is in the future", async () => {
      usersRepo.findOne.mockResolvedValue({
        proExpiresAt: new Date(Date.now() + 60_000),
      });
      subscriptionsRepo.findOne.mockResolvedValue({
        plan: SubscriptionPlan.ANNUAL,
        autoRenew: true,
      });

      const result = await service.getStatus("user-1");

      expect(result.isPro).toBe(true);
      expect(result.plan).toBe(SubscriptionPlan.ANNUAL);
    });

    it("reports isPro false when proExpiresAt is in the past or unset", async () => {
      usersRepo.findOne.mockResolvedValue({ proExpiresAt: null });
      subscriptionsRepo.findOne.mockResolvedValue(null);

      const result = await service.getStatus("user-1");

      expect(result.isPro).toBe(false);
    });
  });

  describe("processRenewals", () => {
    it("renews an auto-renewing expired subscription and marks the old row expired", async () => {
      const expired = {
        id: "sub-1",
        userId: "user-1",
        plan: SubscriptionPlan.MONTHLY,
        status: SubscriptionStatus.ACTIVE,
        autoRenew: true,
        expiresAt: new Date(Date.now() - 60_000),
      };
      subscriptionsRepo.find.mockResolvedValue([expired]);
      usersRepo.findOne.mockResolvedValue({
        id: "user-1",
        proExpiresAt: expired.expiresAt,
      });
      walletService.debit.mockResolvedValue({ id: "tx-2" } as any);

      const result = await service.processRenewals();

      expect(result.renewed).toBe(1);
      expect(result.lapsed).toBe(0);
      expect(subscriptionsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "sub-1",
          status: SubscriptionStatus.EXPIRED,
        })
      );
    });

    it("lapses immediately (no retry) when the renewal charge fails", async () => {
      const expired = {
        id: "sub-1",
        userId: "user-1",
        plan: SubscriptionPlan.MONTHLY,
        status: SubscriptionStatus.ACTIVE,
        autoRenew: true,
        expiresAt: new Date(Date.now() - 60_000),
      };
      subscriptionsRepo.find.mockResolvedValue([expired]);
      usersRepo.findOne.mockResolvedValue({
        id: "user-1",
        proExpiresAt: expired.expiresAt,
      });
      walletService.debit.mockRejectedValue(
        new BadRequestException("Insufficient wallet balance")
      );

      const result = await service.processRenewals();

      expect(result.renewed).toBe(0);
      expect(result.lapsed).toBe(1);
      expect(subscriptionsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: SubscriptionStatus.EXPIRED,
          autoRenew: false,
        })
      );
      expect(usersRepo.update).toHaveBeenCalledWith(
        "user-1",
        expect.objectContaining({ proExpiresAt: null })
      );
    });

    it("lapses without attempting a charge when auto-renew is off", async () => {
      const expired = {
        id: "sub-1",
        userId: "user-1",
        plan: SubscriptionPlan.MONTHLY,
        status: SubscriptionStatus.ACTIVE,
        autoRenew: false,
        expiresAt: new Date(Date.now() - 60_000),
      };
      subscriptionsRepo.find.mockResolvedValue([expired]);
      usersRepo.findOne.mockResolvedValue({
        id: "user-1",
        proExpiresAt: expired.expiresAt,
      });

      const result = await service.processRenewals();

      expect(result.lapsed).toBe(1);
      expect(walletService.debit).not.toHaveBeenCalled();
    });

    it("ignores subscriptions that aren't due yet", async () => {
      const notDue = {
        id: "sub-1",
        userId: "user-1",
        plan: SubscriptionPlan.MONTHLY,
        status: SubscriptionStatus.ACTIVE,
        autoRenew: true,
        expiresAt: new Date(Date.now() + 60_000),
      };
      subscriptionsRepo.find.mockResolvedValue([notDue]);

      const result = await service.processRenewals();

      expect(result.renewed).toBe(0);
      expect(result.lapsed).toBe(0);
      expect(subscriptionsRepo.save).not.toHaveBeenCalled();
    });
  });
});
