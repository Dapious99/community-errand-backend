import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import { Admin } from "./entities/admin.entity";
import { AdminLoginDto } from "./dto/admin-login.dto";
import { AdminVerifyOtpDto } from "./dto/admin-verify-otp.dto";
import { AdminResendOtpDto } from "./dto/admin-resend-otp.dto";
import { OtpService } from "../otp/otp.service";
import { OtpPurpose } from "../otp/otp-purpose.enum";

@Injectable()
export class AdminAuthService {
  constructor(
    @InjectRepository(Admin)
    private adminsRepository: Repository<Admin>,
    private jwtService: JwtService,
    private configService: ConfigService,
    private otpService: OtpService
  ) {}

  /**
   * Step 1 of admin login: verifies credentials, then emails an OTP instead
   * of returning a token directly - the token is only issued once that code
   * is confirmed via verifyOtp(), so a bare email/password pair can never
   * reach `/admin/*` on its own.
   */
  async login(adminLoginDto: AdminLoginDto) {
    const admin = await this.adminsRepository.findOne({
      where: { email: adminLoginDto.email },
    });

    if (!admin) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const isPasswordValid = await bcrypt.compare(
      adminLoginDto.password,
      admin.passwordHash
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    await this.otpService.request(
      OtpPurpose.ADMIN_LOGIN_VERIFICATION,
      admin.id,
      admin.email
    );

    return {
      requiresOtp: true,
      message:
        "We've emailed you a verification code. Confirm it to finish logging in.",
    };
  }

  /**
   * Step 2: confirms the emailed code and only then issues the admin access
   * token.
   */
  async verifyOtp(adminVerifyOtpDto: AdminVerifyOtpDto) {
    const admin = await this.adminsRepository.findOne({
      where: { email: adminVerifyOtpDto.email },
    });
    if (!admin) {
      throw new BadRequestException("Invalid code");
    }

    await this.otpService.verify(
      OtpPurpose.ADMIN_LOGIN_VERIFICATION,
      admin.id,
      adminVerifyOtpDto.code
    );

    const accessToken = await this.jwtService.signAsync(
      { sub: admin.id, email: admin.email },
      {
        secret: this.configService.get<string>("ADMIN_JWT_SECRET"),
        expiresIn: this.configService.get<string>("ADMIN_JWT_EXPIRES_IN", "4h"),
      }
    );

    return {
      admin: { id: admin.id, email: admin.email, name: admin.name },
      accessToken,
    };
  }

  async resendOtp(adminResendOtpDto: AdminResendOtpDto) {
    const admin = await this.adminsRepository.findOne({
      where: { email: adminResendOtpDto.email },
    });
    if (admin) {
      try {
        await this.otpService.resend(
          OtpPurpose.ADMIN_LOGIN_VERIFICATION,
          admin.id,
          admin.email
        );
      } catch {
        // Nothing pending (e.g. never logged in, or already expired) - fall
        // through to the same generic response either way.
      }
    }

    return {
      message: "If a login verification is pending for that account, a new code has been sent.",
    };
  }

  async findOne(id: string): Promise<Admin> {
    const admin = await this.adminsRepository.findOne({ where: { id } });
    if (!admin) {
      throw new UnauthorizedException("Invalid token");
    }
    return admin;
  }
}
