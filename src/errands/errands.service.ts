import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Errand, ErrandStatus } from './entities/errand.entity';
import { Location } from './entities/location.entity';
import { MediaAttachment } from './entities/media-attachment.entity';
import { CreateErrandDto } from './dto/create-errand.dto';
import { UpdateErrandStatusDto } from './dto/update-errand-status.dto';
import { FilterErrandsDto } from './dto/filter-errands.dto';
import { User, UserRole } from '../users/entities/user.entity';

@Injectable()
export class ErrandsService {
  constructor(
    @InjectRepository(Errand)
    private errandsRepository: Repository<Errand>,
    @InjectRepository(Location)
    private locationsRepository: Repository<Location>,
    @InjectRepository(MediaAttachment)
    private mediaAttachmentsRepository: Repository<MediaAttachment>
  ) {}

  async create(createErrandDto: CreateErrandDto, userId: string): Promise<Errand> {
    const { locations, mediaAttachments, ...errandData } = createErrandDto;

    const errand = this.errandsRepository.create({
      ...errandData,
      requesterId: userId,
      status: ErrandStatus.OPEN,
    });

    const savedErrand = await this.errandsRepository.save(errand);

    // Save locations
    if (locations && locations.length > 0) {
      const locationEntities = locations.map((loc) =>
        this.locationsRepository.create({
          ...loc,
          errandId: savedErrand.id,
        })
      );
      await this.locationsRepository.save(locationEntities);
    }

    // Save media attachments
    if (mediaAttachments && mediaAttachments.length > 0) {
      const mediaEntities = mediaAttachments.map((media) =>
        this.mediaAttachmentsRepository.create({
          ...media,
          errandId: savedErrand.id,
        })
      );
      await this.mediaAttachmentsRepository.save(mediaEntities);
    }

    return this.findOne(savedErrand.id);
  }

  async findAll(
    filterDto: FilterErrandsDto,
    userId?: string
  ): Promise<{ data: Errand[]; total: number; page: number; limit: number }> {
    const { page = 1, limit = 20, ...filters } = filterDto;
    const skip = (page - 1) * limit;

    // Build where conditions for query builder

    const queryBuilder = this.errandsRepository
      .createQueryBuilder('errand')
      .leftJoinAndSelect('errand.requester', 'requester')
      .leftJoinAndSelect('errand.runner', 'runner')
      .leftJoinAndSelect('errand.locations', 'locations')
      .leftJoinAndSelect('errand.mediaAttachments', 'mediaAttachments');

    if (filters.category) {
      queryBuilder.andWhere('errand.category = :category', {
        category: filters.category,
      });
    }
    if (filters.status) {
      queryBuilder.andWhere('errand.status = :status', {
        status: filters.status,
      });
    }
    if (filters.urgency) {
      queryBuilder.andWhere('errand.urgency = :urgency', {
        urgency: filters.urgency,
      });
    }

    if (filters.search) {
      queryBuilder.andWhere(
        '(errand.title ILIKE :search OR errand.description ILIKE :search)',
        { search: `%${filters.search}%` }
      );
    }

    if (filters.minPrice !== undefined) {
      queryBuilder.andWhere('errand.price >= :minPrice', {
        minPrice: filters.minPrice,
      });
    }

    if (filters.maxPrice !== undefined) {
      queryBuilder.andWhere('errand.price <= :maxPrice', {
        maxPrice: filters.maxPrice,
      });
    }

    // Sorting
    switch (filters.sortBy) {
      case 'price_high':
        queryBuilder.orderBy('errand.price', 'DESC');
        break;
      case 'price_low':
        queryBuilder.orderBy('errand.price', 'ASC');
        break;
      case 'newest':
      default:
        queryBuilder.orderBy('errand.createdAt', 'DESC');
        break;
    }

    const [data, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
    };
  }

  async findOne(id: string): Promise<Errand> {
    const errand = await this.errandsRepository.findOne({
      where: { id },
      relations: [
        'requester',
        'runner',
        'locations',
        'mediaAttachments',
        'messages',
        'ratings',
      ],
    });

    if (!errand) {
      throw new NotFoundException('Errand not found');
    }

    return errand;
  }

  async findMyErrands(userId: string): Promise<Errand[]> {
    return this.errandsRepository.find({
      where: [{ requesterId: userId }, { runnerId: userId }],
      relations: ['requester', 'runner', 'locations', 'mediaAttachments'],
      order: { createdAt: 'DESC' },
    });
  }

  async acceptErrand(id: string, userId: string, userRole: UserRole): Promise<Errand> {
    const errand = await this.findOne(id);

    if (errand.status !== ErrandStatus.OPEN) {
      throw new BadRequestException('Errand is not available for acceptance');
    }

    if (errand.requesterId === userId) {
      throw new ForbiddenException('You cannot accept your own errand');
    }

    if (userRole === UserRole.REQUESTER) {
      throw new ForbiddenException('Only runners can accept errands');
    }

    errand.status = ErrandStatus.ACCEPTED;
    errand.runnerId = userId;
    errand.etaMinutes = 40; // Default ETA

    return this.errandsRepository.save(errand);
  }

  async updateStatus(
    id: string,
    updateStatusDto: UpdateErrandStatusDto,
    userId: string
  ): Promise<Errand> {
    const errand = await this.findOne(id);

    // Check permissions
    if (errand.requesterId !== userId && errand.runnerId !== userId) {
      throw new ForbiddenException('You do not have permission to update this errand');
    }

    // Validate status transitions
    if (updateStatusDto.status === ErrandStatus.COMPLETED) {
      if (errand.status !== ErrandStatus.IN_PROGRESS) {
        throw new BadRequestException(
          'Can only complete errands that are in progress'
        );
      }
      errand.completedAt = new Date();
    }

    errand.status = updateStatusDto.status;
    return this.errandsRepository.save(errand);
  }

  async cancel(id: string, userId: string): Promise<void> {
    const errand = await this.findOne(id);

    if (errand.requesterId !== userId) {
      throw new ForbiddenException('Only the requester can cancel this errand');
    }

    if (errand.status === ErrandStatus.COMPLETED) {
      throw new BadRequestException('Cannot cancel a completed errand');
    }

    errand.status = ErrandStatus.CANCELLED;
    await this.errandsRepository.save(errand);
  }
}

