import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { UsersService } from "./users.service";
import { User } from "./entities/user.entity";
import { KYC, KYCStatus } from "./entities/kyc.entity";
import { RatingsService } from "../ratings/ratings.service";
import { OtpService } from "../otp/otp.service";

describe("UsersService", () => {
  let service: UsersService;
  let usersRepo: any;
  let kycRepo: any;
  let otpService: jest.Mocked<OtpService>;

  const user = { id: "user-1", email: "user@example.com" };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn().mockResolvedValue(user),
            create: jest.fn((data) => ({ id: "new-user-1", ...data })),
            save: jest.fn((data) => Promise.resolve(data)),
          },
        },
        {
          provide: getRepositoryToken(KYC),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn((data) => data),
            save: jest.fn((data) => Promise.resolve({ id: "kyc-1", ...data })),
          },
        },
        { provide: RatingsService, useValue: {} },
        {
          provide: OtpService,
          useValue: {
            request: jest.fn().mockResolvedValue(undefined),
            verify: jest.fn(),
            resend: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get(UsersService);
    usersRepo = module.get(getRepositoryToken(User));
    kycRepo = module.get(getRepositoryToken(KYC));
    otpService = module.get(OtpService);
  });

  describe("create", () => {
    const dto = {
      email: "new@example.com",
      name: "New User",
      password: "password123",
    } as any;

    it("generates a unique referral code for the new user", async () => {
      usersRepo.findOne.mockResolvedValue(null); // no existing user, no code collision

      const result: any = await service.create(dto);

      expect(result.referralCode).toMatch(/^CEL.{5}$/);
    });

    it("resolves a valid referralCode to the referrer's id", async () => {
      usersRepo.findOne
        .mockResolvedValueOnce(null) // existing-user-by-email/phone check
        .mockResolvedValueOnce({ id: "referrer-1", referralCode: "ABCD1234" }) // findByReferralCode
        .mockResolvedValueOnce(null); // referral-code-collision check

      const result: any = await service.create({
        ...dto,
        referralCode: "ABCD1234",
      });

      expect(result.referredByUserId).toBe("referrer-1");
    });

    it("silently ignores an unknown referralCode instead of failing registration", async () => {
      usersRepo.findOne
        .mockResolvedValueOnce(null) // existing-user check
        .mockResolvedValueOnce(null) // findByReferralCode - not found
        .mockResolvedValueOnce(null); // collision check

      const result: any = await service.create({
        ...dto,
        referralCode: "UNKNOWN1",
      });

      expect(result.referredByUserId).toBeUndefined();
    });
  });

  describe("submitKyc", () => {
    it("creates a fresh PENDING KYC record when none exists yet", async () => {
      kycRepo.findOne.mockResolvedValue(null);

      const result: any = await service.submitKyc(user.id, {
        bankAccountNumber: "0123456789",
        bankName: "Access Bank",
      });

      expect(result.status).toBe(KYCStatus.PENDING);
      expect(otpService.request).not.toHaveBeenCalled();
    });

    it("re-submitting a REJECTED KYC applies changes directly and resets to PENDING", async () => {
      kycRepo.findOne.mockResolvedValue({
        userId: user.id,
        status: KYCStatus.REJECTED,
        bankAccountNumber: "111",
        bankName: "Old Bank",
      });

      const result: any = await service.submitKyc(user.id, {
        bankAccountNumber: "222",
        bankName: "New Bank",
      });

      expect(result.status).toBe(KYCStatus.PENDING);
      expect(result.bankAccountNumber).toBe("222");
      expect(otpService.request).not.toHaveBeenCalled();
    });

    it("requires OTP confirmation instead of applying a bank change on an APPROVED KYC", async () => {
      kycRepo.findOne.mockResolvedValue({
        userId: user.id,
        status: KYCStatus.APPROVED,
        bankAccountNumber: "111",
        bankName: "Old Bank",
      });

      const result: any = await service.submitKyc(user.id, {
        bankAccountNumber: "999",
        bankName: "Old Bank",
      });

      expect(result.requiresConfirmation).toBe(true);
      expect(otpService.request).toHaveBeenCalledWith(
        "bank_change",
        user.id,
        user.email,
        expect.objectContaining({ pendingChanges: expect.any(Object) })
      );
      expect(kycRepo.save).not.toHaveBeenCalled();
    });

    it("applies a non-bank edit to an APPROVED KYC directly, keeping it APPROVED", async () => {
      kycRepo.findOne.mockResolvedValue({
        userId: user.id,
        status: KYCStatus.APPROVED,
        bankAccountNumber: "111",
        bankName: "Old Bank",
      });

      const result: any = await service.submitKyc(user.id, {
        idCardUrl: "https://example.com/new-id.jpg",
      });

      expect(result.status).toBe(KYCStatus.APPROVED);
      expect(otpService.request).not.toHaveBeenCalled();
    });
  });

  describe("resendBankChangeCode", () => {
    it("resends via the OTP service using the current user's email", async () => {
      await service.resendBankChangeCode(user.id);

      expect(otpService.resend).toHaveBeenCalledWith(
        "bank_change",
        user.id,
        user.email
      );
    });

    it("propagates the error when there's no pending bank change to resend", async () => {
      otpService.resend.mockRejectedValue(
        new Error("nothing pending to resend")
      );

      await expect(service.resendBankChangeCode(user.id)).rejects.toThrow(
        "nothing pending to resend"
      );
    });
  });

  describe("confirmBankChange", () => {
    it("applies the pending changes and resets status to PENDING", async () => {
      otpService.verify.mockResolvedValue({
        pendingChanges: { bankAccountNumber: "999", bankName: "New Bank" },
      });
      kycRepo.findOne.mockResolvedValue({
        userId: user.id,
        status: KYCStatus.APPROVED,
        bankAccountNumber: "111",
        bankName: "Old Bank",
      });

      const result = await service.confirmBankChange(user.id, "123456");

      expect(result.bankAccountNumber).toBe("999");
      expect(result.status).toBe(KYCStatus.PENDING);
    });
  });
});
