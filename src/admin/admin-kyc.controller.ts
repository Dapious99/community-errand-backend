import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { KycService } from "../kyc/kyc.service";
import { KYCStatus } from "../users/entities/kyc.entity";
import { RejectKycDto } from "./dto/reject-kyc.dto";
import { AdminJwtAuthGuard } from "./guards/admin-jwt-auth.guard";

@ApiTags("admin")
@Controller("admin/kyc")
@UseGuards(AdminJwtAuthGuard)
@ApiBearerAuth()
export class AdminKycController {
  constructor(private readonly kycService: KycService) {}

  @Get()
  @ApiOperation({
    summary: "List KYC submissions, optionally filtered by status",
  })
  async list(@Query("status") status?: KYCStatus) {
    return this.kycService.listKycByStatus(status);
  }

  @Get(":userId")
  @ApiOperation({ summary: "Get a user's KYC submission" })
  async getOne(@Param("userId") userId: string) {
    return this.kycService.getKyc(userId);
  }

  @Patch(":userId/approve")
  @ApiOperation({ summary: "Approve a user's KYC submission" })
  async approve(@Param("userId") userId: string) {
    return this.kycService.approveKyc(userId);
  }

  @Patch(":userId/reject")
  @ApiOperation({ summary: "Reject a user's KYC submission" })
  async reject(
    @Param("userId") userId: string,
    @Body() rejectKycDto: RejectKycDto
  ) {
    return this.kycService.rejectKyc(userId, rejectKycDto.reason);
  }
}
