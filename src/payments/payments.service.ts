import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Payment, PaymentType, PaymentStatus } from './entities/payment.entity';
import { Errand, ErrandStatus } from '../errands/entities/errand.entity';
import { User } from '../users/entities/user.entity';
import { PaystackService } from './services/paystack.service';
import { InitializePaymentDto } from './dto/initialize-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private paymentsRepository: Repository<Payment>,
    @InjectRepository(Errand)
    private errandsRepository: Repository<Errand>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private paystackService: PaystackService,
    private dataSource: DataSource
  ) {}

  async initializePayment(
    initializePaymentDto: InitializePaymentDto,
    userId: string
  ) {
    const { errandId, email, amount } = initializePaymentDto;

    const errand = await this.errandsRepository.findOne({
      where: { id: errandId },
      relations: ['requester'],
    });

    if (!errand) {
      throw new NotFoundException('Errand not found');
    }

    if (errand.requesterId !== userId) {
      throw new ForbiddenException('Only the requester can initialize payment');
    }

    if (errand.status !== ErrandStatus.OPEN && errand.status !== ErrandStatus.ACCEPTED) {
      throw new BadRequestException('Payment can only be initialized for open or accepted errands');
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
      throw new BadRequestException('Payment already processed for this errand');
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

  async verifyPayment(reference: string) {
    const payment = await this.paymentsRepository.findOne({
      where: { paystackReference: reference },
      relations: ['errand'],
    });

    if (!payment) {
      throw new NotFoundException('Payment not found');
    }

    // Verify with Paystack
    const verification = await this.paystackService.verifyPayment(reference);

    if (verification.data.status === 'success') {
      payment.status = PaymentStatus.SUCCESS;
      await this.paymentsRepository.save(payment);

      // Update errand status if needed
      if (payment.type === PaymentType.ESCROW && payment.errand.status === ErrandStatus.OPEN) {
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

    if (event === 'charge.success') {
      const payment = await this.paymentsRepository.findOne({
        where: { paystackReference: paymentData.reference },
      });

      if (payment) {
        payment.status = PaymentStatus.SUCCESS;
        await this.paymentsRepository.save(payment);
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
      relations: ['errand'],
      order: { createdAt: 'DESC' },
    });
  }
}

