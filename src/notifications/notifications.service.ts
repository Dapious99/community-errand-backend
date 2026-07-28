import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import axios from "axios";
import { PushToken } from "./entities/push-token.entity";
import { UsersService } from "../users/users.service";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_TOKEN_PATTERN = /^ExponentPushToken\[.*\]$/;
const EXPO_BATCH_SIZE = 100;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(PushToken)
    private pushTokensRepository: Repository<PushToken>,
    private usersService: UsersService
  ) {}

  async registerToken(
    userId: string,
    deviceId: string,
    expoPushToken: string
  ): Promise<void> {
    const existing = await this.pushTokensRepository.findOne({
      where: { userId, deviceId },
    });

    if (existing) {
      existing.expoPushToken = expoPushToken;
      await this.pushTokensRepository.save(existing);
      return;
    }

    const token = this.pushTokensRepository.create({
      userId,
      deviceId,
      expoPushToken,
    });
    await this.pushTokensRepository.save(token);
  }

  /** Fire-and-forget: failures are logged, never thrown, so a push outage never blocks a caller. */
  async sendToUsers(
    userIds: string[],
    title: string,
    body: string,
    data?: Record<string, any>
  ): Promise<void> {
    if (userIds.length === 0) return;

    const tokens = await this.pushTokensRepository.find({
      where: { userId: In(userIds) },
    });
    const validTokens = tokens.filter((t) =>
      EXPO_TOKEN_PATTERN.test(t.expoPushToken)
    );

    if (validTokens.length === 0) return;

    const messages = validTokens.map((t) => ({
      to: t.expoPushToken,
      title,
      body,
      data,
    }));

    for (const batch of chunk(messages, EXPO_BATCH_SIZE)) {
      try {
        await axios.post(EXPO_PUSH_URL, batch, {
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        });
      } catch (error: any) {
        this.logger.warn(`Expo push send failed: ${error.message}`);
      }
    }
  }

  async notifyNearbyTopRatedRunners(params: {
    latitude: number;
    longitude: number;
    radiusKm?: number;
    limit?: number;
    title: string;
    body: string;
    data?: Record<string, any>;
  }): Promise<void> {
    const runners = await this.usersService.findNearbyTopRatedRunners(
      params.latitude,
      params.longitude,
      params.radiusKm ?? 10,
      params.limit ?? 20
    );

    if (runners.length === 0) return;

    await this.sendToUsers(
      runners.map((r) => r.id),
      params.title,
      params.body,
      params.data
    );
  }

  /** Pro perk: unlike notifyNearbyTopRatedRunners (boost-payment-gated), this fires for every new errand. */
  async notifyNearbyProUsers(params: {
    latitude: number;
    longitude: number;
    radiusKm?: number;
    limit?: number;
    title: string;
    body: string;
    data?: Record<string, any>;
  }): Promise<void> {
    const proUsers = await this.usersService.findNearbyProUsers(
      params.latitude,
      params.longitude,
      params.radiusKm ?? 10,
      params.limit ?? 50
    );

    if (proUsers.length === 0) return;

    await this.sendToUsers(
      proUsers.map((u) => u.id),
      params.title,
      params.body,
      params.data
    );
  }
}
