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
import { KYC, KYCStatus } from "./entities/kyc.entity";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { CreateKycDto } from "./dto/create-kyc.dto";
import { RatingsService } from "../ratings/ratings.service";
import { OtpService } from "../otp/otp.service";
import { OtpPurpose } from "../otp/otp-purpose.enum";
import { generateReferralCodeCandidate } from "./utils/referral-code";
import { DojahService } from "./services/dojah.service";

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @InjectRepository(KYC)
    private kycRepository: Repository<KYC>,
    private ratingsService: RatingsService,
    private otpService: OtpService,
    private dojahService: DojahService
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
      role: user.role,
      memberSince: user.createdAt,
    };
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

  async submitKyc(
    userId: string,
    createKycDto: CreateKycDto
  ): Promise<KYC | { requiresConfirmation: true; message: string }> {
    const user = await this.findOne(userId);
    const kyc = await this.kycRepository.findOne({ where: { userId } });

    const isBankChange =
      !!kyc &&
      kyc.status === KYCStatus.APPROVED &&
      ((createKycDto.bankAccountNumber !== undefined &&
        createKycDto.bankAccountNumber !== kyc.bankAccountNumber) ||
        (createKycDto.bankName !== undefined &&
          createKycDto.bankName !== kyc.bankName));

    if (isBankChange) {
      await this.otpService.request(
        OtpPurpose.BANK_CHANGE,
        userId,
        user.email,
        {
          pendingChanges: createKycDto,
        }
      );

      return {
        requiresConfirmation: true,
        message:
          "A confirmation code has been emailed to you to approve this bank detail change.",
      };
    }

    // Only re-verify with Dojah when the nin/bvn value is actually new -
    // re-submitting unrelated fields (e.g. re-uploading an ID photo)
    // shouldn't refire a paid lookup for a value that was already checked.
    const ninChanged = !kyc || kyc.nin !== createKycDto.nin;
    const bvnChanged = !!createKycDto.bvn && (!kyc || kyc.bvn !== createKycDto.bvn);

    const verification: Partial<KYC> = {};
    if (ninChanged) {
      const result = await this.dojahService.verifyNin(createKycDto.nin);
      verification.ninVerificationData = result.data ?? { error: result.error };
      if (result.verified) verification.ninVerifiedAt = new Date();
    }
    if (bvnChanged && createKycDto.bvn) {
      const result = await this.dojahService.verifyBvn(createKycDto.bvn);
      verification.bvnVerificationData = result.data ?? { error: result.error };
      if (result.verified) verification.bvnVerifiedAt = new Date();
    }

    if (kyc) {
      Object.assign(kyc, createKycDto, verification, {
        // A non-bank edit to an already-approved KYC (e.g. re-uploading the ID
        // card) doesn't need to go back through review.
        status:
          kyc.status === KYCStatus.APPROVED ? kyc.status : KYCStatus.PENDING,
      });
      return this.kycRepository.save(kyc);
    }

    const newKyc = this.kycRepository.create({
      ...verification,
      ...createKycDto,
      userId,
      status: KYCStatus.PENDING,
    });
    return this.kycRepository.save(newKyc);
  }

  /**
   * Requires a pending bank-change OTP to actually exist - unlike
   * `resendVerification`/`forgotPassword`, this is behind JWT auth already
   * (no email-enumeration concern), so it's fine to surface a direct error
   * rather than a generic response when there's nothing pending.
   */
  async resendBankChangeCode(userId: string): Promise<{ message: string }> {
    const user = await this.findOne(userId);
    await this.otpService.resend(OtpPurpose.BANK_CHANGE, userId, user.email);
    return { message: "A new confirmation code has been emailed to you." };
  }

  async confirmBankChange(userId: string, code: string): Promise<KYC> {
    const metadata = await this.otpService.verify(
      OtpPurpose.BANK_CHANGE,
      userId,
      code
    );
    const kyc = await this.getKyc(userId);

    Object.assign(kyc, metadata?.pendingChanges, { status: KYCStatus.PENDING });
    return this.kycRepository.save(kyc);
  }

  async getKyc(userId: string): Promise<KYC> {
    const kyc = await this.kycRepository.findOne({ where: { userId } });

    if (!kyc) {
      throw new NotFoundException("KYC submission not found");
    }

    return kyc;
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

  async listKycByStatus(status?: KYCStatus): Promise<KYC[]> {
    return this.kycRepository.find({
      where: status ? { status } : {},
      relations: ["user"],
      order: { createdAt: "ASC" },
    });
  }

  async approveKyc(userId: string): Promise<KYC> {
    const kyc = await this.getKyc(userId);
    kyc.status = KYCStatus.APPROVED;
    kyc.verifiedAt = new Date();
    kyc.rejectionReason = undefined;
    return this.kycRepository.save(kyc);
  }

  async rejectKyc(userId: string, reason: string): Promise<KYC> {
    const kyc = await this.getKyc(userId);
    kyc.status = KYCStatus.REJECTED;
    kyc.rejectionReason = reason;
    return this.kycRepository.save(kyc);
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
