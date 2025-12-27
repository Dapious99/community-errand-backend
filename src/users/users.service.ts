import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const { email, phone, password, ...rest } = createUserDto;

    // Check if user exists
    const existingUser = await this.usersRepository.findOne({
      where: [{ email }, ...(phone ? [{ phone }] : [])],
    });

    if (existingUser) {
      throw new ConflictException('User with this email or phone already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    const user = this.usersRepository.create({
      ...rest,
      email,
      phone,
      passwordHash,
      role: rest.role || UserRole.REQUESTER,
    });

    return this.usersRepository.save(user);
  }

  async findOne(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: ['kyc'],
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    Object.assign(user, updateUserDto);
    return this.usersRepository.save(user);
  }

  async updateRatingAvg(userId: string): Promise<void> {
    const user = await this.findOne(userId);
    // This will be called from ratings service
    // For now, we'll calculate it when needed
  }

  async getUserStats(userId: string) {
    const user = await this.findOne(userId);

    const [errandsPosted, errandsAccepted] = await Promise.all([
      this.usersRepository
        .createQueryBuilder('user')
        .leftJoin('user.errandsPosted', 'errand')
        .where('user.id = :userId', { userId })
        .select('COUNT(errand.id)', 'total')
        .getRawOne(),
      this.usersRepository
        .createQueryBuilder('user')
        .leftJoin('user.errandsAccepted', 'errand')
        .where('user.id = :userId', { userId })
        .select('COUNT(errand.id)', 'total')
        .getRawOne(),
    ]);

    return {
      errandsPosted: parseInt(errandsPosted?.total || '0', 10),
      errandsAccepted: parseInt(errandsAccepted?.total || '0', 10),
      rating: user.ratingAvg,
      role: user.role,
    };
  }
}

