import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  Request,
  HttpCode,
  HttpStatus,
  Headers,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { PaymentsService } from "./payments.service";
import { DepositDto } from "./dto/deposit.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import * as crypto from "crypto";
import { ConfigService } from "@nestjs/config";
import { Request as ExpressRequest } from "express";

@ApiTags("payments")
@Controller("payments")
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private configService: ConfigService
  ) {}

  @Post("initialize")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Initialize a wallet deposit (top-up) via Paystack",
  })
  async initialize(@Body() depositDto: DepositDto, @Request() req) {
    return this.paymentsService.initializeDeposit(
      req.user.id,
      req.user.email,
      depositDto.amount
    );
  }

  @Post("verify/:reference")
  @ApiOperation({ summary: "Verify a payment transaction" })
  async verify(@Param("reference") reference: string) {
    return this.paymentsService.verifyPayment(reference);
  }

  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Paystack webhook endpoint" })
  async webhook(
    @Body() body: any,
    @Req() req: ExpressRequest,
    @Headers("x-paystack-signature") signature: string
  ) {
    const webhookSecret = this.configService.get<string>(
      "PAYSTACK_WEBHOOK_SECRET",
      ""
    );

    if (webhookSecret) {
      const rawBody = (req as any).rawBody as Buffer | undefined;
      const hash = crypto
        .createHmac("sha512", webhookSecret)
        .update(rawBody ?? JSON.stringify(body))
        .digest("hex");

      const signatureBuffer = Buffer.from(signature ?? "", "utf8");
      const hashBuffer = Buffer.from(hash, "utf8");
      const isValid =
        signatureBuffer.length === hashBuffer.length &&
        crypto.timingSafeEqual(signatureBuffer, hashBuffer);

      if (!isValid) {
        throw new UnauthorizedException("Invalid webhook signature");
      }
    }

    return this.paymentsService.handleWebhook(body);
  }

  @Get("payouts")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get user payouts" })
  async getPayouts(@Request() req) {
    return this.paymentsService.getPayouts(req.user.id);
  }

  @Post("withdraw")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Withdraw the entire wallet balance to your bank account (minus the platform withdrawal fee)",
  })
  async withdraw(@Request() req) {
    return this.paymentsService.initiateWithdrawal(req.user.id);
  }
}
