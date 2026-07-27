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
import { UsersService } from "../users/users.service";
import { KYCStatus } from "../users/entities/kyc.entity";
import { RejectKycDto } from "./dto/reject-kyc.dto";
import { AdminJwtAuthGuard } from "./guards/admin-jwt-auth.guard";

@ApiTags("admin")
@Controller("admin/kyc")
@UseGuards(AdminJwtAuthGuard)
@ApiBearerAuth()
export class AdminKycController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({
    summary: "List KYC submissions, optionally filtered by status",
  })
  async list(@Query("status") status?: KYCStatus) {
    return this.usersService.listKycByStatus(status);
  }

  @Get(":userId")
  @ApiOperation({ summary: "Get a user's KYC submission" })
  async getOne(@Param("userId") userId: string) {
    return this.usersService.getKyc(userId);
  }

  @Patch(":userId/approve")
  @ApiOperation({ summary: "Approve a user's KYC submission" })
  async approve(@Param("userId") userId: string) {
    return this.usersService.approveKyc(userId);
  }

  @Patch(":userId/reject")
  @ApiOperation({ summary: "Reject a user's KYC submission" })
  async reject(
    @Param("userId") userId: string,
    @Body() rejectKycDto: RejectKycDto
  ) {
    return this.usersService.rejectKyc(userId, rejectKycDto.reason);
  }
}
