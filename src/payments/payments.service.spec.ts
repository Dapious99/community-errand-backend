import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { DataSource } from "typeorm";
import { PaymentsService } from "./payments.service";
import { PaystackService } from "./services/paystack.service";
import { Payment, PaymentStatus, PaymentType } from "./entities/payment.entity";
import { Errand } from "../errands/entities/errand.entity";
import { User } from "../users/entities/user.entity";
import { KYC, KYCStatus } from "../users/entities/kyc.entity";
import { WalletService } from "../wallet/wallet.service";
import { PaymentGatewayRegistry } from "./payment-gateway.registry";
import { CountryConfigService } from "../settings/country-config.service";
import { SettingsService } from "../settings/settings.service";
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
  let countryConfigService: jest.Mocked<CountryConfigService>;
  let settingsService: jest.Mocked<SettingsService>;

  const defaultCountryConfig = {
    country: "Nigeria",
    currencyCode: "NGN",
    currencySymbol: "₦",
    boostPrice: 2500,
    platformFeePercent: 10,
    minWithdrawalAmount: 2000,
    withdrawalFeePercent: 3.5,
    referralBonus: 500,
    priorityPriceThreshold: 20000,
    subscriptionPrices: { monthly: 1500, quarterly: 4000, semi_annual: 7000, annual: 12000 },
    lightKycPriceThreshold: 5000,
    proPlatformFeePercent: 5,
    surgeThresholdOpenErrands: 50,
    surgeMultiplier: 1.5,
    paymentGatewayProvider: "paystack",
    isActive: true,
  };

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
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: jest.fn().mockResolvedValue({ id: "runner-1", country: "Nigeria" }) },
        },
        {
          provide: getRepositoryToken(KYC),
          useValue: { findOne: jest.fn(), save: jest.fn() },
        },
        {
          provide: PaystackService,
          useValue: {
            initializePayment: jest.fn(),
            verifyPayment: jest.fn(),
            resolveBankCode: jest.fn(),
            createTransferRecipient: jest.fn(),
            initiateTransfer: jest.fn(),
            refundTransaction: jest.fn(),
          },
        },
        {
          provide: PaymentGatewayRegistry,
          useValue: {
            resolve: jest.fn(),
          },
        },
        {
          provide: CountryConfigService,
          useValue: {
            get: jest.fn().mockResolvedValue(defaultCountryConfig),
          },
        },
        {
          provide: SettingsService,
          useValue: {
            get: jest.fn((key: string, fallback: any) =>
              Promise.resolve(fallback)
            ),
          },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: DataSource, useValue: {} },
        {
          provide: WalletService,
          useValue: {
            findEarningByErrandId: jest.fn(),
            findErrandPaymentByErrandId: jest.fn(),
            findBoostByErrandId: jest.fn(),
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
    countryConfigService = module.get(CountryConfigService);
    settingsService = module.get(SettingsService);
    const paymentGatewayRegistry = module.get(PaymentGatewayRegistry);
    (paymentGatewayRegistry.resolve as jest.Mock).mockReturnValue(paystackService);
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
      expect(kycRepo.findOne).not.toHaveBeenCalled();
    });

    it("charges a currently-Pro runner the lower proPlatformFeePercent instead of the standard fee", async () => {
      walletService.findEarningByErrandId.mockResolvedValue(null);
      errandsRepo.findOne.mockResolvedValue(errand);
      usersRepo.findOne.mockResolvedValue({
        id: "runner-1",
        country: "Nigeria",
        proExpiresAt: new Date(Date.now() + 60_000),
      });
      walletService.credit.mockResolvedValue({ amount: 950 } as any);

      const result = await service.processPayout("errand-1");

      // price 1000 - 5% Pro fee (50) = 950
      expect(walletService.credit).toHaveBeenCalledWith(
        "runner-1",
        950,
        WalletTransactionType.EARNING,
        expect.any(Object)
      );
      expect(result.amount).toBe(950);
    });

    it("charges the standard platformFeePercent once a runner's Pro subscription has expired", async () => {
      walletService.findEarningByErrandId.mockResolvedValue(null);
      errandsRepo.findOne.mockResolvedValue(errand);
      usersRepo.findOne.mockResolvedValue({
        id: "runner-1",
        country: "Nigeria",
        proExpiresAt: new Date(Date.now() - 60_000),
      });
      walletService.credit.mockResolvedValue({ amount: 900 } as any);

      const result = await service.processPayout("errand-1");

      expect(walletService.credit).toHaveBeenCalledWith(
        "runner-1",
        900,
        WalletTransactionType.EARNING,
        expect.any(Object)
      );
      expect(result.amount).toBe(900);
    });

    it("adds the tip on top in full, without the platform fee touching it", async () => {
      walletService.findEarningByErrandId.mockResolvedValue(null);
      errandsRepo.findOne.mockResolvedValue({ ...errand, tip: 150 });
      walletService.credit.mockResolvedValue({ amount: 1050 } as any);

      const result = await service.processPayout("errand-1");

      // price 1000 - 10% fee (100) + tip 150 = 1050
      expect(walletService.credit).toHaveBeenCalledWith(
        "runner-1",
        1050,
        WalletTransactionType.EARNING,
        expect.any(Object)
      );
      expect(result.amount).toBe(1050);
    });
  });

  describe("forfeitErrandFunds", () => {
    it("reverses both the errand payment and the boost transaction when boosted", async () => {
      walletService.findErrandPaymentByErrandId.mockResolvedValue({
        id: "payment-tx",
        status: WalletTransactionStatus.SUCCESS,
      } as any);
      walletService.findBoostByErrandId.mockResolvedValue({
        id: "boost-tx",
        status: WalletTransactionStatus.SUCCESS,
      } as any);

      await service.forfeitErrandFunds("errand-1", "Timed errand deadline missed");

      expect(walletService.reverseTransaction).toHaveBeenCalledWith(
        "payment-tx",
        "Timed errand deadline missed"
      );
      expect(walletService.reverseTransaction).toHaveBeenCalledWith(
        "boost-tx",
        "Timed errand deadline missed"
      );
    });

    it("only reverses the errand payment when the errand wasn't boosted", async () => {
      walletService.findErrandPaymentByErrandId.mockResolvedValue({
        id: "payment-tx",
        status: WalletTransactionStatus.SUCCESS,
      } as any);
      walletService.findBoostByErrandId.mockResolvedValue(null);

      await service.forfeitErrandFunds("errand-1", "Timed errand deadline missed");

      expect(walletService.reverseTransaction).toHaveBeenCalledTimes(1);
      expect(walletService.reverseTransaction).toHaveBeenCalledWith(
        "payment-tx",
        "Timed errand deadline missed"
      );
    });

    it("skips reversal for transactions that are missing or not SUCCESS", async () => {
      walletService.findErrandPaymentByErrandId.mockResolvedValue(null);
      walletService.findBoostByErrandId.mockResolvedValue({
        id: "boost-tx",
        status: WalletTransactionStatus.FAILED,
      } as any);

      await service.forfeitErrandFunds("errand-1", "Timed errand deadline missed");

      expect(walletService.reverseTransaction).not.toHaveBeenCalled();
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
      bankAccountName: "Runner One",
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

  describe("listBusinessCreditPackages", () => {
    it("returns the default set of credit packages when unconfigured", async () => {
      const result = await service.listBusinessCreditPackages();

      expect(result.map((p) => p.id)).toEqual(["starter", "growth", "scale"]);
    });

    it("returns an admin-configured package list instead of the default", async () => {
      settingsService.get.mockResolvedValueOnce([
        { id: "custom", label: "Custom", payAmount: 1000, bonusPercent: 5 },
      ]);

      const result = await service.listBusinessCreditPackages();

      expect(result.map((p) => p.id)).toEqual(["custom"]);
    });
  });

  describe("purchaseBusinessCredits", () => {
    it("throws for an unknown package id", async () => {
      await expect(
        service.purchaseBusinessCredits(
          "requester-1",
          "user@example.com",
          "unknown"
        )
      ).rejects.toThrow(BadRequestException);
      expect(walletService.createPendingDeposit).not.toHaveBeenCalled();
    });

    it("charges payAmount via the gateway but credits the bonus-inclusive amount to the wallet", async () => {
      paystackService.initializePayment = jest.fn().mockResolvedValue({
        status: true,
        message: "ok",
        data: {
          authorization_url: "https://paystack.test/pay",
          access_code: "abc",
          reference: "business-credit-ref",
        },
      });

      const result = await service.purchaseBusinessCredits(
        "requester-1",
        "user@example.com",
        "starter"
      );

      expect(paystackService.initializePayment).toHaveBeenCalledWith(
        "user@example.com",
        20000,
        expect.any(String),
        expect.objectContaining({
          purpose: "business_credit_purchase",
          packageId: "starter",
          creditAmount: 22000,
        })
      );
      expect(walletService.createPendingDeposit).toHaveBeenCalledWith(
        "requester-1",
        22000,
        "business-credit-ref",
        WalletTransactionType.BUSINESS_CREDIT_PURCHASE
      );
      expect(result).toEqual({
        authorizationUrl: "https://paystack.test/pay",
        reference: "business-credit-ref",
        payAmount: 20000,
        creditAmount: 22000,
      });
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
        userId: "requester-1",
        type: WalletTransactionType.DEPOSIT,
      } as any);

      const result = await service.verifyPayment("deposit-ref", "requester-1");

      expect(walletService.confirmDeposit).toHaveBeenCalledWith("deposit-ref");
      expect(result.type).toBe(WalletTransactionType.DEPOSIT);
      expect(paymentsRepo.findOne).not.toHaveBeenCalled();
    });

    it("rejects when the deposit belongs to a different user", async () => {
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
        userId: "someone-else",
        type: WalletTransactionType.DEPOSIT,
      } as any);

      await expect(
        service.verifyPayment("deposit-ref", "requester-1")
      ).rejects.toThrow(ForbiddenException);
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
        userId: "requester-1",
        type: PaymentType.BOOST,
        status: PaymentStatus.PENDING,
      });

      const result = await service.verifyPayment("boost-ref", "requester-1");

      expect(result.status).toBe(PaymentStatus.SUCCESS);
    });

    it("rejects when the Payment-table fallback belongs to a different user", async () => {
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
        userId: "someone-else",
        type: PaymentType.BOOST,
        status: PaymentStatus.PENDING,
      });

      await expect(
        service.verifyPayment("boost-ref", "requester-1")
      ).rejects.toThrow(ForbiddenException);
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
