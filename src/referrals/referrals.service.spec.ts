import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { ReferralsService } from "./referrals.service";
import { Referral, ReferralStatus } from "./entities/referral.entity";
import { User } from "../users/entities/user.entity";
import { WalletService } from "../wallet/wallet.service";
import { WalletTransactionType } from "../wallet/entities/wallet-transaction.entity";
import { CountryConfigService } from "../settings/country-config.service";

describe("ReferralsService", () => {
  let service: ReferralsService;
  let referralsRepo: any;
  let usersRepo: any;
  let walletService: jest.Mocked<WalletService>;
  let countryConfigService: jest.Mocked<CountryConfigService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferralsService,
        {
          provide: getRepositoryToken(Referral),
          useValue: {
            create: jest.fn((data) => ({ id: "ref-1", ...data })),
            save: jest.fn((data) => Promise.resolve(data)),
            findOne: jest.fn(),
            count: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: jest.fn() },
        },
        {
          provide: WalletService,
          useValue: { credit: jest.fn() },
        },
        {
          provide: CountryConfigService,
          useValue: { get: jest.fn().mockResolvedValue({ referralBonus: 500 }) },
        },
      ],
    }).compile();

    service = module.get(ReferralsService);
    referralsRepo = module.get(getRepositoryToken(Referral));
    usersRepo = module.get(getRepositoryToken(User));
    walletService = module.get(WalletService);
    countryConfigService = module.get(CountryConfigService);
  });

  describe("createPending", () => {
    it("creates a PENDING referral when the referrer is currently Pro", async () => {
      usersRepo.findOne.mockResolvedValue({
        id: "referrer-1",
        proExpiresAt: new Date(Date.now() + 60_000),
      });

      const result: any = await service.createPending(
        "referrer-1",
        "referred-1"
      );

      expect(referralsRepo.create).toHaveBeenCalledWith({
        referrerId: "referrer-1",
        referredUserId: "referred-1",
        status: ReferralStatus.PENDING,
      });
      expect(result.status).toBe(ReferralStatus.PENDING);
    });

    it("creates a VOID referral immediately when the referrer is not currently Pro", async () => {
      usersRepo.findOne.mockResolvedValue({
        id: "referrer-1",
        proExpiresAt: null,
      });

      const result: any = await service.createPending(
        "referrer-1",
        "referred-1"
      );

      expect(referralsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: ReferralStatus.VOID })
      );
      expect(result.status).toBe(ReferralStatus.VOID);
    });

    it("creates a VOID referral when the referrer doesn't exist", async () => {
      usersRepo.findOne.mockResolvedValue(null);

      const result: any = await service.createPending(
        "referrer-1",
        "referred-1"
      );

      expect(result.status).toBe(ReferralStatus.VOID);
    });
  });

  describe("completeIfPending", () => {
    it("does nothing when there's no pending referral for that user", async () => {
      referralsRepo.findOne.mockResolvedValue(null);

      await service.completeIfPending("referred-1");

      expect(walletService.credit).not.toHaveBeenCalled();
    });

    it("pays out the configurable bonus for a pending referral, even if the referrer's Pro has since lapsed", async () => {
      referralsRepo.findOne.mockResolvedValue({
        id: "ref-1",
        referrerId: "referrer-1",
        referredUserId: "referred-1",
        status: ReferralStatus.PENDING,
      });
      usersRepo.findOne.mockResolvedValue({ id: "referrer-1", country: "Nigeria" });

      await service.completeIfPending("referred-1");

      expect(countryConfigService.get).toHaveBeenCalledWith("Nigeria");
      expect(walletService.credit).toHaveBeenCalledWith(
        "referrer-1",
        500,
        WalletTransactionType.REFERRAL_BONUS,
        expect.any(Object)
      );
      expect(referralsRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: ReferralStatus.COMPLETED,
          bonusAmount: 500,
        })
      );
    });

    it("does not touch an already-VOID referral (voided at signup time, not pending)", async () => {
      referralsRepo.findOne.mockResolvedValue(null); // VOID rows don't match the PENDING lookup

      await service.completeIfPending("referred-1");

      expect(walletService.credit).not.toHaveBeenCalled();
      expect(referralsRepo.save).not.toHaveBeenCalled();
    });
  });

  describe("getStats", () => {
    it("returns the user's referral code and counts by status", async () => {
      usersRepo.findOne.mockResolvedValue({ referralCode: "ABCD1234" });
      referralsRepo.count
        .mockResolvedValueOnce(2) // pending
        .mockResolvedValueOnce(3) // completed
        .mockResolvedValueOnce(1); // void

      const result = await service.getStats("user-1");

      expect(result).toEqual({
        referralCode: "ABCD1234",
        pending: 2,
        completed: 3,
        void: 1,
      });
    });
  });
});
