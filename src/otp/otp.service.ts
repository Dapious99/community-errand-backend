import { BadRequestException, Injectable, Logger } from "@nestjs/common";
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
  private readonly logger = new Logger(OtpService.name);
  private readonly bypassEnabled: boolean;
  // Only ever populated when OTP_BYPASS is on - stands in for Redis so every
  // OTP-gated flow keeps working (including metadata round-tripping, e.g.
  // bank-change) without Redis/Resend configured at all.
  private readonly bypassStore = new Map<
    string,
    { value: string; expiresAt: number }
  >();

  constructor(
    private redisService: RedisService,
    private mailService: MailService,
    private configService: ConfigService
  ) {
    this.bypassEnabled = this.configService.get<boolean>("OTP_BYPASS", false);

    if (this.bypassEnabled) {
      if (this.configService.get<string>("NODE_ENV") === "production") {
        throw new Error(
          "OTP_BYPASS must not be enabled in production - it skips real code delivery entirely."
        );
      }
      this.logger.warn(
        "OTP_BYPASS is enabled - codes are kept in memory and logged to the console instead of Redis/email. Turn this off once REDIS_URL/RESEND_API_KEY are configured."
      );
    }
  }

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

  private async storeSet(
    key: string,
    value: string,
    ttlSeconds: number
  ): Promise<void> {
    if (this.bypassEnabled) {
      this.bypassStore.set(key, {
        value,
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
      return;
    }
    await this.redisService.set(key, value, ttlSeconds);
  }

  private async storeGet(key: string): Promise<string | null> {
    if (this.bypassEnabled) {
      const entry = this.bypassStore.get(key);
      if (!entry) return null;
      if (entry.expiresAt < Date.now()) {
        this.bypassStore.delete(key);
        return null;
      }
      return entry.value;
    }
    return this.redisService.get(key);
  }

  private async storeDel(...keys: string[]): Promise<void> {
    if (this.bypassEnabled) {
      keys.forEach((key) => this.bypassStore.delete(key));
      return;
    }
    await this.redisService.del(...keys);
  }

  private async storeIncr(key: string): Promise<number> {
    if (this.bypassEnabled) {
      const entry = this.bypassStore.get(key);
      const next = (parseInt(entry?.value ?? "0", 10) + 1).toString();
      this.bypassStore.set(key, {
        value: next,
        expiresAt: entry?.expiresAt ?? Date.now() + this.getTtlSeconds() * 1000,
      });
      return parseInt(next, 10);
    }
    return this.redisService.incr(key);
  }

  /**
   * Generates a 6-digit code, stores it in Redis (never Postgres) for
   * OTP_TTL_SECONDS (default 10 minutes), and emails it to the user. Under
   * OTP_BYPASS, storage moves to memory and the code is logged instead of
   * emailed.
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
    await this.storeSet(
      this.codeKey(purpose, identifier),
      JSON.stringify(stored),
      ttl
    );
    await this.storeSet(this.attemptsKey(purpose, identifier), "0", ttl);

    if (this.bypassEnabled) {
      this.logger.warn(
        `[OTP BYPASS] ${purpose} code for ${email} (${identifier}): ${code}`
      );
      return;
    }

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
   * Re-issues a fresh code (new value, full TTL, attempts reset) for a
   * purpose/identifier that already has one pending, preserving whatever
   * metadata was stored alongside it (e.g. the pending bank-change payload).
   * Throws if there's nothing currently pending to resend - the caller
   * should start the original flow again in that case.
   */
  async resend(
    purpose: OtpPurpose,
    identifier: string,
    email: string
  ): Promise<void> {
    const raw = await this.storeGet(this.codeKey(purpose, identifier));
    if (!raw) {
      throw new BadRequestException(
        "There's nothing pending to resend a code for - start the process again."
      );
    }

    const { metadata }: StoredOtp = JSON.parse(raw);
    await this.request(purpose, identifier, email, metadata);
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

    const raw = await this.storeGet(codeKey);
    if (!raw) {
      throw new BadRequestException(
        "Code expired or was never requested. Request a new one."
      );
    }

    const attempts = parseInt((await this.storeGet(attemptsKey)) ?? "0", 10);
    if (attempts >= this.getMaxAttempts()) {
      await this.storeDel(codeKey, attemptsKey);
      throw new BadRequestException(
        "Too many incorrect attempts. Request a new code."
      );
    }

    const { code, metadata }: StoredOtp = JSON.parse(raw);

    if (code !== submittedCode) {
      await this.storeIncr(attemptsKey);
      throw new BadRequestException("Incorrect code.");
    }

    await this.storeDel(codeKey, attemptsKey);
    return metadata;
  }
}
