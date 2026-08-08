import { Injectable, Logger } from "@nestjs/common";
import * as crypto from "crypto";
import { RedisService } from "../common/redis/redis.service";
import { SettingsService } from "../settings/settings.service";

const DEFAULT_LINK_CODE_TTL_SECONDS = 600; // 10 minutes
const DEFAULT_MAX_REDEEM_ATTEMPTS = 5;
const DEFAULT_ATTEMPTS_WINDOW_SECONDS = 900; // 15 minutes

/**
 * Bridges an in-app authenticated user to a WhatsApp phone number. Lives
 * outside WhatsappModule (in its own module with no other dependencies) so
 * both UsersModule (issues codes via an authenticated endpoint) and
 * WhatsappModule (redeems codes from inbound webhook messages) can depend on
 * it without a circular module reference.
 */
@Injectable()
export class WhatsappLinkService {
  private readonly logger = new Logger(WhatsappLinkService.name);

  constructor(
    private redisService: RedisService,
    private settingsService: SettingsService
  ) {}

  private codeKey(code: string): string {
    return `whatsapp:link:${code}`;
  }

  private attemptsKey(phone: string): string {
    return `whatsapp:link:attempts:${phone}`;
  }

  /** Generates a single-use 6-digit code mapping to `userId`, valid for `whatsapp_link_code_ttl_seconds`. */
  async generateCode(userId: string): Promise<string> {
    const ttlSeconds = await this.settingsService.get(
      "whatsapp_link_code_ttl_seconds",
      DEFAULT_LINK_CODE_TTL_SECONDS
    );
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
    await this.redisService.set(this.codeKey(code), userId, ttlSeconds);
    return code;
  }

  /**
   * Redeems a code submitted from WhatsApp. Rate-limited per sending phone
   * number (not per code) to bound brute-forcing the 6-digit code space,
   * since the whole point of this endpoint is that it's reachable by an
   * unauthenticated, unverified phone number. Returns the linked userId, or
   * null if the code is wrong/expired/already used/rate-limited.
   */
  async redeemCode(code: string, fromPhone: string): Promise<string | null> {
    const [maxAttempts, attemptsWindowSeconds] = await Promise.all([
      this.settingsService.get(
        "whatsapp_link_max_redeem_attempts",
        DEFAULT_MAX_REDEEM_ATTEMPTS
      ),
      this.settingsService.get(
        "whatsapp_link_attempts_window_seconds",
        DEFAULT_ATTEMPTS_WINDOW_SECONDS
      ),
    ]);

    const attempts = await this.redisService.incr(this.attemptsKey(fromPhone));
    if (attempts === 1) {
      await this.redisService.set(
        this.attemptsKey(fromPhone),
        "1",
        attemptsWindowSeconds
      );
    }
    if (attempts > maxAttempts) {
      this.logger.warn(
        `WhatsApp link-code redemption rate-limited for ${fromPhone}`
      );
      return null;
    }

    const userId = await this.redisService.get(this.codeKey(code));
    if (!userId) {
      return null;
    }

    await this.redisService.del(this.codeKey(code));
    return userId;
  }
}
