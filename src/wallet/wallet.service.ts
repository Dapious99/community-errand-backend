import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import { SettingsService } from "../settings/settings.service";
import { Wallet } from "./entities/wallet.entity";
import {
  WalletTransaction,
  WalletTransactionStatus,
  WalletTransactionType,
} from "./entities/wallet-transaction.entity";

interface WalletTransactionOpts {
  status?: WalletTransactionStatus;
  errandId?: string;
  description?: string;
  reference?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(Wallet)
    private walletsRepository: Repository<Wallet>,
    @InjectRepository(WalletTransaction)
    private walletTransactionsRepository: Repository<WalletTransaction>,
    private settingsService: SettingsService,
    private dataSource: DataSource
  ) {}

  async getOrCreateWallet(
    userId: string,
    manager?: EntityManager
  ): Promise<Wallet> {
    const repo = manager
      ? manager.getRepository(Wallet)
      : this.walletsRepository;

    const existing = await repo.findOne({ where: { userId } });
    if (existing) {
      return existing;
    }

    try {
      return await repo.save(repo.create({ userId, balance: 0 }));
    } catch {
      // Concurrent first-credit race: the other caller's insert won: read it.
      const wallet = await repo.findOne({ where: { userId } });
      if (!wallet) {
        throw new NotFoundException("Wallet could not be created");
      }
      return wallet;
    }
  }

  async getBalance(userId: string): Promise<number> {
    const wallet = await this.getOrCreateWallet(userId);
    return wallet.balance;
  }

  async getMinWithdrawalThreshold(): Promise<number> {
    return this.settingsService.get<number>("min_withdrawal_amount_ngn", 2000);
  }

  async getWithdrawalFeePercent(): Promise<number> {
    return this.settingsService.get<number>("withdrawal_fee_percent", 3.5);
  }

  async credit(
    userId: string,
    amount: number,
    type: WalletTransactionType,
    opts: WalletTransactionOpts = {}
  ): Promise<WalletTransaction> {
    return this.dataSource.transaction(async (manager) => {
      const wallet = await this.getOrCreateWallet(userId, manager);

      const result = await manager
        .createQueryBuilder()
        .update(Wallet)
        .set({ balance: () => "balance + :amount" })
        .where("id = :id", { id: wallet.id, amount })
        .returning(["balance"])
        .execute();

      const balanceAfter = parseFloat(result.raw[0].balance);
      const txRepo = manager.getRepository(WalletTransaction);
      const transaction = txRepo.create({
        walletId: wallet.id,
        userId,
        type,
        amount,
        status: opts.status ?? WalletTransactionStatus.SUCCESS,
        balanceAfter,
        errandId: opts.errandId,
        reference: opts.reference,
        description: opts.description,
        metadata: opts.metadata,
      });
      return txRepo.save(transaction);
    });
  }

  async debit(
    userId: string,
    amount: number,
    type: WalletTransactionType,
    opts: WalletTransactionOpts = {}
  ): Promise<WalletTransaction> {
    return this.dataSource.transaction(async (manager) => {
      const wallet = await this.getOrCreateWallet(userId, manager);

      const result = await manager
        .createQueryBuilder()
        .update(Wallet)
        .set({ balance: () => "balance - :amount" })
        .where("id = :id AND balance >= :amount", { id: wallet.id, amount })
        .returning(["balance"])
        .execute();

      if (result.affected === 0) {
        throw new BadRequestException("Insufficient wallet balance");
      }

      const balanceAfter = parseFloat(result.raw[0].balance);
      const txRepo = manager.getRepository(WalletTransaction);
      const transaction = txRepo.create({
        walletId: wallet.id,
        userId,
        type,
        amount,
        status: opts.status ?? WalletTransactionStatus.SUCCESS,
        balanceAfter,
        errandId: opts.errandId,
        reference: opts.reference,
        description: opts.description,
        metadata: opts.metadata,
      });
      return txRepo.save(transaction);
    });
  }

  async markTransactionStatus(
    transactionId: string,
    status: WalletTransactionStatus,
    opts: { reference?: string; metadata?: Record<string, any> } = {}
  ): Promise<WalletTransaction> {
    const transaction = await this.walletTransactionsRepository.findOne({
      where: { id: transactionId },
    });
    if (!transaction) {
      throw new NotFoundException("Wallet transaction not found");
    }

    transaction.status = status;
    if (opts.reference !== undefined) {
      transaction.reference = opts.reference;
    }
    if (opts.metadata !== undefined) {
      transaction.metadata = { ...transaction.metadata, ...opts.metadata };
    }
    return this.walletTransactionsRepository.save(transaction);
  }

  /**
   * Only for definitive external rejections (a provider that responded and
   * clearly rejected the request) - never for ambiguous errors like timeouts,
   * where the provider may have actually processed the request server-side.
   * Credits the original amount back and marks the original row FAILED.
   */
  async reverseTransaction(
    transactionId: string,
    reason: string
  ): Promise<WalletTransaction> {
    const original = await this.walletTransactionsRepository.findOne({
      where: { id: transactionId },
    });
    if (!original) {
      throw new NotFoundException("Wallet transaction not found");
    }

    return this.dataSource.transaction(async (manager) => {
      const result = await manager
        .createQueryBuilder()
        .update(Wallet)
        .set({ balance: () => "balance + :amount" })
        .where("id = :id", { id: original.walletId, amount: original.amount })
        .returning(["balance"])
        .execute();

      const balanceAfter = parseFloat(result.raw[0].balance);
      const txRepo = manager.getRepository(WalletTransaction);

      await txRepo.update(original.id, {
        status: WalletTransactionStatus.FAILED,
      });

      const reversal = txRepo.create({
        walletId: original.walletId,
        userId: original.userId,
        type: WalletTransactionType.REVERSAL,
        amount: original.amount,
        status: WalletTransactionStatus.SUCCESS,
        balanceAfter,
        reference: original.reference,
        description: `Reversal of ${original.type} ${original.id}: ${reason}`,
        metadata: { reversedTransactionId: original.id },
      });
      return txRepo.save(reversal);
    });
  }

  async getTransactions(
    userId: string,
    filter?: { type?: WalletTransactionType }
  ): Promise<WalletTransaction[]> {
    return this.walletTransactionsRepository.find({
      where: { userId, ...(filter?.type ? { type: filter.type } : {}) },
      order: { createdAt: "DESC" },
    });
  }

  async findEarningByErrandId(
    errandId: string
  ): Promise<WalletTransaction | null> {
    return this.walletTransactionsRepository.findOne({
      where: { errandId, type: WalletTransactionType.EARNING },
    });
  }

  async findErrandPaymentByErrandId(
    errandId: string
  ): Promise<WalletTransaction | null> {
    return this.walletTransactionsRepository.findOne({
      where: { errandId, type: WalletTransactionType.ERRAND_PAYMENT },
    });
  }

  /**
   * The errand row doesn't exist yet when its payment is debited (the debit
   * happens first, so a failed debit creates nothing) - this attaches the
   * errandId once the errand has actually been created.
   */
  async linkTransactionToErrand(
    transactionId: string,
    errandId: string
  ): Promise<void> {
    await this.walletTransactionsRepository.update(transactionId, {
      errandId,
    });
  }

  /**
   * Records that a deposit was initiated, without touching the balance yet -
   * crediting has to wait for Paystack to actually confirm the charge
   * (`confirmDeposit`), otherwise a user could get free wallet balance
   * without ever completing payment.
   */
  async createPendingDeposit(
    userId: string,
    amount: number,
    reference: string
  ): Promise<WalletTransaction> {
    const wallet = await this.getOrCreateWallet(userId);
    const transaction = this.walletTransactionsRepository.create({
      walletId: wallet.id,
      userId,
      type: WalletTransactionType.DEPOSIT,
      amount,
      status: WalletTransactionStatus.PENDING,
      balanceAfter: wallet.balance,
      reference,
    });
    return this.walletTransactionsRepository.save(transaction);
  }

  /**
   * Resolves a pending deposit once Paystack confirms the charge - credits
   * the wallet and updates the same ledger row to SUCCESS (rather than
   * inserting a second row) to avoid double bookkeeping for one deposit.
   * Returns null if there's no matching pending deposit (already resolved,
   * or the reference isn't a deposit at all), so callers can fall through to
   * other reference-matching logic.
   */
  async confirmDeposit(reference: string): Promise<WalletTransaction | null> {
    const pending = await this.walletTransactionsRepository.findOne({
      where: {
        reference,
        type: WalletTransactionType.DEPOSIT,
        status: WalletTransactionStatus.PENDING,
      },
    });
    if (!pending) {
      return null;
    }

    return this.dataSource.transaction(async (manager) => {
      const result = await manager
        .createQueryBuilder()
        .update(Wallet)
        .set({ balance: () => "balance + :amount" })
        .where("id = :id", { id: pending.walletId, amount: pending.amount })
        .returning(["balance"])
        .execute();

      const balanceAfter = parseFloat(result.raw[0].balance);
      const txRepo = manager.getRepository(WalletTransaction);
      await txRepo.update(pending.id, {
        status: WalletTransactionStatus.SUCCESS,
        balanceAfter,
      });

      return {
        ...pending,
        status: WalletTransactionStatus.SUCCESS,
        balanceAfter,
      };
    });
  }
}
