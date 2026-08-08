import { Injectable } from "@nestjs/common";
import { RedisService } from "../common/redis/redis.service";

const SESSION_TTL_SECONDS = 900; // 15 minutes of inactivity resets to the main menu

export interface WhatsappSession {
  /** Which flow is currently active (e.g. "account"), or undefined at the main menu. */
  flow?: string;
  /** Flow-specific step name, e.g. "awaiting_rating_review". */
  step?: string;
  /** Free-form scratch data the active flow is collecting (draft fields, etc). */
  data?: Record<string, any>;
}

/**
 * Per-phone-number conversation state, keyed off the inbound WhatsApp
 * number rather than userId - a message can arrive before identity is even
 * resolved (e.g. mid-linking). Wraps the same RedisService OtpService uses,
 * with its own key namespace.
 */
@Injectable()
export class WhatsappSessionService {
  constructor(private redisService: RedisService) {}

  private key(phone: string): string {
    return `whatsapp:session:${phone}`;
  }

  async get(phone: string): Promise<WhatsappSession> {
    const raw = await this.redisService.get(this.key(phone));
    return raw ? JSON.parse(raw) : {};
  }

  async set(phone: string, session: WhatsappSession): Promise<void> {
    await this.redisService.set(
      this.key(phone),
      JSON.stringify(session),
      SESSION_TTL_SECONDS
    );
  }

  async clear(phone: string): Promise<void> {
    await this.redisService.del(this.key(phone));
  }
}
