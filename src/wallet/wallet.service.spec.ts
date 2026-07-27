import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { WalletService } from "./wallet.service";
import { Wallet } from "./entities/wallet.entity";
import {
  WalletTransaction,
  WalletTransactionStatus,
  WalletTransactionType,
} from "./entities/wallet-transaction.entity";
import { SettingsService } from "../settings/settings.service";

describe("WalletService", () => {
  let service: WalletService;
  let walletsRepo: any;
  let walletTransactionsRepo: any;
  let settingsService: jest.Mocked<SettingsService>;
  let queryBuilder: any;
  let manager: any;

  beforeEach(async () => {
    queryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      returning: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({
        affected: 1,
        raw: [{ balance: "1500.00" }],
      }),
    };

    manager = {
      getRepository: jest.fn((entity) => {
        if (entity === Wallet) return walletsRepo;
        if (entity === WalletTransaction) return walletTransactionsRepo;
        throw new Error("Unexpected repository requested");
      }),
      createQueryBuilder: jest.fn(() => queryBuilder),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        {
          provide: getRepositoryToken(Wallet),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn((data) => ({ id: "wallet-1", ...data })),
            save: jest.fn((data) => Promise.resolve(data)),
          },
        },
        {
          provide: getRepositoryToken(WalletTransaction),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn((data) => ({ id: "tx-1", ...data })),
            save: jest.fn((data) => Promise.resolve(data)),
            update: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: SettingsService,
          useValue: { get: jest.fn() },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn((cb) => cb(manager)),
          },
        },
      ],
    }).compile();

    service = module.get(WalletService);
    walletsRepo = module.get(getRepositoryToken(Wallet));
    walletTransactionsRepo = module.get(getRepositoryToken(WalletTransaction));
    settingsService = module.get(SettingsService);
  });

  describe("getOrCreateWallet / getBalance", () => {
    it("returns the existing wallet's balance", async () => {
      walletsRepo.findOne.mockResolvedValue({ id: "wallet-1", balance: 500 });

      const balance = await service.getBalance("user-1");

      expect(balance).toBe(500);
      expect(walletsRepo.create).not.toHaveBeenCalled();
    });

    it("creates a zero-balance wallet if none exists yet", async () => {
      walletsRepo.findOne.mockResolvedValue(null);

      const balance = await service.getBalance("user-1");

      expect(balance).toBe(0);
      expect(walletsRepo.create).toHaveBeenCalledWith({
        userId: "user-1",
        balance: 0,
      });
    });
  });

  describe("getMinWithdrawalThreshold / getWithdrawalFeePercent", () => {
    it("reads the configurable minimum withdrawal amount with a ₦2000 default", async () => {
      settingsService.get.mockResolvedValue(2000);

      const threshold = await service.getMinWithdrawalThreshold();

      expect(settingsService.get).toHaveBeenCalledWith(
        "min_withdrawal_amount_ngn",
        2000
      );
      expect(threshold).toBe(2000);
    });

    it("reads the configurable withdrawal fee percent with a 3.5% default", async () => {
      settingsService.get.mockResolvedValue(3.5);

      const feePercent = await service.getWithdrawalFeePercent();

      expect(settingsService.get).toHaveBeenCalledWith(
        "withdrawal_fee_percent",
        3.5
      );
      expect(feePercent).toBe(3.5);
    });
  });

  describe("credit", () => {
    it("atomically increments the balance and records a SUCCESS ledger row", async () => {
      walletsRepo.findOne.mockResolvedValue({ id: "wallet-1", balance: 1000 });

      const transaction = await service.credit(
        "user-1",
        500,
        WalletTransactionType.EARNING,
        { errandId: "errand-1", description: "Earnings" }
      );

      expect(queryBuilder.set).toHaveBeenCalledWith({
        balance: expect.any(Function),
      });
      expect(walletTransactionsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          walletId: "wallet-1",
          userId: "user-1",
          type: WalletTransactionType.EARNING,
          amount: 500,
          status: WalletTransactionStatus.SUCCESS,
          balanceAfter: 1500,
          errandId: "errand-1",
        })
      );
      expect(transaction.balanceAfter).toBe(1500);
    });
  });

  describe("debit", () => {
    it("atomically decrements the balance when sufficient", async () => {
      walletsRepo.findOne.mockResolvedValue({ id: "wallet-1", balance: 2000 });

      const transaction = await service.debit(
        "user-1",
        500,
        WalletTransactionType.BILL_PURCHASE,
        { status: WalletTransactionStatus.PENDING }
      );

      expect(transaction.status).toBe(WalletTransactionStatus.PENDING);
      expect(transaction.balanceAfter).toBe(1500);
    });

    it("throws when the wallet balance is insufficient", async () => {
      walletsRepo.findOne.mockResolvedValue({ id: "wallet-1", balance: 100 });
      queryBuilder.execute.mockResolvedValue({ affected: 0, raw: [] });

      await expect(
        service.debit("user-1", 500, WalletTransactionType.BILL_PURCHASE)
      ).rejects.toThrow(BadRequestException);
      expect(walletTransactionsRepo.save).not.toHaveBeenCalled();
    });
  });

  describe("markTransactionStatus", () => {
    it("updates the status and reference of an existing transaction", async () => {
      walletTransactionsRepo.findOne.mockResolvedValue({
        id: "tx-1",
        status: WalletTransactionStatus.PENDING,
      });

      const result = await service.markTransactionStatus(
        "tx-1",
        WalletTransactionStatus.PROCESSING,
        { reference: "paystack-ref" }
      );

      expect(result.status).toBe(WalletTransactionStatus.PROCESSING);
      expect(result.reference).toBe("paystack-ref");
    });

    it("throws NotFoundException when the transaction does not exist", async () => {
      walletTransactionsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.markTransactionStatus(
          "missing",
          WalletTransactionStatus.SUCCESS
        )
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe("reverseTransaction", () => {
    it("credits the wallet back, marks the original FAILED, and creates a REVERSAL row", async () => {
      walletTransactionsRepo.findOne.mockResolvedValue({
        id: "tx-1",
        walletId: "wallet-1",
        userId: "user-1",
        type: WalletTransactionType.WITHDRAWAL,
        amount: 500,
        reference: "ref-1",
      });

      const reversal = await service.reverseTransaction(
        "tx-1",
        "Bank rejected the transfer"
      );

      expect(walletTransactionsRepo.update).toHaveBeenCalledWith("tx-1", {
        status: WalletTransactionStatus.FAILED,
      });
      expect(reversal.type).toBe(WalletTransactionType.REVERSAL);
      expect(reversal.amount).toBe(500);
      expect(reversal.metadata).toEqual({ reversedTransactionId: "tx-1" });
    });
  });

  describe("getTransactions", () => {
    it("filters by type when provided", async () => {
      walletTransactionsRepo.find.mockResolvedValue([]);

      await service.getTransactions("user-1", {
        type: WalletTransactionType.EARNING,
      });

      expect(walletTransactionsRepo.find).toHaveBeenCalledWith({
        where: { userId: "user-1", type: WalletTransactionType.EARNING },
        order: { createdAt: "DESC" },
      });
    });
  });

  describe("findEarningByErrandId", () => {
    it("looks up an EARNING transaction by errandId", async () => {
      walletTransactionsRepo.findOne.mockResolvedValue({ id: "tx-1" });

      const result = await service.findEarningByErrandId("errand-1");

      expect(walletTransactionsRepo.findOne).toHaveBeenCalledWith({
        where: { errandId: "errand-1", type: WalletTransactionType.EARNING },
      });
      expect(result).toEqual({ id: "tx-1" });
    });
  });

  describe("findErrandPaymentByErrandId", () => {
    it("looks up an ERRAND_PAYMENT transaction by errandId", async () => {
      walletTransactionsRepo.findOne.mockResolvedValue({ id: "tx-1" });

      const result = await service.findErrandPaymentByErrandId("errand-1");

      expect(walletTransactionsRepo.findOne).toHaveBeenCalledWith({
        where: {
          errandId: "errand-1",
          type: WalletTransactionType.ERRAND_PAYMENT,
        },
      });
      expect(result).toEqual({ id: "tx-1" });
    });
  });

  describe("linkTransactionToErrand", () => {
    it("updates the transaction's errandId", async () => {
      await service.linkTransactionToErrand("tx-1", "errand-1");

      expect(walletTransactionsRepo.update).toHaveBeenCalledWith("tx-1", {
        errandId: "errand-1",
      });
    });
  });

  describe("createPendingDeposit", () => {
    it("records a PENDING deposit without touching the balance", async () => {
      walletsRepo.findOne.mockResolvedValue({ id: "wallet-1", balance: 1000 });

      const transaction = await service.createPendingDeposit(
        "user-1",
        500,
        "deposit-ref"
      );

      expect(walletTransactionsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          walletId: "wallet-1",
          type: WalletTransactionType.DEPOSIT,
          amount: 500,
          status: WalletTransactionStatus.PENDING,
          balanceAfter: 1000,
          reference: "deposit-ref",
        })
      );
      expect(transaction.status).toBe(WalletTransactionStatus.PENDING);
    });
  });

  describe("confirmDeposit", () => {
    it("returns null when there is no matching pending deposit", async () => {
      walletTransactionsRepo.findOne.mockResolvedValue(null);

      const result = await service.confirmDeposit("unknown-ref");

      expect(result).toBeNull();
      expect(queryBuilder.execute).not.toHaveBeenCalled();
    });

    it("credits the wallet and resolves the same ledger row to SUCCESS", async () => {
      walletTransactionsRepo.findOne.mockResolvedValue({
        id: "tx-1",
        walletId: "wallet-1",
        amount: 500,
        status: WalletTransactionStatus.PENDING,
      });

      const result = await service.confirmDeposit("deposit-ref");

      expect(walletTransactionsRepo.update).toHaveBeenCalledWith("tx-1", {
        status: WalletTransactionStatus.SUCCESS,
        balanceAfter: 1500,
      });
      expect(walletTransactionsRepo.create).not.toHaveBeenCalled();
      expect(result.status).toBe(WalletTransactionStatus.SUCCESS);
      expect(result.balanceAfter).toBe(1500);
    });
  });
});
