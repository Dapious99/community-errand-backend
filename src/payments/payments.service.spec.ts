import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { BadRequestException } from "@nestjs/common";
import { DataSource } from "typeorm";
import { PaymentsService } from "./payments.service";
import { PaystackService } from "./services/paystack.service";
import { Payment, PaymentStatus, PaymentType } from "./entities/payment.entity";
import { Errand } from "../errands/entities/errand.entity";
import { User } from "../users/entities/user.entity";
import { KYC, KYCStatus } from "../users/entities/kyc.entity";
import { WalletService } from "../wallet/wallet.service";
import {
  WalletTransactionStatus,
  WalletTransactionType,
} from "../wallet/entities/wallet-transaction.entity";

describe("PaymentsService", () => {
  let service: PaymentsService;
  let paymentsRepo: any;
  let errandsRepo: any;
  let usersRepo: any;
  let kycRepo: any;
  let paystackService: jest.Mocked<PaystackService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let walletService: jest.Mocked<WalletService>;

  const errand = {
    id: "errand-1",
    title: "Buy groceries",
    price: 1000,
    runnerId: "runner-1",
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
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: DataSource, useValue: {} },
        {
          provide: WalletService,
          useValue: {
            findEarningByErrandId: jest.fn(),
            findErrandPaymentByErrandId: jest.fn(),
            credit: jest.fn(),
            debit: jest.fn(),
            getBalance: jest.fn(),
            getMinWithdrawalThreshold: jest.fn(),
            getWithdrawalFeePercent: jest.fn(),
            markTransactionStatus: jest.fn(),
            reverseTransaction: jest.fn(),
            getTransactions: jest.fn(),
            createPendingDeposit: jest.fn(),
            confirmDeposit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(PaymentsService);
    paymentsRepo = module.get(getRepositoryToken(Payment));
    errandsRepo = module.get(getRepositoryToken(Errand));
    usersRepo = module.get(getRepositoryToken(User));
    kycRepo = module.get(getRepositoryToken(KYC));
    paystackService = module.get(PaystackService);
    eventEmitter = module.get(EventEmitter2);
    walletService = module.get(WalletService);
  });

  describe("processPayout", () => {
    it("returns null when the errand has no runner assigned yet", async () => {
      walletService.findEarningByErrandId.mockResolvedValue(null);
      errandsRepo.findOne.mockResolvedValue({ ...errand, runnerId: null });

      const result = await service.processPayout("errand-1");

      expect(result).toBeNull();
      expect(walletService.credit).not.toHaveBeenCalled();
    });

    it("is idempotent and returns the existing wallet earning without recrediting", async () => {
      const existingEarning = {
        id: "tx-1",
        type: WalletTransactionType.EARNING,
      };
      walletService.findEarningByErrandId.mockResolvedValue(
        existingEarning as any
      );

      const result = await service.processPayout("errand-1");

      expect(result).toBe(existingEarning);
      expect(errandsRepo.findOne).not.toHaveBeenCalled();
      expect(walletService.credit).not.toHaveBeenCalled();
    });

    it("deducts the default 10% platform fee and credits the runner's wallet - no KYC/bank details required", async () => {
      walletService.findEarningByErrandId.mockResolvedValue(null);
      errandsRepo.findOne.mockResolvedValue(errand);
      walletService.credit.mockResolvedValue({
        id: "tx-1",
        amount: 900,
        type: WalletTransactionType.EARNING,
      } as any);

      const result = await service.processPayout("errand-1");

      expect(walletService.credit).toHaveBeenCalledWith(
        "runner-1",
        900,
        WalletTransactionType.EARNING,
        expect.objectContaining({ errandId: "errand-1" })
      );
      expect(result.amount).toBe(900);
      expect(paystackService.initiateTransfer).not.toHaveBeenCalled();
      expect(usersRepo.findOne).not.toHaveBeenCalled();
      expect(kycRepo.findOne).not.toHaveBeenCalled();
    });

    it("honors a custom PLATFORM_FEE_PERCENT", async () => {
      const configService: any = service["configService"];
      configService.get.mockImplementation((key: string, fallback?: any) =>
        key === "PLATFORM_FEE_PERCENT" ? 20 : fallback
      );
      walletService.findEarningByErrandId.mockResolvedValue(null);
      errandsRepo.findOne.mockResolvedValue(errand);
      walletService.credit.mockResolvedValue({ amount: 800 } as any);

      const result = await service.processPayout("errand-1");

      expect(walletService.credit).toHaveBeenCalledWith(
        "runner-1",
        800,
        WalletTransactionType.EARNING,
        expect.any(Object)
      );
      expect(result.amount).toBe(800);
    });
  });

  describe("getPayouts", () => {
    it("reads through to the wallet's EARNING transactions", async () => {
      walletService.getTransactions.mockResolvedValue([]);

      await service.getPayouts("runner-1");

      expect(walletService.getTransactions).toHaveBeenCalledWith("runner-1", {
        type: WalletTransactionType.EARNING,
      });
    });
  });

  describe("initiateWithdrawal", () => {
    const runner = { id: "runner-1", name: "Runner One" };
    const approvedKyc = {
      userId: "runner-1",
      status: KYCStatus.APPROVED,
      bankAccountNumber: "0123456789",
      bankName: "Access Bank",
      paystackRecipientCode: null,
    };

    it("throws when the wallet balance is below the minimum withdrawal threshold", async () => {
      walletService.getBalance.mockResolvedValue(1000);
      walletService.getMinWithdrawalThreshold.mockResolvedValue(2000);

      await expect(service.initiateWithdrawal("runner-1")).rejects.toThrow(
        BadRequestException
      );
      expect(walletService.debit).not.toHaveBeenCalled();
    });

    it("throws when the runner has no approved KYC with bank details", async () => {
      walletService.getBalance.mockResolvedValue(5000);
      walletService.getMinWithdrawalThreshold.mockResolvedValue(2000);
      usersRepo.findOne.mockResolvedValue(runner);
      kycRepo.findOne.mockResolvedValue(null);

      await expect(service.initiateWithdrawal("runner-1")).rejects.toThrow(
        BadRequestException
      );
      expect(walletService.debit).not.toHaveBeenCalled();
    });

    it("sweeps the full balance, applies the withdrawal fee, and marks PROCESSING on success", async () => {
      walletService.getBalance.mockResolvedValue(5000);
      walletService.getMinWithdrawalThreshold.mockResolvedValue(2000);
      walletService.getWithdrawalFeePercent.mockResolvedValue(3.5);
      usersRepo.findOne.mockResolvedValue(runner);
      kycRepo.findOne.mockResolvedValue({ ...approvedKyc });
      walletService.debit.mockResolvedValue({ id: "tx-1" } as any);
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

      const result = await service.initiateWithdrawal("runner-1");

      expect(walletService.debit).toHaveBeenCalledWith(
        "runner-1",
        5000,
        WalletTransactionType.WITHDRAWAL,
        expect.objectContaining({ status: WalletTransactionStatus.PENDING })
      );
      expect(result.feeAmount).toBeCloseTo(175);
      expect(result.netAmount).toBeCloseTo(4825);
      expect(result.status).toBe(WalletTransactionStatus.PROCESSING);
      expect(walletService.markTransactionStatus).toHaveBeenCalledWith(
        "tx-1",
        WalletTransactionStatus.PROCESSING,
        { reference: "transfer-ref" }
      );
      expect(walletService.reverseTransaction).not.toHaveBeenCalled();
    });

    it("reverses the debit when bank-recipient setup fails (no transfer was ever attempted)", async () => {
      walletService.getBalance.mockResolvedValue(5000);
      walletService.getMinWithdrawalThreshold.mockResolvedValue(2000);
      walletService.getWithdrawalFeePercent.mockResolvedValue(3.5);
      usersRepo.findOne.mockResolvedValue(runner);
      kycRepo.findOne.mockResolvedValue({ ...approvedKyc });
      walletService.debit.mockResolvedValue({ id: "tx-1" } as any);
      paystackService.resolveBankCode.mockResolvedValue(null);

      await expect(service.initiateWithdrawal("runner-1")).rejects.toThrow(
        BadRequestException
      );
      expect(walletService.reverseTransaction).toHaveBeenCalledWith(
        "tx-1",
        expect.any(String)
      );
      expect(paystackService.initiateTransfer).not.toHaveBeenCalled();
    });

    it("reverses the debit on a definite (4xx) transfer rejection", async () => {
      walletService.getBalance.mockResolvedValue(5000);
      walletService.getMinWithdrawalThreshold.mockResolvedValue(2000);
      walletService.getWithdrawalFeePercent.mockResolvedValue(3.5);
      usersRepo.findOne.mockResolvedValue(runner);
      kycRepo.findOne.mockResolvedValue({
        ...approvedKyc,
        paystackRecipientCode: "RCP_123",
      });
      walletService.debit.mockResolvedValue({ id: "tx-1" } as any);
      const rejection: any = new Error("Invalid recipient");
      rejection.response = { status: 400 };
      paystackService.initiateTransfer.mockRejectedValue(rejection);

      await expect(service.initiateWithdrawal("runner-1")).rejects.toThrow(
        BadRequestException
      );
      expect(walletService.reverseTransaction).toHaveBeenCalledWith(
        "tx-1",
        "Invalid recipient"
      );
    });

    it("leaves the transaction PENDING (no reversal) on an ambiguous transfer error", async () => {
      walletService.getBalance.mockResolvedValue(5000);
      walletService.getMinWithdrawalThreshold.mockResolvedValue(2000);
      walletService.getWithdrawalFeePercent.mockResolvedValue(3.5);
      usersRepo.findOne.mockResolvedValue(runner);
      kycRepo.findOne.mockResolvedValue({
        ...approvedKyc,
        paystackRecipientCode: "RCP_123",
      });
      walletService.debit.mockResolvedValue({ id: "tx-1" } as any);
      paystackService.initiateTransfer.mockRejectedValue(
        new Error("timeout of 30000ms exceeded")
      );

      const result = await service.initiateWithdrawal("runner-1");

      expect(result.status).toBe(WalletTransactionStatus.PENDING);
      expect(walletService.reverseTransaction).not.toHaveBeenCalled();
    });
  });

  describe("processRefund", () => {
    it("returns null when there is no errand-payment transaction to refund", async () => {
      walletService.findErrandPaymentByErrandId.mockResolvedValue(null);

      const result = await service.processRefund("errand-1");

      expect(result).toBeNull();
      expect(walletService.reverseTransaction).not.toHaveBeenCalled();
    });

    it("returns null when the errand-payment transaction wasn't SUCCESS", async () => {
      walletService.findErrandPaymentByErrandId.mockResolvedValue({
        id: "tx-1",
        status: WalletTransactionStatus.FAILED,
      } as any);

      const result = await service.processRefund("errand-1");

      expect(result).toBeNull();
      expect(walletService.reverseTransaction).not.toHaveBeenCalled();
    });

    it("reverses the errand-payment transaction, crediting the requester's wallet back", async () => {
      walletService.findErrandPaymentByErrandId.mockResolvedValue({
        id: "tx-1",
        status: WalletTransactionStatus.SUCCESS,
      } as any);
      walletService.reverseTransaction.mockResolvedValue({
        id: "tx-2",
        type: WalletTransactionType.REVERSAL,
      } as any);

      const result = await service.processRefund("errand-1");

      expect(walletService.reverseTransaction).toHaveBeenCalledWith(
        "tx-1",
        "Errand cancelled before pickup"
      );
      expect(result.type).toBe(WalletTransactionType.REVERSAL);
    });
  });

  describe("initializeDeposit", () => {
    it("initializes a Paystack checkout and records a pending deposit, without creating a Payment row", async () => {
      paystackService.initializePayment = jest.fn().mockResolvedValue({
        status: true,
        message: "ok",
        data: {
          authorization_url: "https://paystack.test/pay",
          access_code: "abc",
          reference: "deposit-ref",
        },
      });

      const result = await service.initializeDeposit(
        "requester-1",
        "user@example.com",
        5000
      );

      expect(walletService.createPendingDeposit).toHaveBeenCalledWith(
        "requester-1",
        5000,
        "deposit-ref"
      );
      expect(paymentsRepo.create).not.toHaveBeenCalled();
      expect(result.authorizationUrl).toBe("https://paystack.test/pay");
      expect(result.reference).toBe("deposit-ref");
    });
  });

  describe("verifyPayment", () => {
    it("confirms a pending deposit when Paystack reports success", async () => {
      paystackService.verifyPayment = jest.fn().mockResolvedValue({
        status: true,
        message: "ok",
        data: {
          amount: 500000,
          currency: "NGN",
          status: "success",
          reference: "deposit-ref",
          customer: {},
        },
      });
      walletService.confirmDeposit.mockResolvedValue({
        id: "tx-1",
        type: WalletTransactionType.DEPOSIT,
      } as any);

      const result = await service.verifyPayment("deposit-ref");

      expect(walletService.confirmDeposit).toHaveBeenCalledWith("deposit-ref");
      expect(result.type).toBe(WalletTransactionType.DEPOSIT);
      expect(paymentsRepo.findOne).not.toHaveBeenCalled();
    });

    it("falls back to the Payment table when the reference isn't a deposit", async () => {
      paystackService.verifyPayment = jest.fn().mockResolvedValue({
        status: true,
        message: "ok",
        data: {
          amount: 250000,
          currency: "NGN",
          status: "success",
          reference: "boost-ref",
          customer: {},
        },
      });
      walletService.confirmDeposit.mockResolvedValue(null);
      paymentsRepo.findOne.mockResolvedValue({
        id: "payment-1",
        type: PaymentType.BOOST,
        status: PaymentStatus.PENDING,
      });

      const result = await service.verifyPayment("boost-ref");

      expect(result.status).toBe(PaymentStatus.SUCCESS);
    });
  });

  describe("initializeBoostPayment", () => {
    it("throws when the errand does not exist", async () => {
      errandsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.initializeBoostPayment(
          "errand-1",
          "requester-1",
          "user@example.com",
          2500
        )
      ).rejects.toThrow("Errand not found");
    });

    it("creates a PENDING BOOST payment record with a system-determined amount", async () => {
      errandsRepo.findOne.mockResolvedValue(errand);
      paystackService.initializePayment = jest.fn().mockResolvedValue({
        status: true,
        message: "ok",
        data: {
          authorization_url: "https://paystack.test/pay",
          access_code: "abc",
          reference: "boost-ref",
        },
      });

      const result = await service.initializeBoostPayment(
        "errand-1",
        "requester-1",
        "user@example.com",
        2500
      );

      expect(paymentsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: PaymentType.BOOST,
          amount: 2500,
          status: PaymentStatus.PENDING,
        })
      );
      expect(result.authorizationUrl).toBe("https://paystack.test/pay");
    });
  });

  describe("handleWebhook", () => {
    it("confirms a matching pending deposit and stops there", async () => {
      walletService.confirmDeposit.mockResolvedValue({
        id: "tx-1",
        type: WalletTransactionType.DEPOSIT,
      } as any);

      await service.handleWebhook({
        event: "charge.success",
        data: { reference: "deposit-ref" },
      });

      expect(walletService.confirmDeposit).toHaveBeenCalledWith("deposit-ref");
      expect(paymentsRepo.findOne).not.toHaveBeenCalled();
    });

    it("emits payment.boost.succeeded only for BOOST-type payments", async () => {
      walletService.confirmDeposit.mockResolvedValue(null);
      paymentsRepo.findOne.mockResolvedValue({
        id: "payment-1",
        errandId: "errand-1",
        type: PaymentType.BOOST,
        status: PaymentStatus.PENDING,
      });

      await service.handleWebhook({
        event: "charge.success",
        data: { reference: "boost-ref" },
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        "payment.boost.succeeded",
        {
          errandId: "errand-1",
        }
      );
    });

    it("does not emit the boost event for non-BOOST payments", async () => {
      walletService.confirmDeposit.mockResolvedValue(null);
      paymentsRepo.findOne.mockResolvedValue({
        id: "payment-1",
        errandId: "errand-1",
        type: PaymentType.ESCROW,
        status: PaymentStatus.PENDING,
      });

      await service.handleWebhook({
        event: "charge.success",
        data: { reference: "escrow-ref" },
      });

      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });
});
