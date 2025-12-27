import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('messages')
@Controller('messages')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get(':errandId')
  @ApiOperation({ summary: 'Get messages for an errand' })
  async findByErrand(@Param('errandId') errandId: string, @Request() req) {
    return this.messagesService.findByErrand(errandId, req.user.id);
  }

  @Post(':errandId')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send a message' })
  async create(
    @Param('errandId') errandId: string,
    @Body() createMessageDto: CreateMessageDto,
    @Request() req
  ) {
    return this.messagesService.create(errandId, createMessageDto, req.user.id);
  }
}

