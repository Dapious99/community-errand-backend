import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { KycService } from "./kyc.service";
import { SubmitIdentityDto } from "./dto/submit-identity.dto";
import { SubmitBankDetailsDto } from "./dto/submit-bank-details.dto";
import { ConfirmBankChangeDto } from "./dto/confirm-bank-change.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

@ApiTags("kyc")
@Controller("users/kyc")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Post("identity")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Submit identity verification (NIN/BVN/ID photo)" })
  async submitIdentity(@Request() req, @Body() dto: SubmitIdentityDto) {
    return this.kycService.submitIdentity(req.user.id, dto);
  }

  @Post("bank")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Submit payout bank details" })
  async submitBankDetails(@Request() req, @Body() dto: SubmitBankDetailsDto) {
    return this.kycService.submitBankDetails(req.user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: "Get current user KYC status" })
  async getKyc(@Request() req) {
    return this.kycService.getKyc(req.user.id);
  }

  @Post("confirm-bank-change")
  @ApiOperation({
    summary: "Confirm a pending bank detail change with the emailed code",
  })
  async confirmBankChange(
    @Request() req,
    @Body() confirmBankChangeDto: ConfirmBankChangeDto
  ) {
    return this.kycService.confirmBankChange(
      req.user.id,
      confirmBankChangeDto.code
    );
  }

  @Post("resend-bank-change-code")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Resend the pending bank detail change confirmation code",
  })
  async resendBankChangeCode(@Request() req) {
    return this.kycService.resendBankChangeCode(req.user.id);
  }
}
