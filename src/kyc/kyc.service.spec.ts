import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { KycService } from "./kyc.service";
import { KYC, KYCStatus } from "../users/entities/kyc.entity";
import { UsersService } from "../users/users.service";
import { OtpService } from "../otp/otp.service";
import { DojahService } from "./services/dojah.service";

describe("KycService", () => {
  let service: KycService;
  let kycRepo: any;
  let usersService: jest.Mocked<UsersService>;
  let otpService: jest.Mocked<OtpService>;
  let dojahService: jest.Mocked<DojahService>;

  const kycDto = {
    nin: "12345678901",
    ninImageUrl: "https://example.com/nin.jpg",
  };

  const user = { id: "user-1", email: "user@example.com" };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KycService,
        {
          provide: getRepositoryToken(KYC),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn((data) => data),
            save: jest.fn((data) => Promise.resolve({ id: "kyc-1", ...data })),
            find: jest.fn(),
          },
        },
        {
          provide: UsersService,
          useValue: { findOne: jest.fn().mockResolvedValue(user) },
        },
        {
          provide: OtpService,
          useValue: {
            request: jest.fn().mockResolvedValue(undefined),
            verify: jest.fn(),
            resend: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: DojahService,
          useValue: {
            verifyNin: jest.fn().mockResolvedValue({ verified: true, data: {} }),
            verifyBvn: jest.fn().mockResolvedValue({ verified: true, data: {} }),
          },
        },
      ],
    }).compile();

    service = module.get(KycService);
    kycRepo = module.get(getRepositoryToken(KYC));
    usersService = module.get(UsersService);
    otpService = module.get(OtpService);
    dojahService = module.get(DojahService);
  });

  describe("submitIdentity", () => {
    it("creates a fresh PENDING KYC record when none exists yet", async () => {
      kycRepo.findOne.mockResolvedValue(null);

      const result: any = await service.submitIdentity(user.id, kycDto);

      expect(result.status).toBe(KYCStatus.PENDING);
      expect(dojahService.verifyNin).toHaveBeenCalledWith(kycDto.nin);
    });

    it("re-submitting a REJECTED identity applies changes directly and resets to PENDING", async () => {
      kycRepo.findOne.mockResolvedValue({
        userId: user.id,
        status: KYCStatus.REJECTED,
        nin: "00000000000",
      });

      const result: any = await service.submitIdentity(user.id, kycDto);

      expect(result.status).toBe(KYCStatus.PENDING);
      expect(result.nin).toBe(kycDto.nin);
    });

    it("applies an edit to an already-APPROVED identity directly, keeping it APPROVED", async () => {
      kycRepo.findOne.mockResolvedValue({
        userId: user.id,
        status: KYCStatus.APPROVED,
        nin: kycDto.nin,
      });

      const result: any = await service.submitIdentity(user.id, {
        ...kycDto,
        idCardUrl: "https://example.com/new-id.jpg",
      });

      expect(result.status).toBe(KYCStatus.APPROVED);
    });

    it("never touches bank fields or the OTP service", async () => {
      kycRepo.findOne.mockResolvedValue({
        userId: user.id,
        status: KYCStatus.APPROVED,
        nin: kycDto.nin,
        bankAccountNumber: "111",
        bankName: "Old Bank",
      });

      const result: any = await service.submitIdentity(user.id, kycDto);

      expect(result.bankAccountNumber).toBe("111");
      expect(result.bankName).toBe("Old Bank");
      expect(otpService.request).not.toHaveBeenCalled();
    });
  });

  describe("submitBankDetails", () => {
    const bankDto = {
      bankAccountNumber: "0123456789",
      bankName: "Access Bank",
      bankAccountName: "John Doe",
    };

    it("saves bank details directly when there's no KYC record yet", async () => {
      kycRepo.findOne.mockResolvedValue(null);

      const result: any = await service.submitBankDetails(user.id, bankDto);

      expect(result.bankAccountNumber).toBe(bankDto.bankAccountNumber);
      expect(otpService.request).not.toHaveBeenCalled();
    });

    it("saves bank details directly without touching status when identity isn't approved yet", async () => {
      kycRepo.findOne.mockResolvedValue({
        userId: user.id,
        status: KYCStatus.PENDING,
        bankAccountNumber: "111",
        bankName: "Old Bank",
      });

      const result: any = await service.submitBankDetails(user.id, bankDto);

      expect(result.bankAccountNumber).toBe(bankDto.bankAccountNumber);
      expect(result.status).toBe(KYCStatus.PENDING);
      expect(otpService.request).not.toHaveBeenCalled();
    });

    it("requires OTP confirmation instead of applying a bank change once identity is APPROVED", async () => {
      kycRepo.findOne.mockResolvedValue({
        userId: user.id,
        status: KYCStatus.APPROVED,
        bankAccountNumber: "111",
        bankName: "Old Bank",
      });

      const result: any = await service.submitBankDetails(user.id, bankDto);

      expect(result.requiresConfirmation).toBe(true);
      expect(otpService.request).toHaveBeenCalledWith(
        "bank_change",
        user.id,
        user.email,
        expect.objectContaining({ pendingChanges: bankDto })
      );
      expect(kycRepo.save).not.toHaveBeenCalled();
    });

    it("does not require OTP when the bank details haven't actually changed", async () => {
      kycRepo.findOne.mockResolvedValue({
        userId: user.id,
        status: KYCStatus.APPROVED,
        ...bankDto,
      });

      const result: any = await service.submitBankDetails(user.id, bankDto);

      expect(result.requiresConfirmation).toBeUndefined();
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

  describe("getKyc", () => {
    it("throws when there's no KYC submission for the user", async () => {
      kycRepo.findOne.mockResolvedValue(null);

      await expect(service.getKyc(user.id)).rejects.toThrow(
        "KYC submission not found"
      );
    });
  });

  describe("listKycByStatus", () => {
    it("filters by status when provided", async () => {
      kycRepo.find.mockResolvedValue([]);

      await service.listKycByStatus(KYCStatus.PENDING);

      expect(kycRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: KYCStatus.PENDING } })
      );
    });
  });

  describe("approveKyc", () => {
    it("marks the KYC APPROVED and clears any rejection reason", async () => {
      kycRepo.findOne.mockResolvedValue({
        userId: user.id,
        status: KYCStatus.PENDING,
        rejectionReason: "blurry photo",
      });

      const result = await service.approveKyc(user.id);

      expect(result.status).toBe(KYCStatus.APPROVED);
      expect(result.rejectionReason).toBeUndefined();
    });
  });

  describe("rejectKyc", () => {
    it("marks the KYC REJECTED with a reason", async () => {
      kycRepo.findOne.mockResolvedValue({
        userId: user.id,
        status: KYCStatus.PENDING,
      });

      const result = await service.rejectKyc(user.id, "blurry photo");

      expect(result.status).toBe(KYCStatus.REJECTED);
      expect(result.rejectionReason).toBe("blurry photo");
    });
  });
});
