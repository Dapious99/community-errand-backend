import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { UsersService } from "./users.service";
import { UpdateUserDto } from "./dto/update-user.dto";
import { CreateKycDto } from "./dto/create-kyc.dto";
import { ConfirmBankChangeDto } from "./dto/confirm-bank-change.dto";
import { UpdateLocationDto } from "./dto/update-location.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

@ApiTags("users")
@Controller("users")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("profile")
  @ApiOperation({ summary: "Get current user profile" })
  async getProfile(@Request() req) {
    return this.usersService.findOne(req.user.id);
  }

  @Patch("profile")
  @ApiOperation({ summary: "Update user profile" })
  async updateProfile(@Request() req, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(req.user.id, updateUserDto);
  }

  @Get("stats")
  @ApiOperation({ summary: "Get user statistics" })
  async getStats(@Request() req) {
    return this.usersService.getUserStats(req.user.id);
  }

  @Post("kyc")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Submit KYC information" })
  async submitKyc(@Request() req, @Body() createKycDto: CreateKycDto) {
    return this.usersService.submitKyc(req.user.id, createKycDto);
  }

  @Get("kyc")
  @ApiOperation({ summary: "Get current user KYC status" })
  async getKyc(@Request() req) {
    return this.usersService.getKyc(req.user.id);
  }

  @Post("kyc/confirm-bank-change")
  @ApiOperation({
    summary: "Confirm a pending bank detail change with the emailed code",
  })
  async confirmBankChange(
    @Request() req,
    @Body() confirmBankChangeDto: ConfirmBankChangeDto
  ) {
    return this.usersService.confirmBankChange(
      req.user.id,
      confirmBankChangeDto.code
    );
  }

  @Post("kyc/resend-bank-change-code")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Resend the pending bank detail change confirmation code",
  })
  async resendBankChangeCode(@Request() req) {
    return this.usersService.resendBankChangeCode(req.user.id);
  }

  @Patch("location")
  @ApiOperation({
    summary: "Report the current user's last known location (runners)",
  })
  async updateLocation(
    @Request() req,
    @Body() updateLocationDto: UpdateLocationDto
  ) {
    await this.usersService.updateLocation(
      req.user.id,
      updateLocationDto.latitude,
      updateLocationDto.longitude
    );
    return { message: "Location updated" };
  }

  @Get(":id/ratings")
  @ApiOperation({ summary: "Get user ratings" })
  async getUserRatings(@Param("id") id: string) {
    return this.usersService.getUserRatings(id);
  }
}
