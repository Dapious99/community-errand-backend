import { Controller, Post, Body, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { AdminAuthService } from "./admin-auth.service";
import { AdminLoginDto } from "./dto/admin-login.dto";
import { AdminVerifyOtpDto } from "./dto/admin-verify-otp.dto";
import { AdminResendOtpDto } from "./dto/admin-resend-otp.dto";

@ApiTags("admin")
@Controller("admin/auth")
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Admin login (step 1 of 2)",
    description:
      "Verifies email/password and emails an OTP - returns { requiresOtp: true } rather than a token. Call POST /admin/auth/verify-otp with that code to complete login.",
  })
  async login(@Body() adminLoginDto: AdminLoginDto) {
    return this.adminAuthService.login(adminLoginDto);
  }

  @Post("verify-otp")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Confirm the admin login OTP (step 2 of 2)" })
  async verifyOtp(@Body() adminVerifyOtpDto: AdminVerifyOtpDto) {
    return this.adminAuthService.verifyOtp(adminVerifyOtpDto);
  }

  @Post("resend-otp")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Resend the admin login verification code" })
  async resendOtp(@Body() adminResendOtpDto: AdminResendOtpDto) {
    return this.adminAuthService.resendOtp(adminResendOtpDto);
  }
}
