import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Message } from './entities/message.entity';
import { Errand } from '../errands/entities/errand.entity';
import { CreateMessageDto } from './dto/create-message.dto';

@Injectable()
export class MessagesService {
  constructor(
    @InjectRepository(Message)
    private messagesRepository: Repository<Message>,
    @InjectRepository(Errand)
    private errandsRepository: Repository<Errand>
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
      throw new NotFoundException('Errand not found');
    }

    if (errand.requesterId !== userId && errand.runnerId !== userId) {
      throw new ForbiddenException('You are not part of this errand');
    }

    const message = this.messagesRepository.create({
      errandId,
      fromUserId: userId,
      text: createMessageDto.text,
    });

    return this.messagesRepository.save(message);
  }

  async findByErrand(errandId: string, userId: string): Promise<Message[]> {
    // Verify user is part of errand
    const errand = await this.errandsRepository.findOne({
      where: { id: errandId },
    });

    if (!errand) {
      throw new NotFoundException('Errand not found');
    }

    if (errand.requesterId !== userId && errand.runnerId !== userId) {
      throw new ForbiddenException('You are not part of this errand');
    }

    return this.messagesRepository.find({
      where: { errandId },
      relations: ['fromUser'],
      order: { createdAt: 'ASC' },
    });
  }
}

