import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  ConflictException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as bcrypt from "bcrypt";
import { User, UserRole } from "./entities/user.entity";
import { KYCStatus } from "./entities/kyc.entity";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UpdateNotificationPreferencesDto } from "./dto/update-notification-preferences.dto";
import { ListUsersQueryDto } from "../admin/dto/list-users-query.dto";
import { BanUserDto } from "../admin/dto/ban-user.dto";
import { RatingsService } from "../ratings/ratings.service";
import { SettingsService } from "../settings/settings.service";
import { generateReferralCodeCandidate } from "./utils/referral-code";

const DEFAULT_BAN_DURATION_LADDER_HOURS = [72, 168];
const DEFAULT_BAN_STRIKE_THRESHOLD = 3;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private ratingsService: RatingsService,
    private settingsService: SettingsService
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    const { email, phone, username, password, referralCode, role, ...rest } =
      createUserDto;

    // Check if user exists
    const existingUser = await this.usersRepository.findOne({
      where: [
        { email },
        ...(phone ? [{ phone }] : []),
        ...(username ? [{ username }] : []),
      ],
    });

    if (existingUser) {
      throw new ConflictException(
        "User with this email, phone, or username already exists"
      );
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // An invalid/unknown referral code is silently ignored - it never fails
    // registration, it just means no referral relationship gets recorded.
    const referrer = referralCode
      ? await this.findByReferralCode(referralCode)
      : null;

    const user = this.usersRepository.create({
      ...rest,
      email,
      phone,
      username,
      passwordHash,
      // Every new account can act as both requester and runner - `role` is
      // still accepted on the DTO for backward compatibility but ignored.
      role: UserRole.BOTH,
      referralCode: await this.generateUniqueReferralCode(),
      referredByUserId: referrer?.id,
    });

    return this.usersRepository.save(user);
  }

  async findOne(id: string): Promise<User> {
    const user = await this.usersRepository.findOne({
      where: { id },
      relations: ["kyc"],
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  /** Admin-only: paginated, searchable, filterable user directory - no equivalent exists for regular users. */
  async listUsers(
    query: ListUsersQueryDto
  ): Promise<{ data: User[]; total: number; page: number; limit: number }> {
    const { page = 1, limit = 20, search, role, banned } = query;
    const skip = (page - 1) * limit;

    const queryBuilder = this.usersRepository
      .createQueryBuilder("user")
      .leftJoinAndSelect("user.kyc", "kyc");

    if (search) {
      queryBuilder.andWhere(
        "(user.name ILIKE :search OR user.email ILIKE :search OR user.phone ILIKE :search OR user.username ILIKE :search)",
        { search: `%${search}%` }
      );
    }

    if (role) {
      queryBuilder.andWhere("user.role = :role", { role });
    }

    if (banned === "picking") {
      queryBuilder.andWhere(
        '(user."permanentlyBannedFromPicking" = true OR user."runnerBannedUntil" > NOW())'
      );
    } else if (banned === "posting") {
      queryBuilder.andWhere(
        '(user."permanentlyBannedFromPosting" = true OR user."requesterBannedUntil" > NOW())'
      );
    }

    const [data, total] = await queryBuilder
      .orderBy("user.createdAt", "DESC")
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }

  async findByWhatsappNumber(whatsappNumber: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { whatsappNumber } });
  }

  /**
   * Links a WhatsApp number to `userId` once WhatsappLinkService has
   * confirmed the in-app link code. Re-linking a different number moves the
   * link (e.g. a new device) - the only rejection case is the number already
   * belonging to a *different* account.
   */
  async linkWhatsapp(userId: string, whatsappNumber: string): Promise<User> {
    const user = await this.findOne(userId);

    const existing = await this.usersRepository.findOne({
      where: { whatsappNumber },
    });
    if (existing && existing.id !== userId) {
      throw new ConflictException(
        "This WhatsApp number is already linked to a different account."
      );
    }

    user.whatsappNumber = whatsappNumber;
    user.whatsappVerifiedAt = new Date();
    return this.usersRepository.save(user);
  }

  /**
   * Safe-to-share subset of a user's profile for viewing by OTHER users
   * (e.g. a requester reviewing an applicant) - deliberately excludes email,
   * phone, and every demographic/identity field (dob, religion, marital
   * status, address, emergency contact, KYC, etc).
   */
  toPublicProfile(user: User) {
    return {
      id: user.id,
      name: user.name,
      avatarUrl: user.avatarUrl,
      ratingAvg: user.ratingAvg,
      verified: user.verified,
      identityVerified: this.isIdentityVerified(user),
      role: user.role,
      memberSince: user.createdAt,
    };
  }

  /**
   * True only once an admin has approved this user's KYC submission (NIN +
   * submitted photo both reviewed - see KycService.approveKyc). Distinct
   * from `User.verified`, which is set purely on email verification
   * (UsersService.setVerified) and never touches identity/KYC at all.
   * Requires `user.kyc` to be loaded (findOne already loads it via
   * `relations: ["kyc"]`).
   */
  isIdentityVerified(user: User): boolean {
    return user.kyc?.status === KYCStatus.APPROVED;
  }

  async getPublicProfile(id: string) {
    const user = await this.findOne(id);
    return this.toPublicProfile(user);
  }

  async findByReferralCode(code: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { referralCode: code } });
  }

  private async generateUniqueReferralCode(): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateReferralCodeCandidate();
      const existing = await this.usersRepository.findOne({
        where: { referralCode: code },
      });
      if (!existing) {
        return code;
      }
    }
    throw new InternalServerErrorException(
      "Failed to generate a unique referral code"
    );
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    if (updateUserDto.phone && updateUserDto.phone !== user.phone) {
      const existing = await this.usersRepository.findOne({
        where: { phone: updateUserDto.phone },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException("Phone number already in use");
      }
    }

    if (updateUserDto.role && updateUserDto.role !== user.role) {
      if (user.roleChangedAt) {
        throw new ConflictException(
          "Your role can only be changed once - contact support if you need it changed again."
        );
      }
      user.roleChangedAt = new Date();
    }

    Object.assign(user, updateUserDto);
    return this.usersRepository.save(user);
  }

  async setVerified(id: string): Promise<void> {
    await this.usersRepository.update(id, { verified: true });
  }

  async setPassword(id: string, passwordHash: string): Promise<void> {
    await this.usersRepository.update(id, { passwordHash });
  }

  async getUserRatings(userId: string) {
    await this.findOne(userId);

    const [ratings, stats] = await Promise.all([
      this.ratingsService.findByUser(userId),
      this.ratingsService.getStats(userId),
    ]);

    return { ratings, stats };
  }

  async getUserStats(userId: string) {
    const user = await this.findOne(userId);

    const [errandsPosted, errandsAccepted] = await Promise.all([
      this.usersRepository
        .createQueryBuilder("user")
        .leftJoin("user.errandsPosted", "errand")
        .where("user.id = :userId", { userId })
        .select("COUNT(errand.id)", "total")
        .getRawOne(),
      this.usersRepository
        .createQueryBuilder("user")
        .leftJoin("user.errandsAccepted", "errand")
        .where("user.id = :userId", { userId })
        .select("COUNT(errand.id)", "total")
        .getRawOne(),
    ]);

    return {
      errandsPosted: parseInt(errandsPosted?.total || "0", 10),
      errandsAccepted: parseInt(errandsAccepted?.total || "0", 10),
      rating: user.ratingAvg,
      role: user.role,
    };
  }

  /**
   * Escalating ban durations (hours) by escalation level - index 0 is the
   * first ban a user ever gets. Once the level runs past this list, the ban
   * is permanent instead of timed. Admin-tunable via
   * `PATCH /admin/settings/ban_duration_ladder_hours` - see
   * `src/settings/settings-catalog.ts`.
   */
  private async getBanDurationLadderMs(): Promise<number[]> {
    const hours = await this.settingsService.get<number[]>(
      "ban_duration_ladder_hours",
      DEFAULT_BAN_DURATION_LADDER_HOURS
    );
    return hours.map((h) => h * 60 * 60 * 1000);
  }

  /** Consecutive failures before the next ban-ladder tier fires - admin-tunable via `ban_strike_threshold`. */
  private async getBanStrikeThreshold(): Promise<number> {
    return this.settingsService.get<number>(
      "ban_strike_threshold",
      DEFAULT_BAN_STRIKE_THRESHOLD
    );
  }

  /**
   * Called when a runner fails to deliver on a picked errand (unanswered
   * concern, self-release, or a missed timed-errand deadline). Three
   * consecutive failures triggers a pick-up ban that escalates each time it
   * happens again: 72 hours, then 7 days, then permanent (requires an admin
   * to lift - see liftPermanentBan). The consecutive-failure streak always
   * resets to 0 once a ban is triggered.
   */
  async recordErrandFailure(userId: string): Promise<User> {
    const user = await this.findOne(userId);
    user.consecutiveErrandFailures += 1;

    const strikeThreshold = await this.getBanStrikeThreshold();
    if (user.consecutiveErrandFailures >= strikeThreshold) {
      user.consecutiveErrandFailures = 0;

      const banDurationsMs = await this.getBanDurationLadderMs();
      const banDurationMs = banDurationsMs[user.banEscalationLevel];
      if (banDurationMs === undefined) {
        user.permanentlyBannedFromPicking = true;
        user.runnerBannedUntil = null;
      } else {
        user.runnerBannedUntil = new Date(Date.now() + banDurationMs);
        user.banEscalationLevel += 1;
      }
    }

    return this.usersRepository.save(user);
  }

  /** Any successful completion clears the consecutive-failure streak. */
  async resetErrandFailures(userId: string): Promise<void> {
    await this.usersRepository.update(userId, {
      consecutiveErrandFailures: 0,
    });
  }

  /**
   * Admin-only escape hatch for a permanent ban - clears the ban itself but
   * deliberately leaves `banEscalationLevel` where it was, so a future
   * 3-strike violation goes straight back to permanent rather than starting
   * the 72h/7-day escalation over.
   */
  async liftPermanentBan(userId: string): Promise<User> {
    const user = await this.findOne(userId);
    user.permanentlyBannedFromPicking = false;
    user.runnerBannedUntil = null;
    return this.usersRepository.save(user);
  }

  /**
   * Admin-only manual pick-up ban, independent of the 3-strike escalation
   * ladder (recordErrandFailure) - for cases the automatic system doesn't
   * catch (reported abuse, fraud, etc). Defaults to a 72h timed ban (the
   * ladder's first tier) when neither `permanent` nor `durationHours` is given.
   */
  async banFromPicking(userId: string, dto: BanUserDto): Promise<User> {
    const user = await this.findOne(userId);
    if (dto.permanent) {
      user.permanentlyBannedFromPicking = true;
      user.runnerBannedUntil = null;
    } else {
      user.permanentlyBannedFromPicking = false;
      user.runnerBannedUntil = new Date(
        Date.now() + (dto.durationHours ?? 72) * 60 * 60 * 1000
      );
    }
    return this.usersRepository.save(user);
  }

  /**
   * Requester-side mirror of recordErrandFailure - called when a requester
   * cancels a posted errand (see ErrandsService.cancel). Same 3-strike,
   * 72h/7-day/permanent escalation, gating posting instead of picking.
   */
  async recordPostingFailure(userId: string): Promise<User> {
    const user = await this.findOne(userId);
    user.consecutivePostingFailures += 1;

    const strikeThreshold = await this.getBanStrikeThreshold();
    if (user.consecutivePostingFailures >= strikeThreshold) {
      user.consecutivePostingFailures = 0;

      const banDurationsMs = await this.getBanDurationLadderMs();
      const banDurationMs = banDurationsMs[user.postingBanEscalationLevel];
      if (banDurationMs === undefined) {
        user.permanentlyBannedFromPosting = true;
        user.requesterBannedUntil = null;
      } else {
        user.requesterBannedUntil = new Date(Date.now() + banDurationMs);
        user.postingBanEscalationLevel += 1;
      }
    }

    return this.usersRepository.save(user);
  }

  /** Any of the requester's own posted errands completing successfully clears the consecutive-cancellation streak. */
  async resetPostingFailures(userId: string): Promise<void> {
    await this.usersRepository.update(userId, {
      consecutivePostingFailures: 0,
    });
  }

  /** Admin-only escape hatch for a permanent posting ban - mirrors liftPermanentBan. */
  async liftPermanentPostingBan(userId: string): Promise<User> {
    const user = await this.findOne(userId);
    user.permanentlyBannedFromPosting = false;
    user.requesterBannedUntil = null;
    return this.usersRepository.save(user);
  }

  /** Admin-only manual posting ban - mirrors banFromPicking. */
  async banFromPosting(userId: string, dto: BanUserDto): Promise<User> {
    const user = await this.findOne(userId);
    if (dto.permanent) {
      user.permanentlyBannedFromPosting = true;
      user.requesterBannedUntil = null;
    } else {
      user.permanentlyBannedFromPosting = false;
      user.requesterBannedUntil = new Date(
        Date.now() + (dto.durationHours ?? 72) * 60 * 60 * 1000
      );
    }
    return this.usersRepository.save(user);
  }

  async updateLocation(
    userId: string,
    latitude: number,
    longitude: number
  ): Promise<void> {
    await this.usersRepository.update(userId, {
      lastLatitude: latitude,
      lastLongitude: longitude,
      lastLocationAt: new Date(),
    });
  }

  async getNotificationPreferences(userId: string) {
    const user = await this.findOne(userId);
    return {
      notifyNewErrandsNearby: user.notifyNewErrandsNearby,
      notifyBoostedErrandAlerts: user.notifyBoostedErrandAlerts,
      notifyNewMessages: user.notifyNewMessages,
    };
  }

  async updateNotificationPreferences(
    userId: string,
    dto: UpdateNotificationPreferencesDto
  ) {
    await this.usersRepository.update(userId, dto);
    return this.getNotificationPreferences(userId);
  }

  /**
   * Haversine distance in raw SQL (no PostGIS) - fine at low-thousands-of-runners
   * scale. The LEAST/GREATEST clamp guards against acos() returning NaN when
   * floating-point rounding pushes the cosine sum fractionally above 1.0 at
   * near-zero distances.
   */
  async findNearbyTopRatedRunners(
    latitude: number,
    longitude: number,
    radiusKm = 10,
    limit = 20
  ): Promise<User[]> {
    const distanceExpr = `
      6371 * acos(
        LEAST(1, GREATEST(-1,
          cos(radians(:lat)) * cos(radians("user"."lastLatitude")) *
          cos(radians("user"."lastLongitude") - radians(:lng)) +
          sin(radians(:lat)) * sin(radians("user"."lastLatitude"))
        ))
      )
    `;

    return this.usersRepository
      .createQueryBuilder("user")
      .addSelect(distanceExpr, "distance_km")
      .where("user.role IN (:...roles)", {
        roles: [UserRole.RUNNER, UserRole.BOTH],
      })
      .andWhere('user."notifyBoostedErrandAlerts" = true')
      .andWhere(
        'user."lastLatitude" IS NOT NULL AND user."lastLongitude" IS NOT NULL'
      )
      .andWhere(`${distanceExpr} <= :radiusKm`)
      .setParameters({ lat: latitude, lng: longitude, radiusKm })
      .orderBy("user.ratingAvg", "DESC")
      .addOrderBy("distance_km", "ASC")
      .limit(limit)
      .getMany();
  }

  /** Same haversine approach as findNearbyTopRatedRunners, filtered to currently-active Pro subscribers instead of rating. */
  async findNearbyProUsers(
    latitude: number,
    longitude: number,
    radiusKm = 10,
    limit = 50
  ): Promise<User[]> {
    const distanceExpr = `
      6371 * acos(
        LEAST(1, GREATEST(-1,
          cos(radians(:lat)) * cos(radians("user"."lastLatitude")) *
          cos(radians("user"."lastLongitude") - radians(:lng)) +
          sin(radians(:lat)) * sin(radians("user"."lastLatitude"))
        ))
      )
    `;

    return this.usersRepository
      .createQueryBuilder("user")
      .addSelect(distanceExpr, "distance_km")
      .where("user.role IN (:...roles)", {
        roles: [UserRole.RUNNER, UserRole.BOTH],
      })
      .andWhere('user."notifyNewErrandsNearby" = true')
      .andWhere(
        'user."lastLatitude" IS NOT NULL AND user."lastLongitude" IS NOT NULL'
      )
      .andWhere(
        'user."proExpiresAt" IS NOT NULL AND user."proExpiresAt" > NOW()'
      )
      .andWhere(`${distanceExpr} <= :radiusKm`)
      .setParameters({ lat: latitude, lng: longitude, radiusKm })
      .orderBy("distance_km", "ASC")
      .limit(limit)
      .getMany();
  }
}
