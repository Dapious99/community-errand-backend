import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Message } from "./entities/message.entity";
import { Errand } from "../errands/entities/errand.entity";
import { CreateMessageDto } from "./dto/create-message.dto";
import { AiService } from "../ai/ai.service";

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private messagesRepository: Repository<Message>,
    @InjectRepository(Errand)
    private errandsRepository: Repository<Errand>,
    private aiService: AiService
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

    return this.messagesRepository.save(message);
  }

  async findByErrand(errandId: string, userId: string): Promise<Message[]> {
    await this.verifyParticipant(errandId, userId);

    return this.messagesRepository.find({
      where: { errandId },
      relations: ["fromUser"],
      order: { createdAt: "ASC" },
    });
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
