import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { OnEvent } from "@nestjs/event-emitter";
import { Errand, ErrandStatus } from "./entities/errand.entity";
import { Location, LocationType } from "./entities/location.entity";
import { MediaAttachment } from "./entities/media-attachment.entity";
import { CreateErrandDto } from "./dto/create-errand.dto";
import { UpdateErrandStatusDto } from "./dto/update-errand-status.dto";
import { FilterErrandsDto } from "./dto/filter-errands.dto";
import { UserRole } from "../users/entities/user.entity";
import { PaymentsService } from "../payments/payments.service";
import { SettingsService } from "../settings/settings.service";
import { AiService } from "../ai/ai.service";
import { NotificationsService } from "../notifications/notifications.service";
import { WalletService } from "../wallet/wallet.service";
import { WalletTransactionType } from "../wallet/entities/wallet-transaction.entity";
import { UsersService } from "../users/users.service";
import { isProUser } from "../users/utils/is-pro-user";
import { ReferralsService } from "../referrals/referrals.service";

@Injectable()
export class ErrandsService {
  private readonly logger = new Logger(ErrandsService.name);

  constructor(
    @InjectRepository(Errand)
    private errandsRepository: Repository<Errand>,
    @InjectRepository(Location)
    private locationsRepository: Repository<Location>,
    @InjectRepository(MediaAttachment)
    private mediaAttachmentsRepository: Repository<MediaAttachment>,
    private paymentsService: PaymentsService,
    private settingsService: SettingsService,
    private aiService: AiService,
    private notificationsService: NotificationsService,
    private walletService: WalletService,
    private usersService: UsersService,
    private referralsService: ReferralsService
  ) {}

  async create(
    createErrandDto: CreateErrandDto,
    userId: string,
    userEmail: string
  ): Promise<
    Errand & { boostPayment?: { authorizationUrl: string; reference: string } }
  > {
    const { locations, mediaAttachments, isBoosted, ...errandData } =
      createErrandDto;
    const requiredRunners = errandData.requiredRunners ?? 1;

    // Debit the requester's wallet before creating anything - if they can't
    // afford it, nothing gets created at all. There's no errand row yet at
    // this point, so the transaction is linked to it afterward.
    const paymentTransaction = await this.walletService.debit(
      userId,
      errandData.price,
      WalletTransactionType.ERRAND_PAYMENT,
      { description: `Payment for errand "${errandData.title}"` }
    );

    // Pro perk: high-value or multi-runner errands get a priority window
    // where only Pro runners can see/accept them (see findAll/acceptErrand).
    const priorityThreshold = await this.settingsService.get<number>(
      "pro_priority_price_threshold_ngn",
      20000
    );
    const priorityWindowMinutes = await this.settingsService.get<number>(
      "pro_priority_window_minutes",
      30
    );
    const isPriorityErrand =
      errandData.price >= priorityThreshold || requiredRunners > 1;
    const priorityUntil = isPriorityErrand
      ? new Date(Date.now() + priorityWindowMinutes * 60 * 1000)
      : undefined;

    let savedErrand: Errand;
    try {
      const errand = this.errandsRepository.create({
        ...errandData,
        requiredRunners,
        priorityUntil,
        requesterId: userId,
        status: ErrandStatus.OPEN,
      });

      savedErrand = await this.errandsRepository.save(errand);

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

      await this.walletService.linkTransactionToErrand(
        paymentTransaction.id,
        savedErrand.id
      );
    } catch (error: any) {
      await this.walletService.reverseTransaction(
        paymentTransaction.id,
        "Errand creation failed after payment"
      );
      throw error;
    }

    const result: Errand & {
      boostPayment?: { authorizationUrl: string; reference: string };
    } = await this.findOne(savedErrand.id);

    // Pro perk: every new errand (not just boosted ones - that's the
    // differentiator) proactively notifies nearby Pro runners.
    try {
      const pickup = result.locations?.find(
        (l) => l.type === LocationType.PICKUP
      );
      if (pickup?.latitude != null && pickup?.longitude != null) {
        await this.notificationsService.notifyNearbyProUsers({
          latitude: pickup.latitude,
          longitude: pickup.longitude,
          title: "New errand nearby!",
          body: result.title,
          data: { errandId: savedErrand.id },
        });
      }
    } catch (error: any) {
      this.logger.warn(
        `Pro-user notification fan-out failed for errand ${savedErrand.id}: ${error.message}`
      );
    }

    if (isBoosted) {
      try {
        const boostPrice = await this.settingsService.get<number>(
          "ai_boost_price_ngn",
          2500
        );
        const boostPayment = await this.paymentsService.initializeBoostPayment(
          savedErrand.id,
          userId,
          userEmail,
          boostPrice
        );
        result.boostPayment = {
          authorizationUrl: boostPayment.authorizationUrl,
          reference: boostPayment.reference,
        };
      } catch (error: any) {
        this.logger.error(
          `Failed to initialize boost payment for errand ${savedErrand.id}: ${error.message}`
        );
      }
    }

    return result;
  }

  /**
   * The AI-Boost's actual effects (title rewrite, isBoosted flag, runner
   * notifications) only activate once Paystack confirms the charge
   * succeeded - not the moment checkout is initialized in `create()` above -
   * so a user can't get the paid perks without completing payment.
   */
  @OnEvent("payment.boost.succeeded")
  async handleBoostPaymentSucceeded({
    errandId,
  }: {
    errandId: string;
  }): Promise<void> {
    await this.errandsRepository.update(errandId, {
      isBoosted: true,
      boostedAt: new Date(),
    });

    try {
      const errand = await this.findOne(errandId);
      const boostedTitle = await this.aiService.rewriteBoostTitle(
        errand.title,
        errand.description
      );
      await this.errandsRepository.update(errandId, { title: boostedTitle });
    } catch (error: any) {
      this.logger.warn(
        `AI title rewrite failed for boosted errand ${errandId}: ${error.message}`
      );
    }

    try {
      const errand = await this.findOne(errandId);
      const pickup = errand.locations?.find(
        (l) => l.type === LocationType.PICKUP
      );
      if (pickup?.latitude != null && pickup?.longitude != null) {
        await this.notificationsService.notifyNearbyTopRatedRunners({
          latitude: pickup.latitude,
          longitude: pickup.longitude,
          title: "New boosted errand nearby!",
          body: errand.title,
          data: { errandId },
        });
      }
    } catch (error: any) {
      this.logger.warn(
        `Boost notification fan-out failed for errand ${errandId}: ${error.message}`
      );
    }
  }

  async findAll(
    filterDto: FilterErrandsDto,
    userId: string
  ): Promise<{ data: Errand[]; total: number; page: number; limit: number }> {
    const { page = 1, limit = 20, ...filters } = filterDto;
    const skip = (page - 1) * limit;

    // Build where conditions for query builder

    const queryBuilder = this.errandsRepository
      .createQueryBuilder("errand")
      .leftJoinAndSelect("errand.requester", "requester")
      .leftJoinAndSelect("errand.runner", "runner")
      .leftJoinAndSelect("errand.locations", "locations")
      .leftJoinAndSelect("errand.mediaAttachments", "mediaAttachments");

    // Pro perk: non-Pro users don't see priority-window errands (high-value
    // or multi-runner) until the window passes.
    const requestingUser = await this.usersService.findOne(userId);
    if (!isProUser(requestingUser)) {
      queryBuilder.andWhere(
        "(errand.priorityUntil IS NULL OR errand.priorityUntil <= :now)",
        { now: new Date() }
      );
    }

    if (filters.category) {
      queryBuilder.andWhere("errand.category = :category", {
        category: filters.category,
      });
    }
    if (filters.status) {
      queryBuilder.andWhere("errand.status = :status", {
        status: filters.status,
      });
    }
    if (filters.urgency) {
      queryBuilder.andWhere("errand.urgency = :urgency", {
        urgency: filters.urgency,
      });
    }

    if (filters.search) {
      queryBuilder.andWhere(
        "(errand.title ILIKE :search OR errand.description ILIKE :search)",
        { search: `%${filters.search}%` }
      );
    }

    if (filters.minPrice !== undefined) {
      queryBuilder.andWhere("errand.price >= :minPrice", {
        minPrice: filters.minPrice,
      });
    }

    if (filters.maxPrice !== undefined) {
      queryBuilder.andWhere("errand.price <= :maxPrice", {
        maxPrice: filters.maxPrice,
      });
    }

    // Sorting
    switch (filters.sortBy) {
      case "price_high":
        queryBuilder.orderBy("errand.price", "DESC");
        break;
      case "price_low":
        queryBuilder.orderBy("errand.price", "ASC");
        break;
      case "newest":
      default:
        queryBuilder.orderBy("errand.createdAt", "DESC");
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
        "requester",
        "runner",
        "locations",
        "mediaAttachments",
        "messages",
        "ratings",
      ],
    });

    if (!errand) {
      throw new NotFoundException("Errand not found");
    }

    return errand;
  }

  async findMyErrands(userId: string): Promise<Errand[]> {
    return this.errandsRepository.find({
      where: [{ requesterId: userId }, { runnerId: userId }],
      relations: ["requester", "runner", "locations", "mediaAttachments"],
      order: { createdAt: "DESC" },
    });
  }

  async acceptErrand(
    id: string,
    userId: string,
    userRole: UserRole
  ): Promise<Errand> {
    const errand = await this.findOne(id);

    if (errand.status !== ErrandStatus.OPEN) {
      throw new BadRequestException("Errand is not available for acceptance");
    }

    if (errand.requesterId === userId) {
      throw new ForbiddenException("You cannot accept your own errand");
    }

    if (userRole === UserRole.REQUESTER) {
      throw new ForbiddenException("Only runners can accept errands");
    }

    // Defense in depth for the Pro priority-access perk: findAll() already
    // hides these from non-Pro users, but a direct accept call (from a
    // shared link, a stale client cache, etc.) must be blocked too.
    if (errand.priorityUntil && errand.priorityUntil.getTime() > Date.now()) {
      const runner = await this.usersService.findOne(userId);
      if (!isProUser(runner)) {
        throw new ForbiddenException(
          "This errand is in its priority window for Pro users."
        );
      }
    }

    // Atomic, conditional on the DB row still being OPEN: if two runners hit
    // this at the same time, only the first UPDATE's WHERE clause matches -
    // the second sees 0 affected rows instead of silently overwriting the
    // first runner's acceptance. This is what actually prevents the race,
    // not a periodic job (which could only detect the collision after the
    // fact, once both requests already believed they'd succeeded).
    const result = await this.errandsRepository
      .createQueryBuilder()
      .update(Errand)
      .set({ status: ErrandStatus.ACCEPTED, runnerId: userId, etaMinutes: 40 })
      .where("id = :id AND status = :openStatus", {
        id,
        openStatus: ErrandStatus.OPEN,
      })
      .execute();

    if (result.affected === 0) {
      throw new ConflictException(
        "This errand was just accepted by someone else."
      );
    }

    return this.findOne(id);
  }

  async updateStatus(
    id: string,
    updateStatusDto: UpdateErrandStatusDto,
    userId: string
  ): Promise<Errand> {
    const errand = await this.findOne(id);

    // Check permissions
    if (errand.requesterId !== userId && errand.runnerId !== userId) {
      throw new ForbiddenException(
        "You do not have permission to update this errand"
      );
    }

    // Validate status transitions
    if (updateStatusDto.status === ErrandStatus.COMPLETED) {
      if (errand.status !== ErrandStatus.IN_PROGRESS) {
        throw new BadRequestException(
          "Can only complete errands that are in progress"
        );
      }
      errand.completedAt = new Date();
    }

    errand.status = updateStatusDto.status;
    const savedErrand = await this.errandsRepository.save(errand);

    if (savedErrand.status === ErrandStatus.COMPLETED) {
      try {
        await this.paymentsService.processPayout(savedErrand.id);
      } catch (error: any) {
        this.logger.error(
          `Failed to process payout for errand ${savedErrand.id}: ${error.message}`
        );
      }

      try {
        await this.maybeCompleteReferral(savedErrand.requesterId);
        if (savedErrand.runnerId) {
          await this.maybeCompleteReferral(savedErrand.runnerId);
        }
      } catch (error: any) {
        this.logger.error(
          `Referral completion check failed for errand ${savedErrand.id}: ${error.message}`
        );
      }
    }

    return savedErrand;
  }

  /** Only pays out a pending referral on the referred user's first-ever completed errand (either side). */
  private async maybeCompleteReferral(userId: string): Promise<void> {
    const completedCount = await this.errandsRepository.count({
      where: [
        { requesterId: userId, status: ErrandStatus.COMPLETED },
        { runnerId: userId, status: ErrandStatus.COMPLETED },
      ],
    });
    if (completedCount === 1) {
      await this.referralsService.completeIfPending(userId);
    }
  }

  /**
   * Only possible before a runner has picked up the errand - once accepted,
   * the requester can no longer cancel through this endpoint (there's no
   * dispute/"runner default" resolution flow in this codebase yet; that
   * needs a separate admin/support path).
   */
  async cancel(id: string, userId: string): Promise<void> {
    const errand = await this.findOne(id);

    if (errand.requesterId !== userId) {
      throw new ForbiddenException("Only the requester can cancel this errand");
    }

    if (errand.status !== ErrandStatus.OPEN) {
      throw new BadRequestException(
        "This errand has already been picked up by a runner and can no longer be cancelled. Contact support if the runner failed to complete it."
      );
    }

    errand.status = ErrandStatus.CANCELLED;
    await this.errandsRepository.save(errand);

    try {
      await this.paymentsService.processRefund(id);
    } catch (error: any) {
      this.logger.error(
        `Failed to process refund for errand ${id}: ${error.message}`
      );
    }
  }
}
