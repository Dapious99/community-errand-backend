import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";
import { PaymentsService } from "./payments.service";
import { PaystackService } from "./services/paystack.service";
import { Payment, PaymentStatus, PaymentType } from "./entities/payment.entity";
import { Errand } from "../errands/entities/errand.entity";
import { User } from "../users/entities/user.entity";
import { KYC, KYCStatus } from "../users/entities/kyc.entity";

describe("PaymentsService", () => {
  let service: PaymentsService;
  let paymentsRepo: any;
  let errandsRepo: any;
  let usersRepo: any;
  let kycRepo: any;
  let paystackService: jest.Mocked<PaystackService>;

  const errand = {
    id: "errand-1",
    title: "Buy groceries",
    price: 1000,
    runnerId: "runner-1",
  };

  const escrowPayment = {
    id: "payment-1",
    errandId: "errand-1",
    userId: "requester-1",
    amount: 1000,
    type: PaymentType.ESCROW,
    status: PaymentStatus.SUCCESS,
    paystackReference: "ref-123",
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: getRepositoryToken(Payment),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn((data) => data),
            save: jest.fn((data) =>
              Promise.resolve({ id: "new-payment", ...data })
            ),
          },
        },
        {
          provide: getRepositoryToken(Errand),
          useValue: { findOne: jest.fn() },
        },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn() } },
        {
          provide: getRepositoryToken(KYC),
          useValue: { findOne: jest.fn(), save: jest.fn() },
        },
        {
          provide: PaystackService,
          useValue: {
            resolveBankCode: jest.fn(),
            createTransferRecipient: jest.fn(),
            initiateTransfer: jest.fn(),
            refundTransaction: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string, fallback?: any) => fallback) },
        },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();

    service = module.get(PaymentsService);
    paymentsRepo = module.get(getRepositoryToken(Payment));
    errandsRepo = module.get(getRepositoryToken(Errand));
    usersRepo = module.get(getRepositoryToken(User));
    kycRepo = module.get(getRepositoryToken(KYC));
    paystackService = module.get(PaystackService);
  });

  describe("processPayout", () => {
    it("returns null when there is no successful escrow payment", async () => {
      paymentsRepo.findOne
        .mockResolvedValueOnce(null) // existing payout check
        .mockResolvedValueOnce(null); // escrow lookup

      const result = await service.processPayout("errand-1");

      expect(result).toBeNull();
    });

    it("is idempotent and returns the existing payout without recalculating", async () => {
      const existingPayout = { id: "payout-1", type: PaymentType.PAYOUT };
      paymentsRepo.findOne.mockResolvedValueOnce(existingPayout);

      const result = await service.processPayout("errand-1");

      expect(result).toBe(existingPayout);
      expect(errandsRepo.findOne).not.toHaveBeenCalled();
    });

    it("deducts the default 10% platform fee and falls back to PENDING when the runner has no approved KYC", async () => {
      paymentsRepo.findOne
        .mockResolvedValueOnce(null) // existing payout check
        .mockResolvedValueOnce(escrowPayment); // escrow lookup
      errandsRepo.findOne.mockResolvedValue(errand);
      usersRepo.findOne.mockResolvedValue({
        id: "runner-1",
        name: "Runner One",
      });
      kycRepo.findOne.mockResolvedValue(null);

      const result = await service.processPayout("errand-1");

      expect(result.amount).toBe(900);
      expect(result.type).toBe(PaymentType.PAYOUT);
      expect(result.status).toBe(PaymentStatus.PENDING);
      expect(paystackService.initiateTransfer).not.toHaveBeenCalled();
    });

    it("initiates a real transfer and marks the payout PROCESSING when KYC is approved", async () => {
      paymentsRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(escrowPayment);
      errandsRepo.findOne.mockResolvedValue(errand);
      usersRepo.findOne.mockResolvedValue({
        id: "runner-1",
        name: "Runner One",
      });
      kycRepo.findOne.mockResolvedValue({
        userId: "runner-1",
        status: KYCStatus.APPROVED,
        bankAccountNumber: "0123456789",
        bankName: "Access Bank",
        paystackRecipientCode: null,
      });
      paystackService.resolveBankCode.mockResolvedValue("044");
      paystackService.createTransferRecipient.mockResolvedValue("RCP_123");
      paystackService.initiateTransfer.mockResolvedValue({
        status: true,
        message: "ok",
        data: {
          reference: "transfer-ref",
          status: "success",
          transfer_code: "TRF_1",
        },
      });

      const result = await service.processPayout("errand-1");

      expect(result.status).toBe(PaymentStatus.PROCESSING);
      expect(result.amount).toBe(900);
      expect(paystackService.createTransferRecipient).toHaveBeenCalledWith(
        "Runner One",
        "0123456789",
        "044"
      );
    });

    it("honors a custom PLATFORM_FEE_PERCENT", async () => {
      const configService: any = service["configService"];
      configService.get.mockImplementation((key: string, fallback?: any) =>
        key === "PLATFORM_FEE_PERCENT" ? 20 : fallback
      );
      paymentsRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(escrowPayment);
      errandsRepo.findOne.mockResolvedValue(errand);
      usersRepo.findOne.mockResolvedValue({
        id: "runner-1",
        name: "Runner One",
      });
      kycRepo.findOne.mockResolvedValue(null);

      const result = await service.processPayout("errand-1");

      expect(result.amount).toBe(800);
    });
  });

  describe("processRefund", () => {
    it("returns null when there is no successful escrow payment to refund", async () => {
      paymentsRepo.findOne
        .mockResolvedValueOnce(null) // existing refund check
        .mockResolvedValueOnce(null); // escrow lookup

      const result = await service.processRefund("errand-1");

      expect(result).toBeNull();
    });

    it("creates a PROCESSING refund when Paystack accepts the refund request", async () => {
      paymentsRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(escrowPayment);
      paystackService.refundTransaction.mockResolvedValue({ status: true });

      const result = await service.processRefund("errand-1");

      expect(result.type).toBe(PaymentType.REFUND);
      expect(result.amount).toBe(1000);
      expect(result.status).toBe(PaymentStatus.PROCESSING);
    });

    it("falls back to PENDING when the Paystack refund call fails", async () => {
      paymentsRepo.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(escrowPayment);
      paystackService.refundTransaction.mockRejectedValue(
        new Error("network error")
      );

      const result = await service.processRefund("errand-1");

      expect(result.status).toBe(PaymentStatus.PENDING);
    });
  });
});
