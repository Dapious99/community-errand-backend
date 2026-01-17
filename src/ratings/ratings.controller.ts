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
import { RatingsService } from './ratings.service';
import { CreateRatingDto } from './dto/create-rating.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('ratings')
@Controller('ratings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a rating' })
  async create(@Body() createRatingDto: CreateRatingDto, @Request() req) {
    return this.ratingsService.create(createRatingDto, req.user.id);
  }

  @Get('stats/:userId')
  @ApiOperation({ summary: 'Get rating statistics for a user' })
  async getStats(@Param('userId') userId: string) {
    return this.ratingsService.getStats(userId);
  }
}



