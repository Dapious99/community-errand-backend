import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { ErrandsService } from "./errands.service";
import { Errand, ErrandStatus } from "./entities/errand.entity";
import { Location, LocationType } from "./entities/location.entity";
import { MediaAttachment } from "./entities/media-attachment.entity";
import { UserRole } from "../users/entities/user.entity";
import { PaymentsService } from "../payments/payments.service";
import { SettingsService } from "../settings/settings.service";
import { AiService } from "../ai/ai.service";
import { NotificationsService } from "../notifications/notifications.service";
import { WalletService } from "../wallet/wallet.service";
import { WalletTransactionType } from "../wallet/entities/wallet-transaction.entity";

describe("ErrandsService", () => {
  let service: ErrandsService;
  let errandsRepo: any;
  let paymentsService: jest.Mocked<PaymentsService>;
  let settingsService: jest.Mocked<SettingsService>;
  let aiService: jest.Mocked<AiService>;
  let notificationsService: jest.Mocked<NotificationsService>;
  let walletService: jest.Mocked<WalletService>;
  let updateExecute: jest.Mock;

  beforeEach(async () => {
    updateExecute = jest.fn().mockResolvedValue({ affected: 1 });
    const queryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: updateExecute,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ErrandsService,
        {
          provide: getRepositoryToken(Errand),
          useValue: {
            create: jest.fn((data) => ({ id: "errand-1", ...data })),
            save: jest.fn((data) => Promise.resolve({ ...data })),
            update: jest.fn().mockResolvedValue(undefined),
            findOne: jest.fn(),
            find: jest.fn(),
            createQueryBuilder: jest.fn(() => queryBuilder),
          },
        },
        {
          provide: getRepositoryToken(Location),
          useValue: { create: jest.fn((data) => data), save: jest.fn() },
        },
        {
          provide: getRepositoryToken(MediaAttachment),
          useValue: { create: jest.fn((data) => data), save: jest.fn() },
        },
        {
          provide: PaymentsService,
          useValue: {
            processPayout: jest.fn().mockResolvedValue(null),
            processRefund: jest.fn().mockResolvedValue(null),
            initializeBoostPayment: jest.fn(),
          },
        },
        {
          provide: SettingsService,
          useValue: { get: jest.fn().mockResolvedValue(2500) },
        },
        {
          provide: AiService,
          useValue: { rewriteBoostTitle: jest.fn() },
        },
        {
          provide: NotificationsService,
          useValue: {
            notifyNearbyTopRatedRunners: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: WalletService,
          useValue: {
            debit: jest.fn(),
            reverseTransaction: jest.fn(),
            linkTransactionToErrand: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get(ErrandsService);
    errandsRepo = module.get(getRepositoryToken(Errand));
    paymentsService = module.get(PaymentsService);
    settingsService = module.get(SettingsService);
    aiService = module.get(AiService);
    notificationsService = module.get(NotificationsService);
    walletService = module.get(WalletService);
  });

  describe("create", () => {
    const dto = {
      title: "Buy groceries",
      description: "Get milk and eggs",
      category: "buy_for_me",
      price: 1000,
      locations: [],
    } as any;

    beforeEach(() => {
      walletService.debit.mockResolvedValue({ id: "payment-tx-1" } as any);
    });

    it("debits the requester's wallet for the errand price before creating it", async () => {
      errandsRepo.findOne.mockResolvedValue({ id: "errand-1", ...dto });

      await service.create(dto, "requester-1", "requester@example.com");

      expect(walletService.debit).toHaveBeenCalledWith(
        "requester-1",
        1000,
        WalletTransactionType.ERRAND_PAYMENT,
        expect.any(Object)
      );
      expect(walletService.linkTransactionToErrand).toHaveBeenCalledWith(
        "payment-tx-1",
        "errand-1"
      );
    });

    it("throws and creates nothing when the wallet balance is insufficient", async () => {
      walletService.debit.mockRejectedValue(
        new BadRequestException("Insufficient wallet balance")
      );

      await expect(
        service.create(dto, "requester-1", "requester@example.com")
      ).rejects.toThrow(BadRequestException);
      expect(errandsRepo.save).not.toHaveBeenCalled();
    });

    it("reverses the payment if errand creation fails after the debit succeeded", async () => {
      errandsRepo.save.mockRejectedValueOnce(new Error("db error"));

      await expect(
        service.create(dto, "requester-1", "requester@example.com")
      ).rejects.toThrow("db error");
      expect(walletService.reverseTransaction).toHaveBeenCalledWith(
        "payment-tx-1",
        expect.any(String)
      );
    });

    it("creates a non-boosted errand without touching payments or AI", async () => {
      errandsRepo.findOne.mockResolvedValue({ id: "errand-1", ...dto });

      const result = await service.create(
        dto,
        "requester-1",
        "requester@example.com"
      );

      expect(result.boostPayment).toBeUndefined();
      expect(paymentsService.initializeBoostPayment).not.toHaveBeenCalled();
    });

    it("initializes a boost payment using the configurable price when isBoosted is set", async () => {
      errandsRepo.findOne.mockResolvedValue({ id: "errand-1", ...dto });
      paymentsService.initializeBoostPayment.mockResolvedValue({
        paymentId: "payment-1",
        authorizationUrl: "https://paystack.test/pay",
        reference: "boost-errand-1-123",
      });

      const result = await service.create(
        { ...dto, isBoosted: true },
        "requester-1",
        "requester@example.com"
      );

      expect(settingsService.get).toHaveBeenCalledWith(
        "ai_boost_price_ngn",
        2500
      );
      expect(paymentsService.initializeBoostPayment).toHaveBeenCalledWith(
        "errand-1",
        "requester-1",
        "requester@example.com",
        2500
      );
      expect(result.boostPayment).toEqual({
        authorizationUrl: "https://paystack.test/pay",
        reference: "boost-errand-1-123",
      });
    });

    it("still returns the errand if boost payment initialization fails", async () => {
      errandsRepo.findOne.mockResolvedValue({ id: "errand-1", ...dto });
      paymentsService.initializeBoostPayment.mockRejectedValue(
        new Error("paystack down")
      );

      const result = await service.create(
        { ...dto, isBoosted: true },
        "requester-1",
        "requester@example.com"
      );

      expect(result.boostPayment).toBeUndefined();
    });
  });

  describe("handleBoostPaymentSucceeded", () => {
    it("flips isBoosted, rewrites the title, and notifies nearby top-rated runners", async () => {
      errandsRepo.findOne.mockResolvedValue({
        id: "errand-1",
        title: "Buy groceries",
        description: "Get milk and eggs",
        locations: [
          { type: LocationType.PICKUP, latitude: 6.5, longitude: 3.4 },
        ],
      });
      aiService.rewriteBoostTitle.mockResolvedValue(
        "URGENT: Buy groceries now!"
      );

      await service.handleBoostPaymentSucceeded({ errandId: "errand-1" });

      expect(errandsRepo.update).toHaveBeenCalledWith(
        "errand-1",
        expect.objectContaining({ isBoosted: true })
      );
      expect(errandsRepo.update).toHaveBeenCalledWith("errand-1", {
        title: "URGENT: Buy groceries now!",
      });
      expect(
        notificationsService.notifyNearbyTopRatedRunners
      ).toHaveBeenCalledWith(
        expect.objectContaining({ latitude: 6.5, longitude: 3.4 })
      );
    });

    it("still flips isBoosted even if the AI title rewrite fails", async () => {
      errandsRepo.findOne.mockResolvedValue({
        id: "errand-1",
        title: "Buy groceries",
        description: "Get milk and eggs",
        locations: [],
      });
      aiService.rewriteBoostTitle.mockRejectedValue(
        new Error("AI unavailable")
      );

      await service.handleBoostPaymentSucceeded({ errandId: "errand-1" });

      expect(errandsRepo.update).toHaveBeenCalledWith(
        "errand-1",
        expect.objectContaining({ isBoosted: true })
      );
    });

    it("skips notification when the errand has no pickup coordinates", async () => {
      errandsRepo.findOne.mockResolvedValue({
        id: "errand-1",
        title: "Buy groceries",
        description: "Get milk and eggs",
        locations: [],
      });
      aiService.rewriteBoostTitle.mockResolvedValue("Buy groceries");

      await service.handleBoostPaymentSucceeded({ errandId: "errand-1" });

      expect(
        notificationsService.notifyNearbyTopRatedRunners
      ).not.toHaveBeenCalled();
    });
  });

  describe("acceptErrand", () => {
    const openErrand = {
      id: "errand-1",
      status: ErrandStatus.OPEN,
      requesterId: "requester-1",
    };

    it("rejects requesters trying to accept their own errand", async () => {
      errandsRepo.findOne.mockResolvedValue(openErrand);

      await expect(
        service.acceptErrand("errand-1", "requester-1", UserRole.BOTH)
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejects users with the REQUESTER-only role", async () => {
      errandsRepo.findOne.mockResolvedValue(openErrand);

      await expect(
        service.acceptErrand("errand-1", "runner-1", UserRole.REQUESTER)
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejects accepting an errand that is not OPEN", async () => {
      errandsRepo.findOne.mockResolvedValue({
        ...openErrand,
        status: ErrandStatus.ACCEPTED,
      });

      await expect(
        service.acceptErrand("errand-1", "runner-1", UserRole.RUNNER)
      ).rejects.toThrow(BadRequestException);
    });

    it("assigns the runner and moves the errand to ACCEPTED", async () => {
      errandsRepo.findOne
        .mockResolvedValueOnce({ ...openErrand })
        .mockResolvedValueOnce({
          ...openErrand,
          status: ErrandStatus.ACCEPTED,
          runnerId: "runner-1",
          etaMinutes: 40,
        });

      const result = await service.acceptErrand(
        "errand-1",
        "runner-1",
        UserRole.RUNNER
      );

      expect(result.status).toBe(ErrandStatus.ACCEPTED);
      expect(result.runnerId).toBe("runner-1");
    });

    it("throws ConflictException when another runner accepted it first", async () => {
      errandsRepo.findOne.mockResolvedValue({ ...openErrand });
      updateExecute.mockResolvedValue({ affected: 0 });

      await expect(
        service.acceptErrand("errand-1", "runner-1", UserRole.RUNNER)
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("updateStatus", () => {
    const inProgressErrand = {
      id: "errand-1",
      status: ErrandStatus.IN_PROGRESS,
      requesterId: "requester-1",
      runnerId: "runner-1",
    };

    it("rejects users who are not part of the errand", async () => {
      errandsRepo.findOne.mockResolvedValue(inProgressErrand);

      await expect(
        service.updateStatus(
          "errand-1",
          { status: ErrandStatus.COMPLETED },
          "stranger"
        )
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejects completing an errand that is not IN_PROGRESS", async () => {
      errandsRepo.findOne.mockResolvedValue({
        ...inProgressErrand,
        status: ErrandStatus.ACCEPTED,
      });

      await expect(
        service.updateStatus(
          "errand-1",
          { status: ErrandStatus.COMPLETED },
          "runner-1"
        )
      ).rejects.toThrow(BadRequestException);
    });

    it("marks the errand COMPLETED and triggers a payout", async () => {
      errandsRepo.findOne.mockResolvedValue({ ...inProgressErrand });

      const result = await service.updateStatus(
        "errand-1",
        { status: ErrandStatus.COMPLETED },
        "runner-1"
      );

      expect(result.status).toBe(ErrandStatus.COMPLETED);
      expect(result.completedAt).toBeInstanceOf(Date);
      expect(paymentsService.processPayout).toHaveBeenCalledWith("errand-1");
    });

    it("does not fail the request if payout processing throws", async () => {
      errandsRepo.findOne.mockResolvedValue({ ...inProgressErrand });
      paymentsService.processPayout.mockRejectedValue(
        new Error("paystack down")
      );

      const result = await service.updateStatus(
        "errand-1",
        { status: ErrandStatus.COMPLETED },
        "runner-1"
      );

      expect(result.status).toBe(ErrandStatus.COMPLETED);
    });
  });

  describe("cancel", () => {
    it("rejects cancellation from anyone but the requester", async () => {
      errandsRepo.findOne.mockResolvedValue({
        id: "errand-1",
        status: ErrandStatus.OPEN,
        requesterId: "requester-1",
      });

      await expect(service.cancel("errand-1", "runner-1")).rejects.toThrow(
        ForbiddenException
      );
    });

    it("rejects cancelling an already-completed errand", async () => {
      errandsRepo.findOne.mockResolvedValue({
        id: "errand-1",
        status: ErrandStatus.COMPLETED,
        requesterId: "requester-1",
      });

      await expect(service.cancel("errand-1", "requester-1")).rejects.toThrow(
        BadRequestException
      );
    });

    it("rejects cancelling an errand that has already been accepted by a runner", async () => {
      errandsRepo.findOne.mockResolvedValue({
        id: "errand-1",
        status: ErrandStatus.ACCEPTED,
        requesterId: "requester-1",
      });

      await expect(service.cancel("errand-1", "requester-1")).rejects.toThrow(
        BadRequestException
      );
      expect(paymentsService.processRefund).not.toHaveBeenCalled();
    });

    it("rejects cancelling an errand that is IN_PROGRESS", async () => {
      errandsRepo.findOne.mockResolvedValue({
        id: "errand-1",
        status: ErrandStatus.IN_PROGRESS,
        requesterId: "requester-1",
      });

      await expect(service.cancel("errand-1", "requester-1")).rejects.toThrow(
        BadRequestException
      );
    });

    it("cancels an OPEN errand and triggers a refund", async () => {
      errandsRepo.findOne.mockResolvedValue({
        id: "errand-1",
        status: ErrandStatus.OPEN,
        requesterId: "requester-1",
      });

      await service.cancel("errand-1", "requester-1");

      expect(errandsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: ErrandStatus.CANCELLED })
      );
      expect(paymentsService.processRefund).toHaveBeenCalledWith("errand-1");
    });
  });
});
