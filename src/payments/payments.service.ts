import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Payment, PaymentType, PaymentStatus } from "./entities/payment.entity";
import { Errand } from "../errands/entities/errand.entity";
import { User } from "../users/entities/user.entity";
import { KYC, KYCStatus } from "../users/entities/kyc.entity";
import { isProUser } from "../users/utils/is-pro-user";
import {
  DEFAULT_BUSINESS_CREDIT_PACKAGES,
  BusinessCreditPackage,
  creditAmountFor,
  findBusinessCreditPackage,
} from "./business-credit-packages";
import { PaystackService } from "./services/paystack.service";
import { PaymentGatewayRegistry } from "./payment-gateway.registry";
import { WalletService } from "../wallet/wallet.service";
import { CountryConfigService } from "../settings/country-config.service";
import { SettingsService } from "../settings/settings.service";
import {
  WalletTransaction,
  WalletTransactionStatus,
  WalletTransactionType,
} from "../wallet/entities/wallet-transaction.entity";

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment)
    private paymentsRepository: Repository<Payment>,
    @InjectRepository(Errand)
    private errandsRepository: Repository<Errand>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(KYC)
    private kycRepository: Repository<KYC>,
    private paystackService: PaystackService,
    private paymentGatewayRegistry: PaymentGatewayRegistry,
    private eventEmitter: EventEmitter2,
    private dataSource: DataSource,
    private walletService: WalletService,
    private countryConfigService: CountryConfigService,
    private settingsService: SettingsService
  ) {}

  /**
   * Tops up the caller's wallet via Paystack. Errand payments no longer go
   * through a per-errand checkout - they're debited straight from the
   * wallet at creation - so this is now the only way money enters the
   * platform on the requester side.
   *
   * No `Payment` row is created (that entity's `errandId` is NOT NULL and a
   * deposit isn't tied to any errand) - the pending state lives entirely in
   * a `WalletTransaction` (type DEPOSIT), resolved by `confirmDeposit` once
   * Paystack confirms the charge via webhook/verify.
   */
  async initializeDeposit(userId: string, email: string, amount: number) {
    const reference = `deposit-${userId}-${Date.now()}`;

    const user = await this.usersRepository.findOne({ where: { id: userId } });
    const countryConfig = await this.countryConfigService.get(user?.country);
    const gateway = this.paymentGatewayRegistry.resolve(
      countryConfig.paymentGatewayProvider
    );

    const paystackResponse = await gateway.initializePayment(
      email,
      amount,
      reference,
      { userId, purpose: "wallet_deposit" }
    );

    await this.walletService.createPendingDeposit(
      userId,
      amount,
      paystackResponse.data.reference
    );

    return {
      authorizationUrl: paystackResponse.data.authorization_url,
      reference: paystackResponse.data.reference,
    };
  }

  async listBusinessCreditPackages(): Promise<BusinessCreditPackage[]> {
    return this.settingsService.get(
      "business_credit_packages",
      DEFAULT_BUSINESS_CREDIT_PACKAGES
    );
  }

  /**
   * Same pipeline as initializeDeposit/verifyPayment/handleWebhook, but the
   * amount credited to the wallet on confirmation (creditAmount) is larger
   * than what's actually charged via the gateway (pkg.payAmount) - the
   * bonus is the whole point of buying in bulk. No new payment/posting logic
   * needed: once credited, it's just wallet balance like any other top-up.
   */
  async purchaseBusinessCredits(
    userId: string,
    email: string,
    packageId: string
  ) {
    const packages = await this.listBusinessCreditPackages();
    const pkg = findBusinessCreditPackage(packages, packageId);
    if (!pkg) {
      throw new BadRequestException(`Unknown credit package "${packageId}"`);
    }
    const creditAmount = creditAmountFor(pkg);
    const reference = `business-credit-${userId}-${Date.now()}`;

    const user = await this.usersRepository.findOne({ where: { id: userId } });
    const countryConfig = await this.countryConfigService.get(user?.country);
    const gateway = this.paymentGatewayRegistry.resolve(
      countryConfig.paymentGatewayProvider
    );

    const gatewayResponse = await gateway.initializePayment(
      email,
      pkg.payAmount,
      reference,
      { userId, purpose: "business_credit_purchase", packageId, creditAmount }
    );

    await this.walletService.createPendingDeposit(
      userId,
      creditAmount,
      gatewayResponse.data.reference,
      WalletTransactionType.BUSINESS_CREDIT_PURCHASE
    );

    return {
      authorizationUrl: gatewayResponse.data.authorization_url,
      reference: gatewayResponse.data.reference,
      payAmount: pkg.payAmount,
      creditAmount,
    };
  }

  async verifyPayment(reference: string, userId: string) {
    const verification = await this.paystackService.verifyPayment(reference);

    if (verification.data.status === "success") {
      const depositTransaction =
        await this.walletService.confirmDeposit(reference);
      if (depositTransaction) {
        if (depositTransaction.userId !== userId) {
          throw new ForbiddenException(
            "This payment reference does not belong to you"
          );
        }
        return depositTransaction;
      }
    }

    // Fall back to the Payment table - still used by any historical
    // ESCROW/BOOST rows from before those flows moved to the wallet.
    const payment = await this.paymentsRepository.findOne({
      where: { paystackReference: reference },
      relations: ["errand"],
    });

    if (!payment) {
      throw new NotFoundException("Payment not found");
    }

    if (payment.userId !== userId) {
      throw new ForbiddenException(
        "This payment reference does not belong to you"
      );
    }

    payment.status =
      verification.data.status === "success"
        ? PaymentStatus.SUCCESS
        : PaymentStatus.FAILED;
    await this.paymentsRepository.save(payment);

    return payment;
  }

  async handleWebhook(data: any) {
    const { event, data: paymentData } = data;

    if (event === "charge.success") {
      const depositTransaction = await this.walletService.confirmDeposit(
        paymentData.reference
      );
      if (depositTransaction) {
        return { received: true };
      }

      const payment = await this.paymentsRepository.findOne({
        where: { paystackReference: paymentData.reference },
      });

      if (payment) {
        payment.status = PaymentStatus.SUCCESS;
        await this.paymentsRepository.save(payment);

        if (payment.type === PaymentType.BOOST) {
          this.eventEmitter.emit("payment.boost.succeeded", {
            errandId: payment.errandId,
          });
        }
      }
    }

    return { received: true };
  }

  /**
   * Read-through adapter over the wallet ledger, kept for backward
   * compatibility with the existing `GET /payments/payouts` response shape.
   * Runner earnings live in `WalletTransaction` (type EARNING) since
   * `processPayout` no longer writes `Payment`/`PAYOUT` rows.
   */
  async getPayouts(userId: string) {
    return this.walletService.getTransactions(userId, {
      type: WalletTransactionType.EARNING,
    });
  }

  /**
   * Triggered when an errand is marked COMPLETED. Deducts the platform fee
   * from the escrowed price and credits the remainder to the runner's
   * wallet - it no longer wires money to a bank directly. Withdrawal to a
   * bank account is a separate, explicit action (see `initiateWithdrawal`),
   * so crediting the wallet needs no KYC/bank details and can't fail the way
   * an external transfer can. Any tip is added on top in full - the platform
   * doesn't take a cut of tips, only of the errand price. A currently-Pro
   * runner pays `CountryConfig.proPlatformFeePercent` instead of the
   * standard `platformFeePercent` - a real perk on the supply side, not
   * just requester-facing priority access.
   */
  async processPayout(errandId: string): Promise<WalletTransaction | null> {
    const existingPayout =
      await this.walletService.findEarningByErrandId(errandId);
    if (existingPayout) {
      return existingPayout;
    }

    const errand = await this.errandsRepository.findOne({
      where: { id: errandId },
    });
    if (!errand || !errand.runnerId) {
      return null;
    }

    const runner = await this.usersRepository.findOne({
      where: { id: errand.runnerId },
    });
    const countryConfig = await this.countryConfigService.get(
      runner?.country
    );
    const feePercent = isProUser(runner ?? { proExpiresAt: undefined })
      ? countryConfig.proPlatformFeePercent
      : countryConfig.platformFeePercent;
    const platformFee = Number(
      ((Number(errand.price) * feePercent) / 100).toFixed(2)
    );
    const tip = Number(errand.tip ?? 0);
    const payoutAmount = Number(
      (Number(errand.price) - platformFee + tip).toFixed(2)
    );

    return this.walletService.credit(
      errand.runnerId,
      payoutAmount,
      WalletTransactionType.EARNING,
      {
        errandId,
        description: `Earnings for errand "${errand.title}" (platform fee: ${platformFee}${tip ? `, tip: ${tip}` : ""})`,
      }
    );
  }

  /**
   * Sweeps the runner's entire wallet balance to their bank account, minus a
   * configurable withdrawal fee. Requires approved KYC with bank details on
   * file - the only place in this service that requirement still applies,
   * since `processPayout` above no longer needs it.
   *
   * The wallet is debited up front (reserving the funds) before the Paystack
   * transfer is attempted. If bank-recipient setup fails, nothing has been
   * sent to Paystack yet, so it's always safe to reverse. If the actual
   * transfer call fails, only a *definite* rejection (a 4xx response Paystack
   * returned before queueing anything) is reversed automatically - an
   * ambiguous failure (timeout, network error, 5xx) is left PENDING for
   * manual reconciliation, exactly like the old payout fallback did, to avoid
   * risking a double-payout if Paystack actually queued the transfer.
   */
  async initiateWithdrawal(userId: string): Promise<{
    transactionId: string;
    netAmount: number;
    feeAmount: number;
    status: WalletTransactionStatus;
  }> {
    const runner = await this.usersRepository.findOne({
      where: { id: userId },
    });
    const countryConfig = await this.countryConfigService.get(
      runner?.country
    );
    const currencySymbol = countryConfig.currencySymbol;
    const gateway = this.paymentGatewayRegistry.resolve(
      countryConfig.paymentGatewayProvider
    );

    const balance = await this.walletService.getBalance(userId);
    const threshold = await this.walletService.getMinWithdrawalThreshold(
      runner?.country
    );

    if (balance < threshold) {
      throw new BadRequestException(
        `Wallet balance (${currencySymbol}${balance}) is below the minimum withdrawal amount (${currencySymbol}${threshold})`
      );
    }

    const kyc = await this.kycRepository.findOne({ where: { userId } });

    if (
      !runner ||
      !kyc ||
      kyc.status !== KYCStatus.APPROVED ||
      !kyc.bankAccountNumber ||
      !kyc.bankName ||
      !kyc.bankAccountName
    ) {
      throw new BadRequestException(
        "Approved KYC with bank details is required before you can withdraw"
      );
    }

    const feePercent = await this.walletService.getWithdrawalFeePercent(
      runner.country
    );
    const feeAmount = Number(((balance * feePercent) / 100).toFixed(2));
    const netAmount = Number((balance - feeAmount).toFixed(2));

    const transaction = await this.walletService.debit(
      userId,
      balance,
      WalletTransactionType.WITHDRAWAL,
      {
        status: WalletTransactionStatus.PENDING,
        metadata: { feePercent, feeAmount, netAmount },
      }
    );

    let recipientCode = kyc.paystackRecipientCode;
    try {
      if (!recipientCode) {
        const bankCode = await gateway.resolveBankCode(kyc.bankName);
        if (!bankCode) {
          throw new Error(
            `Could not resolve a bank code for "${kyc.bankName}"`
          );
        }
        recipientCode = await gateway.createTransferRecipient(
          kyc.bankAccountName,
          kyc.bankAccountNumber,
          bankCode
        );
        kyc.paystackRecipientCode = recipientCode;
        await this.kycRepository.save(kyc);
      }
    } catch (error: any) {
      // No transfer has been attempted yet - always safe to reverse.
      await this.walletService.reverseTransaction(
        transaction.id,
        error.message
      );
      throw new BadRequestException(
        `Withdrawal failed while preparing the bank transfer: ${error.message}`
      );
    }

    try {
      const transfer = await gateway.initiateTransfer(
        recipientCode,
        netAmount,
        `Wallet withdrawal for ${runner.name}`,
        `withdrawal-${transaction.id}`
      );

      await this.walletService.markTransactionStatus(
        transaction.id,
        WalletTransactionStatus.PROCESSING,
        { reference: transfer.data.reference }
      );

      return {
        transactionId: transaction.id,
        netAmount,
        feeAmount,
        status: WalletTransactionStatus.PROCESSING,
      };
    } catch (error: any) {
      const isDefiniteRejection =
        error?.response?.status >= 400 && error.response.status < 500;

      if (isDefiniteRejection) {
        await this.walletService.reverseTransaction(
          transaction.id,
          error.message
        );
        throw new BadRequestException(`Withdrawal failed: ${error.message}`);
      }

      this.logger.warn(
        `Withdrawal transfer for user ${userId} could not be confirmed, left PENDING for manual reconciliation: ${error.message}`
      );
      return {
        transactionId: transaction.id,
        netAmount,
        feeAmount,
        status: WalletTransactionStatus.PENDING,
      };
    }
  }

  /**
   * Triggered when an OPEN errand (never picked up by a runner) is
   * cancelled - reverses the wallet debit taken at errand creation, crediting
   * the requester back in full. `ErrandsService.cancel()` only allows this
   * while the errand is still OPEN, so there's nothing to refund once a
   * runner has accepted.
   */
  async processRefund(errandId: string): Promise<WalletTransaction | null> {
    const paymentTransaction =
      await this.walletService.findErrandPaymentByErrandId(errandId);
    if (
      !paymentTransaction ||
      paymentTransaction.status !== WalletTransactionStatus.SUCCESS
    ) {
      return null;
    }

    return this.walletService.reverseTransaction(
      paymentTransaction.id,
      "Errand cancelled before pickup"
    );
  }

  /**
   * Used when a runner forfeits a picked errand (missed timed-errand
   * deadline, or an admin/system reopen after an unanswered concern that a
   * caller decides should also refund rather than stay in escrow). Reverses
   * both the ERRAND_PAYMENT (price + tip, escrowed as one lump sum at
   * creation) and, if boosted, the separate BOOST transaction - the platform
   * fee is never charged to the requester up front (it's only deducted from
   * the runner's payout at completion), so there's nothing to hold back here.
   */
  async forfeitErrandFunds(errandId: string, reason: string): Promise<void> {
    const paymentTransaction =
      await this.walletService.findErrandPaymentByErrandId(errandId);
    if (
      paymentTransaction &&
      paymentTransaction.status === WalletTransactionStatus.SUCCESS
    ) {
      await this.walletService.reverseTransaction(
        paymentTransaction.id,
        reason
      );
    }

    const boostTransaction =
      await this.walletService.findBoostByErrandId(errandId);
    if (
      boostTransaction &&
      boostTransaction.status === WalletTransactionStatus.SUCCESS
    ) {
      await this.walletService.reverseTransaction(boostTransaction.id, reason);
    }
  }
}
