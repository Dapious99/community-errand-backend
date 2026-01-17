import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Rating } from './entities/rating.entity';
import { Errand, ErrandStatus } from '../errands/entities/errand.entity';
import { User } from '../users/entities/user.entity';
import { CreateRatingDto } from './dto/create-rating.dto';

@Injectable()
export class RatingsService {
  constructor(
    @InjectRepository(Rating)
    private ratingsRepository: Repository<Rating>,
    @InjectRepository(Errand)
    private errandsRepository: Repository<Errand>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private dataSource: DataSource
  ) {}

  async create(createRatingDto: CreateRatingDto, fromUserId: string): Promise<Rating> {
    const { errandId, toUserId, ...ratingData } = createRatingDto;

    // Verify errand exists and is completed
    const errand = await this.errandsRepository.findOne({
      where: { id: errandId },
    });

    if (!errand) {
      throw new NotFoundException('Errand not found');
    }

    if (errand.status !== ErrandStatus.COMPLETED) {
      throw new BadRequestException('Can only rate completed errands');
    }

    // Verify user is part of the errand
    if (errand.requesterId !== fromUserId && errand.runnerId !== fromUserId) {
      throw new ForbiddenException('You are not part of this errand');
    }

    // Verify toUserId is the other party
    if (
      toUserId !== errand.requesterId &&
      toUserId !== errand.runnerId
    ) {
      throw new BadRequestException('Invalid user to rate');
    }

    // Prevent self-rating
    if (toUserId === fromUserId) {
      throw new BadRequestException('Cannot rate yourself');
    }

    // Check if rating already exists
    const existingRating = await this.ratingsRepository.findOne({
      where: {
        errandId,
        fromUserId,
      },
    });

    if (existingRating) {
      throw new BadRequestException('You have already rated this errand');
    }

    // Create rating
    const rating = this.ratingsRepository.create({
      ...ratingData,
      errandId,
      fromUserId,
      toUserId,
    });

    const savedRating = await this.ratingsRepository.save(rating);

    // Update user's average rating
    await this.updateUserRatingAvg(toUserId);

    return savedRating;
  }

  async findByUser(userId: string): Promise<Rating[]> {
    return this.ratingsRepository.find({
      where: { toUserId: userId },
      relations: ['fromUser', 'errand'],
      order: { createdAt: 'DESC' },
    });
  }

  async getStats(userId: string) {
    const ratings = await this.ratingsRepository.find({
      where: { toUserId: userId },
    });

    if (ratings.length === 0) {
      return {
        averageRating: 0,
        totalRatings: 0,
        ratingDistribution: {
          1: 0,
          2: 0,
          3: 0,
          4: 0,
          5: 0,
        },
      };
    }

    const totalRatings = ratings.length;
    const sum = ratings.reduce((acc, r) => acc + r.rating, 0);
    const averageRating = sum / totalRatings;

    const distribution = ratings.reduce((acc, r) => {
      acc[r.rating] = (acc[r.rating] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    return {
      averageRating: parseFloat(averageRating.toFixed(2)),
      totalRatings,
      ratingDistribution: {
        1: distribution[1] || 0,
        2: distribution[2] || 0,
        3: distribution[3] || 0,
        4: distribution[4] || 0,
        5: distribution[5] || 0,
      },
    };
  }

  private async updateUserRatingAvg(userId: string): Promise<void> {
    const stats = await this.getStats(userId);
    await this.usersRepository.update(userId, {
      ratingAvg: stats.averageRating,
    });
  }
}



