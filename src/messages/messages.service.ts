import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Message } from "./entities/message.entity";
import { Errand } from "../errands/entities/errand.entity";
import { CreateMessageDto } from "./dto/create-message.dto";
import { AiService } from "../ai/ai.service";
import { UsersService } from "../users/users.service";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    @InjectRepository(Message)
    private messagesRepository: Repository<Message>,
    @InjectRepository(Errand)
    private errandsRepository: Repository<Errand>,
    private aiService: AiService,
    private usersService: UsersService,
    private notificationsService: NotificationsService
  ) {}

  async create(
    errandId: string,
    createMessageDto: CreateMessageDto,
    userId: string
  ): Promise<Message> {
    // Verify errand exists and user is part of it
    const errand = await this.errandsRepository.findOne({
      where: { id: errandId },
    });

    if (!errand) {
      throw new NotFoundException("Errand not found");
    }

    if (errand.requesterId !== userId && errand.runnerId !== userId) {
      throw new ForbiddenException("You are not part of this errand");
    }

    const message = this.messagesRepository.create({
      errandId,
      fromUserId: userId,
      text: createMessageDto.text,
    });

    const saved = await this.messagesRepository.save(message);

    const recipientId =
      errand.requesterId === userId ? errand.runnerId : errand.requesterId;
    if (recipientId) {
      this.notifyRecipient(recipientId, errand.title, saved.text).catch(
        (error: any) =>
          this.logger.warn(
            `New-message notification failed for errand ${errandId}: ${error.message}`
          )
      );
    }

    // Re-fetch with just the sender's display fields - both the REST response
    // and the gateway's room broadcast need a name/avatar to render, but a
    // bare `save()` result has no relations loaded.
    return (
      (await this.messagesRepository
        .createQueryBuilder("message")
        .leftJoin("message.fromUser", "fromUser")
        .addSelect(["fromUser.id", "fromUser.name", "fromUser.avatarUrl"])
        .where("message.id = :id", { id: saved.id })
        .getOne()) ?? saved
    );
  }

  private async notifyRecipient(
    recipientId: string,
    errandTitle: string,
    text: string
  ): Promise<void> {
    const recipient = await this.usersService.findOne(recipientId);
    if (!recipient.notifyNewMessages) return;

    await this.notificationsService.sendToUsers(
      [recipientId],
      `New message: ${errandTitle}`,
      text
    );
  }

  async findByErrand(errandId: string, userId: string): Promise<Message[]> {
    await this.verifyParticipant(errandId, userId);

    // Select only the sender fields the client needs to render a chat bubble -
    // a plain `relations: ["fromUser"]` would pull the full User row (email,
    // phone, DOB, address, emergency contacts, etc) into every message.
    return this.messagesRepository
      .createQueryBuilder("message")
      .leftJoin("message.fromUser", "fromUser")
      .addSelect(["fromUser.id", "fromUser.name", "fromUser.avatarUrl"])
      .where("message.errandId = :errandId", { errandId })
      .orderBy("message.createdAt", "ASC")
      .getMany();
  }

  /** Feature D (AI Smart Replies): up to 3 quick-reply suggestions from recent context. */
  async getSmartReplies(errandId: string, userId: string): Promise<string[]> {
    await this.verifyParticipant(errandId, userId);

    const recentMessages = await this.messagesRepository.find({
      where: { errandId },
      order: { createdAt: "DESC" },
      take: 10,
    });

    return this.aiService.generateSmartReplies(
      recentMessages
        .reverse()
        .map((m) => ({ fromUserId: m.fromUserId, text: m.text }))
    );
  }

  async verifyParticipant(errandId: string, userId: string): Promise<void> {
    const errand = await this.errandsRepository.findOne({
      where: { id: errandId },
    });

    if (!errand) {
      throw new NotFoundException("Errand not found");
    }

    if (errand.requesterId !== userId && errand.runnerId !== userId) {
      throw new ForbiddenException("You are not part of this errand");
    }
  }
}
