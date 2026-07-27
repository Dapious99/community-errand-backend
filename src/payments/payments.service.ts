import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Payment, PaymentType, PaymentStatus } from "./entities/payment.entity";
import { Errand, ErrandStatus } from "../errands/entities/errand.entity";
import { User } from "../users/entities/user.entity";
import { KYC, KYCStatus } from "../users/entities/kyc.entity";
import { PaystackService } from "./services/paystack.service";
import { InitializePaymentDto } from "./dto/initialize-payment.dto";

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
    private configService: ConfigService,
    private eventEmitter: EventEmitter2,
    private dataSource: DataSource
  ) {}

  private getPlatformFeePercent(): number {
    return this.configService.get<number>("PLATFORM_FEE_PERCENT", 10);
  }

  async initializePayment(
    initializePaymentDto: InitializePaymentDto,
    userId: string
  ) {
    const { errandId, email, amount } = initializePaymentDto;

    const errand = await this.errandsRepository.findOne({
      where: { id: errandId },
      relations: ["requester"],
    });

    if (!errand) {
      throw new NotFoundException("Errand not found");
    }

    if (errand.requesterId !== userId) {
      throw new ForbiddenException("Only the requester can initialize payment");
    }

    if (
      errand.status !== ErrandStatus.OPEN &&
      errand.status !== ErrandStatus.ACCEPTED
    ) {
      throw new BadRequestException(
        "Payment can only be initialized for open or accepted errands"
      );
    }

    // Check if payment already exists
    const existingPayment = await this.paymentsRepository.findOne({
      where: {
        errandId,
        type: PaymentType.ESCROW,
        status: PaymentStatus.SUCCESS,
      },
    });

    if (existingPayment) {
      throw new BadRequestException(
        "Payment already processed for this errand"
      );
    }

    // Generate reference
    const reference = `errand-${errandId}-${Date.now()}`;

    // Initialize Paystack payment
    const paystackResponse = await this.paystackService.initializePayment(
      email,
      amount,
      reference,
      {
        errandId,
        userId,
      }
    );

    // Create payment record
    const payment = this.paymentsRepository.create({
      errandId,
      userId,
      amount,
      type: PaymentType.ESCROW,
      status: PaymentStatus.PENDING,
      paystackReference: paystackResponse.data.reference,
      paystackAuthorizationUrl: paystackResponse.data.authorization_url,
      description: `Payment for errand: ${errand.title}`,
    });

    await this.paymentsRepository.save(payment);

    return {
      paymentId: payment.id,
      authorizationUrl: paystackResponse.data.authorization_url,
      reference: paystackResponse.data.reference,
    };
  }

  /**
   * Initializes a system-determined (not client-supplied) charge for the
   * AI-Boost feature. Unlike escrow, the boost's actual effects (title
   * rewrite, isBoosted flag, runner notifications) only activate once the
   * webhook confirms this payment succeeded - see the `payment.boost.succeeded`
   * event handler in ErrandsService - so a user can't get boosted-listing
   * perks without actually completing the charge.
   */
  async initializeBoostPayment(
    errandId: string,
    userId: string,
    email: string,
    amount: number
  ) {
    const errand = await this.errandsRepository.findOne({
      where: { id: errandId },
    });
    if (!errand) {
      throw new NotFoundException("Errand not found");
    }

    const reference = `boost-${errandId}-${Date.now()}`;

    const paystackResponse = await this.paystackService.initializePayment(
      email,
      amount,
      reference,
      { errandId, userId, purpose: "boost" }
    );

    const payment = this.paymentsRepository.create({
      errandId,
      userId,
      amount,
      type: PaymentType.BOOST,
      status: PaymentStatus.PENDING,
      paystackReference: paystackResponse.data.reference,
      paystackAuthorizationUrl: paystackResponse.data.authorization_url,
      description: `AI-Boost for errand: ${errand.title}`,
    });

    await this.paymentsRepository.save(payment);

    return {
      paymentId: payment.id,
      authorizationUrl: paystackResponse.data.authorization_url,
      reference: paystackResponse.data.reference,
    };
  }

  async verifyPayment(reference: string) {
    const payment = await this.paymentsRepository.findOne({
      where: { paystackReference: reference },
      relations: ["errand"],
    });

    if (!payment) {
      throw new NotFoundException("Payment not found");
    }

    // Verify with Paystack
    const verification = await this.paystackService.verifyPayment(reference);

    if (verification.data.status === "success") {
      payment.status = PaymentStatus.SUCCESS;
      await this.paymentsRepository.save(payment);

      // Update errand status if needed
      if (
        payment.type === PaymentType.ESCROW &&
        payment.errand.status === ErrandStatus.OPEN
      ) {
        // Payment successful, errand can proceed
      }
    } else {
      payment.status = PaymentStatus.FAILED;
      await this.paymentsRepository.save(payment);
    }

    return payment;
  }

  async handleWebhook(data: any) {
    const { event, data: paymentData } = data;

    if (event === "charge.success") {
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

  async getPayouts(userId: string) {
    return this.paymentsRepository.find({
      where: {
        userId,
        type: PaymentType.PAYOUT,
      },
      relations: ["errand"],
      order: { createdAt: "DESC" },
    });
  }

  /**
   * Triggered when an errand is marked COMPLETED. Deducts the platform fee from
   * the escrowed amount and pays the remainder out to the runner. Falls back to
   * a PENDING bookkeeping record (for manual settlement) if a real Paystack
   * transfer cannot be completed, so errand completion is never blocked by it.
   */
  async processPayout(errandId: string): Promise<Payment | null> {
    const existingPayout = await this.paymentsRepository.findOne({
      where: { errandId, type: PaymentType.PAYOUT },
    });
    if (existingPayout) {
      return existingPayout;
    }

    const escrowPayment = await this.paymentsRepository.findOne({
      where: {
        errandId,
        type: PaymentType.ESCROW,
        status: PaymentStatus.SUCCESS,
      },
    });
    if (!escrowPayment) {
      this.logger.warn(
        `No successful escrow payment found for errand ${errandId}; skipping payout`
      );
      return null;
    }

    const errand = await this.errandsRepository.findOne({
      where: { id: errandId },
    });
    if (!errand || !errand.runnerId) {
      return null;
    }

    const feePercent = this.getPlatformFeePercent();
    const platformFee = Number(
      ((Number(errand.price) * feePercent) / 100).toFixed(2)
    );
    const payoutAmount = Number(
      (Number(errand.price) - platformFee).toFixed(2)
    );
    const reference = `payout-${errandId}-${escrowPayment.id}`;

    const payout = this.paymentsRepository.create({
      errandId,
      userId: errand.runnerId,
      amount: payoutAmount,
      type: PaymentType.PAYOUT,
      status: PaymentStatus.PENDING,
      description: `Payout for errand "${errand.title}" (platform fee: ${platformFee})`,
    });

    try {
      const runner = await this.usersRepository.findOne({
        where: { id: errand.runnerId },
      });
      const kyc = await this.kycRepository.findOne({
        where: { userId: errand.runnerId },
      });

      if (
        !runner ||
        !kyc ||
        kyc.status !== KYCStatus.APPROVED ||
        !kyc.bankAccountNumber ||
        !kyc.bankName
      ) {
        throw new Error(
          "Runner does not have approved KYC with bank details on file"
        );
      }

      let recipientCode = kyc.paystackRecipientCode;
      if (!recipientCode) {
        const bankCode = await this.paystackService.resolveBankCode(
          kyc.bankName
        );
        if (!bankCode) {
          throw new Error(
            `Could not resolve Paystack bank code for "${kyc.bankName}"`
          );
        }
        recipientCode = await this.paystackService.createTransferRecipient(
          runner.name,
          kyc.bankAccountNumber,
          bankCode
        );
        kyc.paystackRecipientCode = recipientCode;
        await this.kycRepository.save(kyc);
      }

      const transfer = await this.paystackService.initiateTransfer(
        recipientCode,
        payoutAmount,
        `Errand payout: ${errand.title}`,
        reference
      );

      payout.status = PaymentStatus.PROCESSING;
      payout.paystackReference = transfer.data.reference;
    } catch (error: any) {
      this.logger.warn(
        `Automatic payout failed for errand ${errandId}, recorded as PENDING for manual settlement: ${error.message}`
      );
      payout.paystackReference = reference;
    }

    return this.paymentsRepository.save(payout);
  }

  /**
   * Triggered when an errand with an existing successful escrow payment is
   * cancelled, refunding the requester in full.
   */
  async processRefund(errandId: string): Promise<Payment | null> {
    const existingRefund = await this.paymentsRepository.findOne({
      where: { errandId, type: PaymentType.REFUND },
    });
    if (existingRefund) {
      return existingRefund;
    }

    const escrowPayment = await this.paymentsRepository.findOne({
      where: {
        errandId,
        type: PaymentType.ESCROW,
        status: PaymentStatus.SUCCESS,
      },
    });
    if (!escrowPayment) {
      return null;
    }

    const refund = this.paymentsRepository.create({
      errandId,
      userId: escrowPayment.userId,
      amount: escrowPayment.amount,
      type: PaymentType.REFUND,
      status: PaymentStatus.PENDING,
      description: `Refund for cancelled errand (original reference: ${escrowPayment.paystackReference})`,
    });

    try {
      await this.paystackService.refundTransaction(
        escrowPayment.paystackReference
      );
      refund.status = PaymentStatus.PROCESSING;
    } catch (error: any) {
      this.logger.warn(
        `Automatic refund failed for errand ${errandId}, recorded as PENDING for manual processing: ${error.message}`
      );
    }

    return this.paymentsRepository.save(refund);
  }
}
