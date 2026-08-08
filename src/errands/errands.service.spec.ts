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
import {
  ErrandApplication,
  ErrandApplicationStatus,
} from "./entities/errand-application.entity";
import { ErrandConcern } from "./entities/errand-concern.entity";
import { UserRole } from "../users/entities/user.entity";
import { PaymentsService } from "../payments/payments.service";
import { SettingsService } from "../settings/settings.service";
import { AiService } from "../ai/ai.service";
import { NotificationsService } from "../notifications/notifications.service";
import { WalletService } from "../wallet/wallet.service";
import { WalletTransactionType } from "../wallet/entities/wallet-transaction.entity";
import { UsersService } from "../users/users.service";
import { ReferralsService } from "../referrals/referrals.service";
import { KycService } from "../kyc/kyc.service";
import { KYCStatus } from "../users/entities/kyc.entity";
import { CountryConfigService } from "../settings/country-config.service";

describe("ErrandsService", () => {
  let service: ErrandsService;
  let errandsRepo: any;
  let paymentsService: jest.Mocked<PaymentsService>;
  let settingsService: jest.Mocked<SettingsService>;
  let aiService: jest.Mocked<AiService>;
  let notificationsService: jest.Mocked<NotificationsService>;
  let walletService: jest.Mocked<WalletService>;
  let usersService: jest.Mocked<UsersService>;
  let referralsService: jest.Mocked<ReferralsService>;
  let kycService: jest.Mocked<KycService>;
  let updateExecute: jest.Mock;
  let queryBuilder: any;
  let applicationsRepo: any;

  beforeEach(async () => {
    updateExecute = jest.fn().mockResolvedValue({ affected: 1 });
    queryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: updateExecute,
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
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
            count: jest.fn().mockResolvedValue(1),
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
          provide: getRepositoryToken(ErrandApplication),
          useValue: {
            create: jest.fn((data) => ({ id: "application-1", ...data })),
            save: jest.fn((data) => Promise.resolve({ ...data })),
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn(),
            update: jest.fn().mockResolvedValue(undefined),
            count: jest.fn().mockResolvedValue(0),
          },
        },
        {
          provide: getRepositoryToken(ErrandConcern),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: PaymentsService,
          useValue: {
            processPayout: jest.fn().mockResolvedValue(null),
            processRefund: jest.fn().mockResolvedValue(null),
          },
        },
        {
          provide: SettingsService,
          useValue: {
            get: jest.fn((key: string, fallback?: any) => fallback),
          },
        },
        {
          provide: AiService,
          useValue: { rewriteBoostTitle: jest.fn() },
        },
        {
          provide: NotificationsService,
          useValue: {
            notifyNearbyTopRatedRunners: jest.fn().mockResolvedValue(undefined),
            notifyNearbyProUsers: jest.fn().mockResolvedValue(undefined),
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
        {
          provide: UsersService,
          useValue: {
            findOne: jest.fn().mockResolvedValue({
              id: "user-1",
              proExpiresAt: null,
              phone: "+2348012345678",
            }),
            toPublicProfile: jest.fn((u) => ({ id: u?.id, name: u?.name })),
            resetErrandFailures: jest.fn().mockResolvedValue(undefined),
            recordPostingFailure: jest.fn().mockResolvedValue(undefined),
            resetPostingFailures: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ReferralsService,
          useValue: {
            completeIfPending: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: KycService,
          useValue: {
            getKyc: jest.fn().mockResolvedValue({ status: KYCStatus.APPROVED }),
          },
        },
        {
          provide: CountryConfigService,
          useValue: {
            get: jest.fn().mockResolvedValue({
              country: "Nigeria",
              currencyCode: "NGN",
              currencySymbol: "₦",
              boostPrice: 2500,
              platformFeePercent: 10,
              priorityPriceThreshold: 20000,
              lightKycPriceThreshold: 5000,
              proPlatformFeePercent: 5,
              surgeThresholdOpenErrands: 50,
              surgeMultiplier: 1.5,
              paymentGatewayProvider: "paystack",
            }),
          },
        },
      ],
    }).compile();

    service = module.get(ErrandsService);
    errandsRepo = module.get(getRepositoryToken(Errand));
    applicationsRepo = module.get(getRepositoryToken(ErrandApplication));
    paymentsService = module.get(PaymentsService);
    settingsService = module.get(SettingsService);
    aiService = module.get(AiService);
    notificationsService = module.get(NotificationsService);
    walletService = module.get(WalletService);
    usersService = module.get(UsersService);
    referralsService = module.get(ReferralsService);
    kycService = module.get(KycService);
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

    it("escrows the tip alongside the price in the same debit", async () => {
      const dtoWithTip = { ...dto, tip: 200 };
      errandsRepo.findOne.mockResolvedValue({ id: "errand-1", ...dtoWithTip });

      await service.create(dtoWithTip, "requester-1", "requester@example.com");

      expect(walletService.debit).toHaveBeenCalledWith(
        "requester-1",
        1200,
        WalletTransactionType.ERRAND_PAYMENT,
        expect.any(Object)
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

    it("creates a non-boosted errand without touching the wallet a second time or AI", async () => {
      errandsRepo.findOne.mockResolvedValue({ id: "errand-1", ...dto });

      const result = await service.create(
        dto,
        "requester-1",
        "requester@example.com"
      );

      expect(result.boostFailed).toBeUndefined();
      expect(walletService.debit).toHaveBeenCalledTimes(1);
      expect(aiService.rewriteBoostTitle).not.toHaveBeenCalled();
    });

    it("debits the wallet for the configurable boost price and activates the boost when isBoosted is set", async () => {
      errandsRepo.findOne.mockResolvedValue({
        id: "errand-1",
        ...dto,
        locations: [
          { type: LocationType.PICKUP, latitude: 6.5, longitude: 3.4 },
        ],
      });
      aiService.rewriteBoostTitle.mockResolvedValue(
        "URGENT: Buy groceries now!"
      );

      const result = await service.create(
        { ...dto, isBoosted: true },
        "requester-1",
        "requester@example.com"
      );

      expect(walletService.debit).toHaveBeenCalledWith(
        "requester-1",
        2500,
        WalletTransactionType.BOOST,
        expect.objectContaining({ errandId: "errand-1" })
      );
      expect(errandsRepo.update).toHaveBeenCalledWith(
        "errand-1",
        expect.objectContaining({ isBoosted: true })
      );
      expect(result.isBoosted).toBe(true);
      expect(result.boostFailed).toBeUndefined();
      expect(
        notificationsService.notifyNearbyTopRatedRunners
      ).toHaveBeenCalledWith(
        expect.objectContaining({ latitude: 6.5, longitude: 3.4 })
      );
    });

    it("still creates the errand (without the boost) when the wallet balance can't cover the boost fee", async () => {
      errandsRepo.findOne.mockResolvedValue({ id: "errand-1", ...dto });
      walletService.debit.mockImplementation((_userId, _amount, type) =>
        type === WalletTransactionType.BOOST
          ? Promise.reject(new BadRequestException("Insufficient wallet balance"))
          : Promise.resolve({ id: "payment-tx-1" } as any)
      );

      const result = await service.create(
        { ...dto, isBoosted: true },
        "requester-1",
        "requester@example.com"
      );

      expect(result.boostFailed).toBe(true);
      expect(result.boostFailureReason).toBe("insufficient_balance");
      expect(errandsRepo.update).not.toHaveBeenCalledWith(
        "errand-1",
        expect.objectContaining({ isBoosted: true })
      );
    });

    it("sets a priority window when the price is above the configurable threshold", async () => {
      errandsRepo.findOne.mockResolvedValue({ id: "errand-1", ...dto });

      await service.create(
        { ...dto, price: 999_999 },
        "requester-1",
        "requester@example.com"
      );

      expect(errandsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ priorityUntil: expect.any(Date) })
      );
    });

    it("sets a priority window when multiple runners are required, regardless of price", async () => {
      errandsRepo.findOne.mockResolvedValue({ id: "errand-1", ...dto });

      await service.create(
        { ...dto, requiredRunners: 3 },
        "requester-1",
        "requester@example.com"
      );

      expect(errandsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          requiredRunners: 3,
          priorityUntil: expect.any(Date),
        })
      );
    });

    it("does not set a priority window for an ordinary, single-runner, low-price errand", async () => {
      errandsRepo.findOne.mockResolvedValue({ id: "errand-1", ...dto });

      await service.create(dto, "requester-1", "requester@example.com");

      expect(errandsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ priorityUntil: undefined })
      );
    });

    it("notifies nearby Pro users for every errand with a pickup location, boosted or not", async () => {
      errandsRepo.findOne.mockResolvedValue({
        id: "errand-1",
        ...dto,
        locations: [
          { type: LocationType.PICKUP, latitude: 6.5, longitude: 3.4 },
        ],
      });

      await service.create(dto, "requester-1", "requester@example.com");

      expect(notificationsService.notifyNearbyProUsers).toHaveBeenCalledWith(
        expect.objectContaining({ latitude: 6.5, longitude: 3.4 })
      );
    });

    it("skips the Pro notification when the errand has no pickup coordinates", async () => {
      errandsRepo.findOne.mockResolvedValue({ id: "errand-1", ...dto });

      await service.create(dto, "requester-1", "requester@example.com");

      expect(notificationsService.notifyNearbyProUsers).not.toHaveBeenCalled();
    });

    it("sets a priority window for a boosted errand regardless of price", async () => {
      errandsRepo.findOne.mockResolvedValue({ id: "errand-1", ...dto });

      await service.create(
        { ...dto, isBoosted: true },
        "requester-1",
        "requester@example.com"
      );

      expect(errandsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ priorityUntil: expect.any(Date) })
      );
    });

    it("blocks a permanently posting-banned requester from creating an errand", async () => {
      usersService.findOne.mockResolvedValue({
        id: "requester-1",
        permanentlyBannedFromPosting: true,
      } as any);

      await expect(
        service.create(dto, "requester-1", "requester@example.com")
      ).rejects.toThrow(ForbiddenException);
      expect(walletService.debit).not.toHaveBeenCalled();
    });

    it("blocks a temporarily posting-banned requester from creating an errand", async () => {
      usersService.findOne.mockResolvedValue({
        id: "requester-1",
        requesterBannedUntil: new Date(Date.now() + 60_000),
      } as any);

      await expect(
        service.create(dto, "requester-1", "requester@example.com")
      ).rejects.toThrow(ForbiddenException);
      expect(walletService.debit).not.toHaveBeenCalled();
    });

    it("allows creation once a temporary posting ban has expired", async () => {
      usersService.findOne.mockResolvedValue({
        id: "requester-1",
        requesterBannedUntil: new Date(Date.now() - 60_000),
      } as any);
      errandsRepo.findOne.mockResolvedValue({ id: "errand-1", ...dto });

      await service.create(dto, "requester-1", "requester@example.com");

      expect(walletService.debit).toHaveBeenCalled();
    });
  });

  describe("getBoostPriceQuote", () => {
    it("returns the flat boost price when the open-errand count is below the surge threshold", async () => {
      errandsRepo.count.mockResolvedValue(10);

      const result = await service.getBoostPriceQuote("requester-1");

      expect(result).toEqual({
        price: 2500,
        isSurge: false,
        currencySymbol: "₦",
      });
    });

    it("multiplies the boost price by the surge multiplier once the open-errand count hits the threshold", async () => {
      errandsRepo.count.mockResolvedValue(50);

      const result = await service.getBoostPriceQuote("requester-1");

      expect(result).toEqual({
        price: 3750,
        isSurge: true,
        currencySymbol: "₦",
      });
    });
  });

  describe("findAll", () => {
    it("hides priority-window errands from a non-Pro caller", async () => {
      usersService.findOne.mockResolvedValue({
        id: "user-1",
        proExpiresAt: null,
      } as any);

      await service.findAll({} as any, "user-1");

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        "(errand.priorityUntil IS NULL OR errand.priorityUntil <= :now)",
        expect.objectContaining({ now: expect.any(Date) })
      );
    });

    it("does not apply the priority filter for a Pro caller", async () => {
      usersService.findOne.mockResolvedValue({
        id: "user-1",
        proExpiresAt: new Date(Date.now() + 60_000),
      } as any);

      await service.findAll({} as any, "user-1");

      expect(queryBuilder.andWhere).not.toHaveBeenCalledWith(
        expect.stringContaining("priorityUntil"),
        expect.any(Object)
      );
    });

    it("hides the caller's own errands when browsing open errands", async () => {
      await service.findAll({ status: ErrandStatus.OPEN } as any, "user-1");

      expect(queryBuilder.where).toHaveBeenCalledWith(
        "errand.requesterId != :userId",
        { userId: "user-1" }
      );
    });

    it("does not hide the caller's own errands for other status filters", async () => {
      await service.findAll({ status: ErrandStatus.COMPLETED } as any, "user-1");

      expect(queryBuilder.where).not.toHaveBeenCalled();
    });

    it("does not hide the caller's own errands when no status filter is given", async () => {
      await service.findAll({} as any, "user-1");

      expect(queryBuilder.where).not.toHaveBeenCalled();
    });
  });

  describe("acceptErrand", () => {
    const openErrand = {
      id: "errand-1",
      status: ErrandStatus.OPEN,
      requesterId: "requester-1",
    };

    it("rejects a non-Pro runner during an errand's priority window", async () => {
      errandsRepo.findOne.mockResolvedValue({
        ...openErrand,
        priorityUntil: new Date(Date.now() + 60_000),
      });
      usersService.findOne.mockResolvedValue({
        id: "runner-1",
        proExpiresAt: null,
      } as any);

      await expect(
        service.acceptErrand("errand-1", "runner-1", UserRole.RUNNER)
      ).rejects.toThrow(ForbiddenException);
    });

    it("allows a Pro runner to accept during the priority window", async () => {
      errandsRepo.findOne
        .mockResolvedValueOnce({
          ...openErrand,
          priorityUntil: new Date(Date.now() + 60_000),
        })
        .mockResolvedValueOnce({
          ...openErrand,
          status: ErrandStatus.ACCEPTED,
          runnerId: "runner-1",
        });
      usersService.findOne.mockResolvedValue({
        id: "runner-1",
        proExpiresAt: new Date(Date.now() + 60_000),
        phone: "+2348012345678",
      } as any);

      const result = await service.acceptErrand(
        "errand-1",
        "runner-1",
        UserRole.RUNNER
      );

      expect(result.status).toBe(ErrandStatus.ACCEPTED);
    });

    it("allows any runner once the priority window has passed", async () => {
      errandsRepo.findOne
        .mockResolvedValueOnce({
          ...openErrand,
          priorityUntil: new Date(Date.now() - 60_000),
        })
        .mockResolvedValueOnce({
          ...openErrand,
          status: ErrandStatus.ACCEPTED,
          runnerId: "runner-1",
        });

      const result = await service.acceptErrand(
        "errand-1",
        "runner-1",
        UserRole.RUNNER
      );

      expect(result.status).toBe(ErrandStatus.ACCEPTED);
    });

    it("rejects a runner with an active pick-up ban", async () => {
      errandsRepo.findOne.mockResolvedValue({ ...openErrand });
      usersService.findOne.mockResolvedValue({
        id: "runner-1",
        proExpiresAt: null,
        runnerBannedUntil: new Date(Date.now() + 60_000),
      } as any);

      await expect(
        service.acceptErrand("errand-1", "runner-1", UserRole.RUNNER)
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejects a runner with no phone number on file", async () => {
      errandsRepo.findOne.mockResolvedValue({ ...openErrand });
      usersService.findOne.mockResolvedValue({
        id: "runner-1",
        proExpiresAt: null,
        phone: undefined,
      } as any);

      await expect(
        service.acceptErrand("errand-1", "runner-1", UserRole.RUNNER)
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejects a runner with PENDING KYC from an errand at/above the light-KYC price threshold", async () => {
      errandsRepo.findOne.mockResolvedValue({ ...openErrand, price: 999_999 });
      usersService.findOne.mockResolvedValue({
        id: "runner-1",
        proExpiresAt: null,
        phone: "+2348012345678",
      } as any);
      kycService.getKyc.mockResolvedValue({ status: KYCStatus.PENDING } as any);

      await expect(
        service.acceptErrand("errand-1", "runner-1", UserRole.RUNNER)
      ).rejects.toThrow(ForbiddenException);
    });

    it("allows a runner with PENDING KYC to accept an errand below the light-KYC price threshold", async () => {
      errandsRepo.findOne
        .mockResolvedValueOnce({ ...openErrand, price: 1000 })
        .mockResolvedValueOnce({
          ...openErrand,
          price: 1000,
          status: ErrandStatus.ACCEPTED,
          runnerId: "runner-1",
        });
      usersService.findOne.mockResolvedValue({
        id: "runner-1",
        proExpiresAt: null,
        phone: "+2348012345678",
      } as any);
      kycService.getKyc.mockResolvedValue({ status: KYCStatus.PENDING } as any);

      const result = await service.acceptErrand(
        "errand-1",
        "runner-1",
        UserRole.RUNNER
      );

      expect(result.status).toBe(ErrandStatus.ACCEPTED);
    });

    it("rejects a runner with REJECTED KYC even for a low-price errand", async () => {
      errandsRepo.findOne.mockResolvedValue({ ...openErrand, price: 1000 });
      usersService.findOne.mockResolvedValue({
        id: "runner-1",
        proExpiresAt: null,
        phone: "+2348012345678",
      } as any);
      kycService.getKyc.mockResolvedValue({ status: KYCStatus.REJECTED } as any);

      await expect(
        service.acceptErrand("errand-1", "runner-1", UserRole.RUNNER)
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejects a runner with no KYC submission at all", async () => {
      errandsRepo.findOne.mockResolvedValue({ ...openErrand });
      usersService.findOne.mockResolvedValue({
        id: "runner-1",
        proExpiresAt: null,
        phone: "+2348012345678",
      } as any);
      kycService.getKyc.mockRejectedValue(new Error("not found"));

      await expect(
        service.acceptErrand("errand-1", "runner-1", UserRole.RUNNER)
      ).rejects.toThrow(ForbiddenException);
    });

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

    it("honors an admin-configured errand_accept_eta_minutes override", async () => {
      errandsRepo.findOne
        .mockResolvedValueOnce({ ...openErrand })
        .mockResolvedValueOnce({
          ...openErrand,
          status: ErrandStatus.ACCEPTED,
          runnerId: "runner-1",
        });
      settingsService.get.mockImplementation((key: string, fallback: any) =>
        key === "errand_accept_eta_minutes" ? 15 : fallback
      );

      await service.acceptErrand("errand-1", "runner-1", UserRole.RUNNER);

      expect(queryBuilder.set).toHaveBeenCalledWith(
        expect.objectContaining({ etaMinutes: 15 })
      );
    });

    it("throws ConflictException when another runner accepted it first", async () => {
      errandsRepo.findOne.mockResolvedValue({ ...openErrand });
      updateExecute.mockResolvedValue({ affected: 0 });

      await expect(
        service.acceptErrand("errand-1", "runner-1", UserRole.RUNNER)
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("applyToErrand", () => {
    const openErrand = {
      id: "errand-1",
      status: ErrandStatus.OPEN,
      requesterId: "requester-1",
    };

    it("rejects the requester applying to their own errand", async () => {
      errandsRepo.findOne.mockResolvedValue(openErrand);

      await expect(
        service.applyToErrand("errand-1", "requester-1", UserRole.BOTH)
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejects a REQUESTER-only role", async () => {
      errandsRepo.findOne.mockResolvedValue(openErrand);

      await expect(
        service.applyToErrand("errand-1", "runner-1", UserRole.REQUESTER)
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejects applying twice to the same errand", async () => {
      errandsRepo.findOne.mockResolvedValue(openErrand);
      applicationsRepo.findOne.mockResolvedValue({ id: "existing-application" });

      await expect(
        service.applyToErrand("errand-1", "runner-1", UserRole.RUNNER)
      ).rejects.toThrow(ConflictException);
    });

    it("rejects applying once the errand is no longer OPEN/PENDING", async () => {
      errandsRepo.findOne.mockResolvedValue({
        ...openErrand,
        status: ErrandStatus.ACCEPTED,
      });

      await expect(
        service.applyToErrand("errand-1", "runner-1", UserRole.RUNNER)
      ).rejects.toThrow(BadRequestException);
    });

    it("creates a PENDING application and flips an OPEN errand to PENDING", async () => {
      errandsRepo.findOne.mockResolvedValue(openErrand);
      applicationsRepo.findOne.mockResolvedValue(null);

      const result = await service.applyToErrand(
        "errand-1",
        "runner-1",
        UserRole.RUNNER,
        "I can do this now"
      );

      expect(result.status).toBe(ErrandApplicationStatus.PENDING);
      expect(errandsRepo.update).toHaveBeenCalledWith("errand-1", {
        status: ErrandStatus.PENDING,
      });
    });

    it("does not re-flip an already-PENDING errand to PENDING again", async () => {
      errandsRepo.findOne.mockResolvedValue({
        ...openErrand,
        status: ErrandStatus.PENDING,
      });
      applicationsRepo.findOne.mockResolvedValue(null);

      await service.applyToErrand("errand-1", "runner-2", UserRole.RUNNER);

      expect(errandsRepo.update).not.toHaveBeenCalled();
    });

    it("rejects a runner with an active pick-up ban", async () => {
      errandsRepo.findOne.mockResolvedValue(openErrand);
      usersService.findOne.mockResolvedValue({
        id: "runner-1",
        proExpiresAt: null,
        runnerBannedUntil: new Date(Date.now() + 60_000),
      } as any);

      await expect(
        service.applyToErrand("errand-1", "runner-1", UserRole.RUNNER)
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejects a runner with no phone number on file", async () => {
      errandsRepo.findOne.mockResolvedValue(openErrand);
      usersService.findOne.mockResolvedValue({
        id: "runner-1",
        proExpiresAt: null,
        phone: undefined,
      } as any);

      await expect(
        service.applyToErrand("errand-1", "runner-1", UserRole.RUNNER)
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejects a runner whose identity KYC isn't APPROVED", async () => {
      errandsRepo.findOne.mockResolvedValue(openErrand);
      usersService.findOne.mockResolvedValue({
        id: "runner-1",
        proExpiresAt: null,
        phone: "+2348012345678",
      } as any);
      kycService.getKyc.mockResolvedValue({ status: KYCStatus.REJECTED } as any);

      await expect(
        service.applyToErrand("errand-1", "runner-1", UserRole.RUNNER)
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejects a runner with PENDING KYC applying to an errand at/above the light-KYC price threshold", async () => {
      errandsRepo.findOne.mockResolvedValue({ ...openErrand, price: 999_999 });
      usersService.findOne.mockResolvedValue({
        id: "runner-1",
        proExpiresAt: null,
        phone: "+2348012345678",
      } as any);
      kycService.getKyc.mockResolvedValue({ status: KYCStatus.PENDING } as any);

      await expect(
        service.applyToErrand("errand-1", "runner-1", UserRole.RUNNER)
      ).rejects.toThrow(ForbiddenException);
    });

    it("allows a runner with PENDING KYC to apply to an errand below the light-KYC price threshold", async () => {
      errandsRepo.findOne.mockResolvedValue({ ...openErrand, price: 1000 });
      applicationsRepo.findOne.mockResolvedValue(null);
      usersService.findOne.mockResolvedValue({
        id: "runner-1",
        proExpiresAt: null,
        phone: "+2348012345678",
      } as any);
      kycService.getKyc.mockResolvedValue({ status: KYCStatus.PENDING } as any);

      const result = await service.applyToErrand(
        "errand-1",
        "runner-1",
        UserRole.RUNNER
      );

      expect(result.status).toBe(ErrandApplicationStatus.PENDING);
    });
  });

  describe("getApplications", () => {
    it("returns every applicant, scrubbed to a public profile, for the requester", async () => {
      errandsRepo.findOne.mockResolvedValue({
        id: "errand-1",
        requesterId: "requester-1",
      });
      applicationsRepo.find.mockResolvedValue([
        {
          id: "application-1",
          errandId: "errand-1",
          status: ErrandApplicationStatus.PENDING,
          runner: { id: "runner-1", name: "Runner One", email: "leak@example.com" },
        },
      ]);

      const result = await service.getApplications("errand-1", "requester-1");

      expect(applicationsRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { errandId: "errand-1" } })
      );
      expect(result[0].runner).not.toHaveProperty("email");
      expect(result[0].runner).toEqual({ id: "runner-1", name: "Runner One" });
    });

    it("scopes to only the caller's own application for a non-requester", async () => {
      errandsRepo.findOne.mockResolvedValue({
        id: "errand-1",
        requesterId: "requester-1",
      });
      applicationsRepo.find.mockResolvedValue([]);

      await service.getApplications("errand-1", "runner-1");

      expect(applicationsRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { errandId: "errand-1", runnerId: "runner-1" },
        })
      );
    });
  });

  describe("acceptApplication", () => {
    it("rejects anyone but the requester", async () => {
      errandsRepo.findOne.mockResolvedValue({
        id: "errand-1",
        requesterId: "requester-1",
        status: ErrandStatus.PENDING,
      });

      await expect(
        service.acceptApplication("errand-1", "application-1", "someone-else")
      ).rejects.toThrow(ForbiddenException);
    });

    it("rejects accepting an application that's already been decided", async () => {
      errandsRepo.findOne.mockResolvedValue({
        id: "errand-1",
        requesterId: "requester-1",
        status: ErrandStatus.PENDING,
      });
      applicationsRepo.findOne.mockResolvedValue({
        id: "application-1",
        status: ErrandApplicationStatus.DECLINED,
      });

      await expect(
        service.acceptApplication("errand-1", "application-1", "requester-1")
      ).rejects.toThrow(BadRequestException);
    });

    it("accepts the application, assigns the runner, and declines the rest", async () => {
      errandsRepo.findOne
        .mockResolvedValueOnce({
          id: "errand-1",
          requesterId: "requester-1",
          status: ErrandStatus.PENDING,
        })
        .mockResolvedValueOnce({
          id: "errand-1",
          status: ErrandStatus.ACCEPTED,
          runnerId: "runner-1",
        });
      applicationsRepo.findOne.mockResolvedValue({
        id: "application-1",
        runnerId: "runner-1",
        status: ErrandApplicationStatus.PENDING,
      });

      const result = await service.acceptApplication(
        "errand-1",
        "application-1",
        "requester-1"
      );

      expect(result.status).toBe(ErrandStatus.ACCEPTED);
      expect(applicationsRepo.update).toHaveBeenCalledWith("application-1", {
        status: ErrandApplicationStatus.ACCEPTED,
      });
      expect(applicationsRepo.update).toHaveBeenCalledWith(
        { errandId: "errand-1", status: ErrandApplicationStatus.PENDING },
        { status: ErrandApplicationStatus.DECLINED }
      );
    });

    it("throws ConflictException if the errand was accepted concurrently", async () => {
      errandsRepo.findOne.mockResolvedValue({
        id: "errand-1",
        requesterId: "requester-1",
        status: ErrandStatus.PENDING,
      });
      applicationsRepo.findOne.mockResolvedValue({
        id: "application-1",
        runnerId: "runner-1",
        status: ErrandApplicationStatus.PENDING,
      });
      updateExecute.mockResolvedValue({ affected: 0 });

      await expect(
        service.acceptApplication("errand-1", "application-1", "requester-1")
      ).rejects.toThrow(ConflictException);
    });
  });

  describe("declineApplication", () => {
    it("rejects anyone but the requester", async () => {
      errandsRepo.findOne.mockResolvedValue({
        id: "errand-1",
        requesterId: "requester-1",
        status: ErrandStatus.PENDING,
      });

      await expect(
        service.declineApplication("errand-1", "application-1", "someone-else")
      ).rejects.toThrow(ForbiddenException);
    });

    it("reverts the errand to OPEN when the last pending application is declined", async () => {
      errandsRepo.findOne.mockResolvedValue({
        id: "errand-1",
        requesterId: "requester-1",
        status: ErrandStatus.PENDING,
      });
      applicationsRepo.findOne.mockResolvedValue({
        id: "application-1",
        status: ErrandApplicationStatus.PENDING,
      });
      applicationsRepo.count.mockResolvedValue(0);

      await service.declineApplication("errand-1", "application-1", "requester-1");

      expect(errandsRepo.update).toHaveBeenCalledWith("errand-1", {
        status: ErrandStatus.OPEN,
      });
    });

    it("keeps the errand PENDING when other applications are still pending", async () => {
      errandsRepo.findOne.mockResolvedValue({
        id: "errand-1",
        requesterId: "requester-1",
        status: ErrandStatus.PENDING,
      });
      applicationsRepo.findOne.mockResolvedValue({
        id: "application-1",
        status: ErrandApplicationStatus.PENDING,
      });
      applicationsRepo.count.mockResolvedValue(2);

      await service.declineApplication("errand-1", "application-1", "requester-1");

      expect(errandsRepo.update).not.toHaveBeenCalled();
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

    it("rejects setting PENDING manually - it's only set automatically on apply", async () => {
      errandsRepo.findOne.mockResolvedValue(inProgressErrand);

      await expect(
        service.updateStatus(
          "errand-1",
          { status: ErrandStatus.PENDING },
          "requester-1"
        )
      ).rejects.toThrow(BadRequestException);
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

    it("checks for a pending referral bonus for both the requester and runner on their first completed errand", async () => {
      errandsRepo.findOne.mockResolvedValue({ ...inProgressErrand });
      errandsRepo.count.mockResolvedValue(1); // this is their first completed errand

      await service.updateStatus(
        "errand-1",
        { status: ErrandStatus.COMPLETED },
        "runner-1"
      );

      expect(referralsService.completeIfPending).toHaveBeenCalledWith(
        "requester-1"
      );
      expect(referralsService.completeIfPending).toHaveBeenCalledWith(
        "runner-1"
      );
    });

    it("does not check for a referral bonus if this isn't the user's first completed errand", async () => {
      errandsRepo.findOne.mockResolvedValue({ ...inProgressErrand });
      errandsRepo.count.mockResolvedValue(2); // they've completed one before

      await service.updateStatus(
        "errand-1",
        { status: ErrandStatus.COMPLETED },
        "runner-1"
      );

      expect(referralsService.completeIfPending).not.toHaveBeenCalled();
    });

    it("honors an admin-configured referral_qualifying_errand_count override", async () => {
      errandsRepo.findOne.mockResolvedValue({ ...inProgressErrand });
      errandsRepo.count.mockResolvedValue(2); // 2nd completed errand
      settingsService.get.mockImplementation((key: string, fallback: any) =>
        key === "referral_qualifying_errand_count" ? 2 : fallback
      );

      await service.updateStatus(
        "errand-1",
        { status: ErrandStatus.COMPLETED },
        "runner-1"
      );

      expect(referralsService.completeIfPending).toHaveBeenCalledWith(
        "requester-1"
      );
    });

    it("does not fail the request if the referral completion check throws", async () => {
      errandsRepo.findOne.mockResolvedValue({ ...inProgressErrand });
      errandsRepo.count.mockRejectedValue(new Error("db down"));

      const result = await service.updateStatus(
        "errand-1",
        { status: ErrandStatus.COMPLETED },
        "runner-1"
      );

      expect(result.status).toBe(ErrandStatus.COMPLETED);
    });

    it("resets the runner's consecutive-failure streak on completion", async () => {
      errandsRepo.findOne.mockResolvedValue({ ...inProgressErrand });

      await service.updateStatus(
        "errand-1",
        { status: ErrandStatus.COMPLETED },
        "runner-1"
      );

      expect(usersService.resetErrandFailures).toHaveBeenCalledWith("runner-1");
    });

    it("does not fail the request if resetting the failure streak throws", async () => {
      errandsRepo.findOne.mockResolvedValue({ ...inProgressErrand });
      usersService.resetErrandFailures.mockRejectedValue(new Error("db down"));

      const result = await service.updateStatus(
        "errand-1",
        { status: ErrandStatus.COMPLETED },
        "runner-1"
      );

      expect(result.status).toBe(ErrandStatus.COMPLETED);
    });

    it("resets the requester's posting-failure streak on completion", async () => {
      errandsRepo.findOne.mockResolvedValue({ ...inProgressErrand });

      await service.updateStatus(
        "errand-1",
        { status: ErrandStatus.COMPLETED },
        "runner-1"
      );

      expect(usersService.resetPostingFailures).toHaveBeenCalledWith(
        "requester-1"
      );
    });

    it("does not fail the request if resetting the posting-failure streak throws", async () => {
      errandsRepo.findOne.mockResolvedValue({ ...inProgressErrand });
      usersService.resetPostingFailures.mockRejectedValue(new Error("db down"));

      const result = await service.updateStatus(
        "errand-1",
        { status: ErrandStatus.COMPLETED },
        "runner-1"
      );

      expect(result.status).toBe(ErrandStatus.COMPLETED);
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

    it("cancels a PENDING errand, declining any pending applications, and refunds", async () => {
      errandsRepo.findOne.mockResolvedValue({
        id: "errand-1",
        status: ErrandStatus.PENDING,
        requesterId: "requester-1",
      });

      await service.cancel("errand-1", "requester-1");

      expect(applicationsRepo.update).toHaveBeenCalledWith(
        { errandId: "errand-1", status: ErrandApplicationStatus.PENDING },
        { status: ErrandApplicationStatus.DECLINED }
      );
      expect(errandsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: ErrandStatus.CANCELLED })
      );
      expect(paymentsService.processRefund).toHaveBeenCalledWith("errand-1");
    });

    it("records a posting failure for the requester after cancelling", async () => {
      errandsRepo.findOne.mockResolvedValue({
        id: "errand-1",
        status: ErrandStatus.OPEN,
        requesterId: "requester-1",
      });

      await service.cancel("errand-1", "requester-1");

      expect(usersService.recordPostingFailure).toHaveBeenCalledWith(
        "requester-1"
      );
    });

    it("does not fail cancellation if recording the posting failure throws", async () => {
      errandsRepo.findOne.mockResolvedValue({
        id: "errand-1",
        status: ErrandStatus.OPEN,
        requesterId: "requester-1",
      });
      usersService.recordPostingFailure.mockRejectedValue(
        new Error("db down")
      );

      await expect(
        service.cancel("errand-1", "requester-1")
      ).resolves.not.toThrow();
    });
  });
});
