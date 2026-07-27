import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { RedisService } from "../common/redis/redis.service";
import { MailService } from "../mail/mail.service";
import { OtpPurpose } from "./otp-purpose.enum";

interface StoredOtp {
  code: string;
  metadata?: Record<string, any>;
}

const EMAIL_COPY: Record<OtpPurpose, { subject: string; description: string }> =
  {
    [OtpPurpose.SIGNUP_VERIFICATION]: {
      subject: "Verify your email",
      description: "confirm your email address",
    },
    [OtpPurpose.PASSWORD_RESET]: {
      subject: "Reset your password",
      description: "reset your password",
    },
    [OtpPurpose.NEW_DEVICE_LOGIN]: {
      subject: "Confirm this login",
      description: "confirm a login from a new device",
    },
    [OtpPurpose.BANK_CHANGE]: {
      subject: "Confirm your bank detail change",
      description: "confirm a change to your payout bank details",
    },
  };

@Injectable()
export class OtpService {
  constructor(
    private redisService: RedisService,
    private mailService: MailService,
    private configService: ConfigService
  ) {}

  private getTtlSeconds(): number {
    return this.configService.get<number>("OTP_TTL_SECONDS", 600);
  }

  private getMaxAttempts(): number {
    return this.configService.get<number>("OTP_MAX_ATTEMPTS", 5);
  }

  private codeKey(purpose: OtpPurpose, identifier: string): string {
    return `otp:${purpose}:${identifier}`;
  }

  private attemptsKey(purpose: OtpPurpose, identifier: string): string {
    return `otp:${purpose}:${identifier}:attempts`;
  }

  /**
   * Generates a 6-digit code, stores it in Redis (never Postgres) for
   * OTP_TTL_SECONDS (default 10 minutes), and emails it to the user.
   */
  async request(
    purpose: OtpPurpose,
    identifier: string,
    email: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
    const ttl = this.getTtlSeconds();

    const stored: StoredOtp = { code, metadata };
    await this.redisService.set(
      this.codeKey(purpose, identifier),
      JSON.stringify(stored),
      ttl
    );
    await this.redisService.set(
      this.attemptsKey(purpose, identifier),
      "0",
      ttl
    );

    const { subject, description } = EMAIL_COPY[purpose];
    const minutes = Math.round(ttl / 60);
    await this.mailService.send(
      email,
      subject,
      `<p>Use the code below to ${description}:</p>
       <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${code}</p>
       <p>This code expires in ${minutes} minutes. If you didn't request this, you can ignore this email.</p>`
    );
  }

  /**
   * Verifies a submitted code. Throws on mismatch, expiry, or once the
   * configured max attempts have been used up (the code is invalidated
   * either way, forcing the user to request a fresh one).
   * Returns whatever metadata was stored alongside the code on success.
   */
  async verify(
    purpose: OtpPurpose,
    identifier: string,
    submittedCode: string
  ): Promise<Record<string, any> | undefined> {
    const codeKey = this.codeKey(purpose, identifier);
    const attemptsKey = this.attemptsKey(purpose, identifier);

    const raw = await this.redisService.get(codeKey);
    if (!raw) {
      throw new BadRequestException(
        "Code expired or was never requested. Request a new one."
      );
    }

    const attempts = parseInt(
      (await this.redisService.get(attemptsKey)) ?? "0",
      10
    );
    if (attempts >= this.getMaxAttempts()) {
      await this.redisService.del(codeKey, attemptsKey);
      throw new BadRequestException(
        "Too many incorrect attempts. Request a new code."
      );
    }

    const { code, metadata }: StoredOtp = JSON.parse(raw);

    if (code !== submittedCode) {
      await this.redisService.incr(attemptsKey);
      throw new BadRequestException("Incorrect code.");
    }

    await this.redisService.del(codeKey, attemptsKey);
    return metadata;
  }
}
