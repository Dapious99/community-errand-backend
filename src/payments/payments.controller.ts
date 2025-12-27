import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { InitializePaymentDto } from './dto/initialize-payment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private configService: ConfigService
  ) {}

  @Post('initialize')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initialize payment for an errand' })
  async initialize(@Body() initializePaymentDto: InitializePaymentDto, @Request() req) {
    return this.paymentsService.initializePayment(initializePaymentDto, req.user.id);
  }

  @Post('verify/:reference')
  @ApiOperation({ summary: 'Verify a payment transaction' })
  async verify(@Param('reference') reference: string) {
    return this.paymentsService.verifyPayment(reference);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Paystack webhook endpoint' })
  async webhook(
    @Body() body: any,
    @Headers('x-paystack-signature') signature: string
  ) {
    const webhookSecret = this.configService.get<string>('PAYSTACK_WEBHOOK_SECRET', '');

    // Verify webhook signature if secret is provided
    if (webhookSecret && signature) {
      const hash = crypto
        .createHmac('sha512', webhookSecret)
        .update(JSON.stringify(body))
        .digest('hex');

      if (hash !== signature) {
        throw new Error('Invalid signature');
      }
    }

    return this.paymentsService.handleWebhook(body);
  }

  @Get('payouts')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get user payouts' })
  async getPayouts(@Request() req) {
    return this.paymentsService.getPayouts(req.user.id);
  }
}

