import {
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

/**
 * Thin wrapper around ioredis. Used for short-lived, self-expiring data
 * (OTP codes, attempt counters) that should never land in Postgres.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client?: Redis;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const url = this.configService.get<string>("REDIS_URL");

    if (!url) {
      this.logger.warn(
        "REDIS_URL is not set - OTP codes (signup verification, password reset, etc.) will fail until it's configured."
      );
      return;
    }

    this.client = new Redis(url);
    this.client.on("error", (error) => {
      this.logger.error(`Redis connection error: ${error.message || error}`);
    });
  }

  async onModuleDestroy() {
    await this.client?.quit();
  }

  private getClient(): Redis {
    if (!this.client) {
      throw new InternalServerErrorException(
        "Redis isn't configured (missing REDIS_URL)."
      );
    }
    return this.client;
  }

  async set(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.getClient().set(key, value, "EX", ttlSeconds);
  }

  async get(key: string): Promise<string | null> {
    return this.getClient().get(key);
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.getClient().del(...keys);
  }

  async incr(key: string): Promise<number> {
    return this.getClient().incr(key);
  }
}
