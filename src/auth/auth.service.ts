import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import * as bcrypt from "bcrypt";
import { UsersService } from "../users/users.service";
import { CreateUserDto } from "../users/dto/create-user.dto";
import { LoginDto } from "../users/dto/login.dto";
import { VerifyEmailDto } from "./dto/verify-email.dto";
import { ResendVerificationDto } from "./dto/resend-verification.dto";
import { ForgotPasswordDto } from "./dto/forgot-password.dto";
import { ResetPasswordDto } from "./dto/reset-password.dto";
import { ConfirmDeviceDto } from "./dto/confirm-device.dto";
import { OtpService } from "../otp/otp.service";
import { OtpPurpose } from "../otp/otp-purpose.enum";
import { TrustedDevice } from "./entities/trusted-device.entity";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private otpService: OtpService,
    @InjectRepository(TrustedDevice)
    private trustedDevicesRepository: Repository<TrustedDevice>
  ) {}

  async register(createUserDto: CreateUserDto) {
    const { deviceId, ...userDto } = createUserDto;
    const user = await this.usersService.create(userDto);

    if (deviceId) {
      await this.trustDevice(user.id, deviceId);
    }

    try {
      await this.otpService.request(
        OtpPurpose.SIGNUP_VERIFICATION,
        user.id,
        user.email
      );
    } catch (error: any) {
      this.logger.warn(
        `Failed to send signup verification email to ${user.email}: ${error.message}`
      );
    }

    const tokens = await this.generateTokens(user.id, user.email);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        verified: user.verified,
      },
      ...tokens,
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmail(loginDto.email);
    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.passwordHash
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const isDeviceTrusted = loginDto.deviceId
      ? await this.trustedDevicesRepository.findOne({
          where: { userId: user.id, deviceId: loginDto.deviceId },
        })
      : null;

    if (!isDeviceTrusted) {
      await this.otpService.request(
        OtpPurpose.NEW_DEVICE_LOGIN,
        this.deviceLoginIdentifier(user.id, loginDto.deviceId ?? "unknown"),
        user.email
      );

      return {
        requiresDeviceVerification: true,
        message:
          "We don't recognize this device. Enter the code we emailed you to finish logging in.",
      };
    }

    isDeviceTrusted.lastUsedAt = new Date();
    await this.trustedDevicesRepository.save(isDeviceTrusted);

    const tokens = await this.generateTokens(user.id, user.email);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        verified: user.verified,
        ratingAvg: user.ratingAvg,
        avatarUrl: user.avatarUrl,
      },
      ...tokens,
    };
  }

  /**
   * For the "enter the code we emailed you" screen after a new-device login
   * attempt - resends without requiring the password again (unlike calling
   * `login()` again, which would). Same enumeration-safe generic response
   * as `resendVerification`/`forgotPassword` regardless of whether the
   * account exists or has a pending device confirmation.
   */
  async resendDeviceLoginCode(email: string, deviceId: string) {
    const user = await this.usersService.findByEmail(email);
    if (user) {
      try {
        await this.otpService.resend(
          OtpPurpose.NEW_DEVICE_LOGIN,
          this.deviceLoginIdentifier(user.id, deviceId),
          user.email
        );
      } catch {
        // Nothing pending (e.g. already trusted, or expired) - fall through
        // to the same generic response either way.
      }
    }

    return {
      message:
        "If a device confirmation is pending for that account, a new code has been sent.",
    };
  }

  async confirmDevice(confirmDeviceDto: ConfirmDeviceDto) {
    const { email, deviceId, code } = confirmDeviceDto;
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException("Invalid code");
    }

    await this.otpService.verify(
      OtpPurpose.NEW_DEVICE_LOGIN,
      this.deviceLoginIdentifier(user.id, deviceId),
      code
    );

    await this.trustDevice(user.id, deviceId);
    const tokens = await this.generateTokens(user.id, user.email);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        verified: user.verified,
        ratingAvg: user.ratingAvg,
        avatarUrl: user.avatarUrl,
      },
      ...tokens,
    };
  }

  async verifyEmail(verifyEmailDto: VerifyEmailDto) {
    const user = await this.usersService.findByEmail(verifyEmailDto.email);
    if (!user) {
      throw new BadRequestException("Invalid code");
    }

    await this.otpService.verify(
      OtpPurpose.SIGNUP_VERIFICATION,
      user.id,
      verifyEmailDto.code
    );
    await this.usersService.setVerified(user.id);

    return { message: "Email verified" };
  }

  async resendVerification(resendVerificationDto: ResendVerificationDto) {
    const user = await this.usersService.findByEmail(
      resendVerificationDto.email
    );
    if (user && !user.verified) {
      await this.otpService.request(
        OtpPurpose.SIGNUP_VERIFICATION,
        user.id,
        user.email
      );
    }

    // Always return the same response, whether or not the account exists or
    // is already verified, so this endpoint can't be used to enumerate emails.
    return {
      message: "If that account needs verification, a code has been sent.",
    };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const user = await this.usersService.findByEmail(forgotPasswordDto.email);
    if (user) {
      await this.otpService.request(
        OtpPurpose.PASSWORD_RESET,
        user.id,
        user.email
      );
    }

    return { message: "If that account exists, a reset code has been sent." };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { email, code, newPassword } = resetPasswordDto;
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      throw new BadRequestException("Invalid code");
    }

    await this.otpService.verify(OtpPurpose.PASSWORD_RESET, user.id, code);

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await this.usersService.setPassword(user.id, passwordHash);

    return { message: "Password reset" };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>("JWT_REFRESH_SECRET"),
      });

      const user = await this.usersService.findOne(payload.sub);
      const tokens = await this.generateTokens(user.id, user.email);

      return tokens;
    } catch (error) {
      throw new UnauthorizedException("Invalid refresh token");
    }
  }

  private deviceLoginIdentifier(userId: string, deviceId: string): string {
    return `${userId}:${deviceId}`;
  }

  private async trustDevice(userId: string, deviceId: string): Promise<void> {
    const existing = await this.trustedDevicesRepository.findOne({
      where: { userId, deviceId },
    });

    if (existing) {
      existing.lastUsedAt = new Date();
      await this.trustedDevicesRepository.save(existing);
      return;
    }

    const device = this.trustedDevicesRepository.create({ userId, deviceId });
    await this.trustedDevicesRepository.save(device);
  }

  private async generateTokens(userId: string, email: string) {
    const payload = { sub: userId, email };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>("JWT_SECRET"),
        expiresIn: this.configService.get<string>("JWT_EXPIRES_IN", "15m"),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get<string>("JWT_REFRESH_SECRET"),
        expiresIn: this.configService.get<string>(
          "JWT_REFRESH_EXPIRES_IN",
          "7d"
        ),
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }
}
