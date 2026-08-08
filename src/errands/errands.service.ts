import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Errand, ErrandStatus } from "./entities/errand.entity";
import {
  ErrandConcern,
  ErrandConcernStatus,
} from "./entities/errand-concern.entity";
import { Location, LocationType } from "./entities/location.entity";
import { MediaAttachment } from "./entities/media-attachment.entity";
import {
  ErrandApplication,
  ErrandApplicationStatus,
} from "./entities/errand-application.entity";
import { CreateErrandDto } from "./dto/create-errand.dto";
import { UpdateErrandStatusDto } from "./dto/update-errand-status.dto";
import { FilterErrandsDto } from "./dto/filter-errands.dto";
import { User, UserRole } from "../users/entities/user.entity";
import { PaymentsService } from "../payments/payments.service";
import { SettingsService } from "../settings/settings.service";
import { AiService } from "../ai/ai.service";
import { NotificationsService } from "../notifications/notifications.service";
import { WalletService } from "../wallet/wallet.service";
import { WalletTransactionType } from "../wallet/entities/wallet-transaction.entity";
import { UsersService } from "../users/users.service";
import { isProUser } from "../users/utils/is-pro-user";
import { ReferralsService } from "../referrals/referrals.service";
import { KycService } from "../kyc/kyc.service";
import { KYCStatus } from "../users/entities/kyc.entity";
import { CountryConfigService } from "../settings/country-config.service";

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
    @InjectRepository(ErrandApplication)
    private errandApplicationsRepository: Repository<ErrandApplication>,
    @InjectRepository(ErrandConcern)
    private errandConcernsRepository: Repository<ErrandConcern>,
    private paymentsService: PaymentsService,
    private settingsService: SettingsService,
    private aiService: AiService,
    private notificationsService: NotificationsService,
    private walletService: WalletService,
    private usersService: UsersService,
    private referralsService: ReferralsService,
    private kycService: KycService,
    private countryConfigService: CountryConfigService
  ) {}

  async create(
    createErrandDto: CreateErrandDto,
    userId: string,
    userEmail: string
  ): Promise<
    Errand & { boostFailed?: boolean; boostFailureReason?: string }
  > {
    const { locations, mediaAttachments, isBoosted, ...errandData } =
      createErrandDto;
    const requiredRunners = errandData.requiredRunners ?? 1;

    const requester = await this.usersService.findOne(userId);
    this.assertRequesterEligible(requester);
    const countryConfig = await this.countryConfigService.get(
      requester.country
    );

    // Debit the requester's wallet before creating anything - if they can't
    // afford it, nothing gets created at all. There's no errand row yet at
    // this point, so the transaction is linked to it afterward. The tip (if
    // any) is escrowed in this same lump sum, alongside the price - that way
    // a single reversal of this transaction (cancel, concern-reopen forfeit,
    // deadline-miss forfeit) always refunds price + tip together with no
    // extra bookkeeping.
    const escrowAmount = errandData.price + (errandData.tip ?? 0);
    const paymentTransaction = await this.walletService.debit(
      userId,
      escrowAmount,
      WalletTransactionType.ERRAND_PAYMENT,
      { description: `Payment for errand "${errandData.title}"` }
    );

    // Pro perk: high-value errands, multi-runner errands, and boosted
    // errands all get a priority window where only Pro runners can see/
    // accept them (see findAll/acceptErrand) - boosted errands earn this the
    // same as high-value ones, since the requester is already paying for
    // faster, better-matched attention.
    const priorityThreshold = countryConfig.priorityPriceThreshold;
    const priorityWindowMinutes = await this.settingsService.get<number>(
      "pro_priority_window_minutes",
      30
    );
    const isPriorityErrand =
      errandData.price >= priorityThreshold ||
      requiredRunners > 1 ||
      isBoosted;
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
      boostFailed?: boolean;
      boostFailureReason?: string;
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
      const boostQuote = await this.getBoostPriceQuote(userId);
      const boostPrice = boostQuote.price;

      try {
        // Charged directly from the wallet, synchronously - unlike the
        // errand price itself, an insufficient balance here must NOT undo
        // the errand that was just created: the requester can still post
        // without the boost, so a failure here is caught and surfaced back
        // as a flag rather than thrown.
        await this.walletService.debit(
          userId,
          boostPrice,
          WalletTransactionType.BOOST,
          {
            errandId: savedErrand.id,
            description: `AI-Boost for errand "${savedErrand.title}"`,
          }
        );

        await this.errandsRepository.update(savedErrand.id, {
          isBoosted: true,
          boostedAt: new Date(),
        });
        result.isBoosted = true;
        result.boostedAt = new Date();

        try {
          const boostedTitle = await this.aiService.rewriteBoostTitle(
            result.title,
            result.description
          );
          await this.errandsRepository.update(savedErrand.id, {
            title: boostedTitle,
          });
          result.title = boostedTitle;
        } catch (error: any) {
          this.logger.warn(
            `AI title rewrite failed for boosted errand ${savedErrand.id}: ${error.message}`
          );
        }

        try {
          const pickup = result.locations?.find(
            (l) => l.type === LocationType.PICKUP
          );
          if (pickup?.latitude != null && pickup?.longitude != null) {
            await this.notificationsService.notifyNearbyTopRatedRunners({
              latitude: pickup.latitude,
              longitude: pickup.longitude,
              title: "New boosted errand nearby!",
              body: result.title,
              data: { errandId: savedErrand.id },
            });
          }
        } catch (error: any) {
          this.logger.warn(
            `Boost notification fan-out failed for errand ${savedErrand.id}: ${error.message}`
          );
        }
      } catch (error: any) {
        this.logger.warn(
          `Boost payment failed for errand ${savedErrand.id}, errand still created without it: ${error.message}`
        );
        result.boostFailed = true;
        result.boostFailureReason =
          error instanceof BadRequestException
            ? "insufficient_balance"
            : "unknown";
      }
    }

    return result;
  }

  /**
   * Dynamic/surge boost pricing: a deliberately simple, explainable signal
   * rather than a demand-forecasting model. Once the number of currently
   * OPEN errands hits `CountryConfig.surgeThresholdOpenErrands` (a lot of
   * requesters competing for the same limited runner attention), the boost
   * - which buys faster, better-matched attention - is worth more, so its
   * price is multiplied by `CountryConfig.surgeMultiplier`.
   */
  async getBoostPriceQuote(userId: string): Promise<{
    price: number;
    isSurge: boolean;
    currencySymbol: string;
  }> {
    const requester = await this.usersService.findOne(userId);
    const countryConfig = await this.countryConfigService.get(
      requester.country
    );
    const openErrandsCount = await this.errandsRepository.count({
      where: { status: ErrandStatus.OPEN },
    });
    const isSurge = openErrandsCount >= countryConfig.surgeThresholdOpenErrands;
    const price = isSurge
      ? Number(
          (countryConfig.boostPrice * countryConfig.surgeMultiplier).toFixed(2)
        )
      : countryConfig.boostPrice;

    return { price, isSurge, currencySymbol: countryConfig.currencySymbol };
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

    // Only hide the requester's own errand from the browse feed when they're
    // looking at "open" errands specifically - that's the actionable list
    // for picking up work, and you can't pick up your own. Other status
    // filters are just a general listing, so a requester's own errand stays
    // visible there.
    if (filters.status === ErrandStatus.OPEN) {
      queryBuilder.where("errand.requesterId != :userId", { userId });
    }

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

    await this.attachOpenConcernFlags(data);

    return {
      data: data.map((errand) => this.scrubParticipants(errand)),
      total,
      page,
      limit,
    };
  }

  async findOne(id: string): Promise<Errand> {
    const errand = await this.errandsRepository.findOne({
      where: { id },
      // Deliberately no "messages"/"ratings" here - this is viewable by any
      // authenticated user (e.g. browsing an open errand before applying),
      // not just its participants, and those endpoints already have their
      // own dedicated, properly-scoped routes.
      relations: ["requester", "runner", "locations", "mediaAttachments"],
    });

    if (!errand) {
      throw new NotFoundException("Errand not found");
    }

    await this.attachOpenConcernFlags([errand]);

    return this.scrubParticipants(errand);
  }

  async findMyErrands(userId: string): Promise<Errand[]> {
    const errands = await this.errandsRepository.find({
      where: [{ requesterId: userId }, { runnerId: userId }],
      relations: ["requester", "runner", "locations", "mediaAttachments"],
      order: { createdAt: "DESC" },
    });

    await this.attachOpenConcernFlags(errands);

    return errands.map((errand) => this.scrubParticipants(errand));
  }

  /** One indexed query for the whole batch rather than one per errand. */
  private async attachOpenConcernFlags(errands: Errand[]): Promise<void> {
    if (errands.length === 0) return;

    const activeConcerns = await this.errandConcernsRepository.find({
      where: {
        errandId: In(errands.map((errand) => errand.id)),
        status: In([ErrandConcernStatus.OPEN, ErrandConcernStatus.ACKNOWLEDGED]),
      },
    });
    const errandIdsWithConcern = new Set(
      activeConcerns.map((concern) => concern.errandId)
    );

    for (const errand of errands) {
      errand.hasOpenConcern = errandIdsWithConcern.has(errand.id);
    }
  }

  /**
   * `requester`/`runner` load as full `User` entities (only `passwordHash`
   * is `@Exclude()`'d) - every errand-reading endpoint is reachable by
   * someone other than that user (any browser of the open feed, the other
   * participant, etc), so email/phone/DOB/address/emergency-contact/etc must
   * never leave this service. Swap in the same curated shape `/users/:id/
   * public-profile` already uses.
   */
  private scrubParticipants(errand: Errand): Errand {
    if (errand.requester) {
      errand.requester = this.usersService.toPublicProfile(
        errand.requester
      ) as unknown as Errand["requester"];
    }
    if (errand.runner) {
      errand.runner = this.usersService.toPublicProfile(
        errand.runner
      ) as unknown as Errand["runner"];
    }
    return errand;
  }

  /**
   * Gatekeeps posting - mirrors assertRunnerEligible's ban check but for
   * repeated cancellations (see UsersService.recordPostingFailure, cancel()
   * below). Never touches KYC/phone - those only gate picking up work.
   */
  private assertRequesterEligible(requester: User): void {
    if (requester.permanentlyBannedFromPosting) {
      throw new ForbiddenException(
        "You've been permanently restricted from posting errands due to repeated cancellations. Contact support if you believe this is a mistake."
      );
    }
    if (
      requester.requesterBannedUntil &&
      requester.requesterBannedUntil.getTime() > Date.now()
    ) {
      throw new ForbiddenException(
        `You're temporarily restricted from posting errands until ${requester.requesterBannedUntil.toISOString()} due to repeated cancellations.`
      );
    }
  }

  /**
   * Gatekeeps picking up work (applying/accepting) - never posting. Checks,
   * in order: an active ban (see ConcernsService/UsersService.
   * recordErrandFailure, escalates 72h -> 7 days -> permanent), a phone
   * number on file (compulsory as of the multi-country rollout), and an
   * identity KYC. The KYC bar is tiered by the errand's price: below
   * `CountryConfig.lightKycPriceThreshold`, a submitted-but-not-yet-reviewed
   * (PENDING) KYC is enough - full admin APPROVED status is only required at
   * or above that threshold, and unconditionally before any withdrawal
   * regardless of price (see PaymentsService.initiateWithdrawal). A REJECTED
   * or missing KYC is never enough, at any price.
   */
  private async assertRunnerEligible(
    runner: User,
    errandPrice: number
  ): Promise<void> {
    if (runner.permanentlyBannedFromPicking) {
      throw new ForbiddenException(
        "You've been permanently restricted from picking errands due to repeated non-completion. Contact support if you believe this is a mistake."
      );
    }
    if (runner.runnerBannedUntil && runner.runnerBannedUntil.getTime() > Date.now()) {
      throw new ForbiddenException(
        `You're temporarily restricted from picking errands until ${runner.runnerBannedUntil.toISOString()} due to repeated non-completion.`
      );
    }
    if (!runner.phone) {
      throw new ForbiddenException(
        "Add a phone number to your profile before picking errands."
      );
    }

    const kyc = await this.kycService.getKyc(runner.id).catch(() => null);
    if (!kyc || kyc.status === KYCStatus.REJECTED) {
      throw new ForbiddenException(
        "Verify your NIN before picking errands - submit it from the Identity Verification screen."
      );
    }
    if (kyc.status === KYCStatus.APPROVED) {
      return;
    }

    // PENDING at this point - allowed only under the country's light-KYC threshold.
    const countryConfig = await this.countryConfigService.get(runner.country);
    if (errandPrice >= countryConfig.lightKycPriceThreshold) {
      throw new ForbiddenException(
        `Errands above ${countryConfig.currencySymbol}${countryConfig.lightKycPriceThreshold.toLocaleString()} require your identity verification to be fully approved first - it's still under review.`
      );
    }
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

    const runner = await this.usersService.findOne(userId);
    await this.assertRunnerEligible(runner, errand.price);

    // Defense in depth for the Pro priority-access perk: findAll() already
    // hides these from non-Pro users, but a direct accept call (from a
    // shared link, a stale client cache, etc.) must be blocked too.
    if (errand.priorityUntil && errand.priorityUntil.getTime() > Date.now()) {
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
    const etaMinutes = await this.getDefaultAcceptEtaMinutes();
    const result = await this.errandsRepository
      .createQueryBuilder()
      .update(Errand)
      .set({ status: ErrandStatus.ACCEPTED, runnerId: userId, etaMinutes })
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

  /**
   * A runner "bids" on an open (or already-bidding, i.e. pending) errand.
   * Multiple runners can apply until the requester accepts one - the first
   * application flips the errand from OPEN to PENDING so the requester knows
   * there's someone to review. Only RUNNER/BOTH roles can apply - a pure
   * REQUESTER can't pick up work, same restriction as acceptErrand.
   */
  async applyToErrand(
    errandId: string,
    runnerId: string,
    runnerRole: UserRole,
    message?: string
  ): Promise<ErrandApplication> {
    const errand = await this.findOne(errandId);

    if (errand.requesterId === runnerId) {
      throw new ForbiddenException("You cannot apply to your own errand");
    }

    if (runnerRole === UserRole.REQUESTER) {
      throw new ForbiddenException("Only runners can apply to errands");
    }

    const runner = await this.usersService.findOne(runnerId);
    await this.assertRunnerEligible(runner, errand.price);

    if (
      errand.status !== ErrandStatus.OPEN &&
      errand.status !== ErrandStatus.PENDING
    ) {
      throw new BadRequestException(
        "This errand is no longer accepting applicants"
      );
    }

    if (errand.priorityUntil && errand.priorityUntil.getTime() > Date.now()) {
      if (!isProUser(runner)) {
        throw new ForbiddenException(
          "This errand is in its priority window for Pro users."
        );
      }
    }

    const existing = await this.errandApplicationsRepository.findOne({
      where: { errandId, runnerId },
    });
    if (existing) {
      throw new ConflictException("You have already applied to this errand");
    }

    const application = await this.errandApplicationsRepository.save(
      this.errandApplicationsRepository.create({
        errandId,
        runnerId,
        message,
        status: ErrandApplicationStatus.PENDING,
      })
    );

    if (errand.status === ErrandStatus.OPEN) {
      await this.errandsRepository.update(errandId, {
        status: ErrandStatus.PENDING,
      });
    }

    return application;
  }

  /**
   * The requester sees every applicant (with profile info, for review); an
   * applying runner only ever sees their own application. Safe to call for
   * anyone - it just scopes what comes back, no 403s needed.
   */
  async getApplications(errandId: string, userId: string): Promise<any[]> {
    const errand = await this.findOne(errandId);
    const isRequester = errand.requesterId === userId;

    const applications = await this.errandApplicationsRepository.find({
      where: isRequester ? { errandId } : { errandId, runnerId: userId },
      relations: ["runner"],
      order: { createdAt: "ASC" },
    });

    // Only ever hand back a scrubbed public shape for the runner - the full
    // User entity (email, phone, dob, address, KYC, etc) must never reach
    // whoever's reviewing this list.
    return applications.map((application) => ({
      id: application.id,
      errandId: application.errandId,
      status: application.status,
      message: application.message,
      createdAt: application.createdAt,
      runner: this.usersService.toPublicProfile(application.runner),
    }));
  }

  private async findApplicationOrThrow(
    errandId: string,
    applicationId: string
  ): Promise<ErrandApplication> {
    const application = await this.errandApplicationsRepository.findOne({
      where: { id: applicationId, errandId },
    });
    if (!application) {
      throw new NotFoundException("Application not found");
    }
    return application;
  }

  /**
   * Requester picks one applicant after reviewing their profile/rating. The
   * chosen application (and errand) move to ACCEPTED; every other still-
   * pending application for the same errand is auto-declined.
   */
  async acceptApplication(
    errandId: string,
    applicationId: string,
    requesterId: string
  ): Promise<Errand> {
    const errand = await this.findOne(errandId);

    if (errand.requesterId !== requesterId) {
      throw new ForbiddenException("Only the requester can accept an applicant");
    }

    const application = await this.findApplicationOrThrow(
      errandId,
      applicationId
    );
    if (application.status !== ErrandApplicationStatus.PENDING) {
      throw new BadRequestException("This application has already been decided");
    }

    // Same atomic-conditional-update guard as acceptErrand, in case of a
    // concurrent accept on another application for the same errand.
    const etaMinutes = await this.getDefaultAcceptEtaMinutes();
    const result = await this.errandsRepository
      .createQueryBuilder()
      .update(Errand)
      .set({
        status: ErrandStatus.ACCEPTED,
        runnerId: application.runnerId,
        etaMinutes,
      })
      .where("id = :id AND status IN (:...openStatuses)", {
        id: errandId,
        openStatuses: [ErrandStatus.OPEN, ErrandStatus.PENDING],
      })
      .execute();

    if (result.affected === 0) {
      throw new ConflictException("This errand was just accepted.");
    }

    await this.errandApplicationsRepository.update(applicationId, {
      status: ErrandApplicationStatus.ACCEPTED,
    });
    // Order matters: the just-accepted row is no longer PENDING, so this
    // bulk decline only sweeps up the remaining ones.
    await this.errandApplicationsRepository.update(
      { errandId, status: ErrandApplicationStatus.PENDING },
      { status: ErrandApplicationStatus.DECLINED }
    );

    return this.findOne(errandId);
  }

  /**
   * If that was the last pending application, the errand reverts to OPEN so
   * new runners can apply again.
   */
  async declineApplication(
    errandId: string,
    applicationId: string,
    requesterId: string
  ): Promise<ErrandApplication> {
    const errand = await this.findOne(errandId);

    if (errand.requesterId !== requesterId) {
      throw new ForbiddenException("Only the requester can decline an applicant");
    }

    const application = await this.findApplicationOrThrow(
      errandId,
      applicationId
    );
    if (application.status !== ErrandApplicationStatus.PENDING) {
      throw new BadRequestException("This application has already been decided");
    }

    application.status = ErrandApplicationStatus.DECLINED;
    await this.errandApplicationsRepository.save(application);

    if (errand.status === ErrandStatus.PENDING) {
      const remainingPending = await this.errandApplicationsRepository.count({
        where: { errandId, status: ErrandApplicationStatus.PENDING },
      });
      if (remainingPending === 0) {
        await this.errandsRepository.update(errandId, {
          status: ErrandStatus.OPEN,
        });
      }
    }

    return application;
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
    if (updateStatusDto.status === ErrandStatus.PENDING) {
      throw new BadRequestException(
        "Pending is set automatically when a runner applies"
      );
    }

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

      if (savedErrand.runnerId) {
        try {
          await this.usersService.resetErrandFailures(savedErrand.runnerId);
        } catch (error: any) {
          this.logger.error(
            `Failed to reset errand-failure streak for runner ${savedErrand.runnerId}: ${error.message}`
          );
        }
      }

      try {
        await this.usersService.resetPostingFailures(savedErrand.requesterId);
      } catch (error: any) {
        this.logger.error(
          `Failed to reset posting-failure streak for requester ${savedErrand.requesterId}: ${error.message}`
        );
      }
    }

    return savedErrand;
  }

  /**
   * Only pays out a pending referral once the referred user's lifetime
   * completed-errand count (either side) reaches `referral_qualifying_errand_count`
   * (default: 1, i.e. their first). Admin-tunable via
   * `PATCH /admin/settings/referral_qualifying_errand_count`.
   */
  private async maybeCompleteReferral(userId: string): Promise<void> {
    const completedCount = await this.errandsRepository.count({
      where: [
        { requesterId: userId, status: ErrandStatus.COMPLETED },
        { runnerId: userId, status: ErrandStatus.COMPLETED },
      ],
    });
    const qualifyingCount = await this.settingsService.get(
      "referral_qualifying_errand_count",
      1
    );
    if (completedCount === qualifyingCount) {
      await this.referralsService.completeIfPending(userId);
    }
  }

  /** Admin-tunable via `PATCH /admin/settings/errand_accept_eta_minutes`. */
  private async getDefaultAcceptEtaMinutes(): Promise<number> {
    return this.settingsService.get("errand_accept_eta_minutes", 40);
  }

  /**
   * Only possible before a runner has picked up the errand - once accepted,
   * the requester can no longer cancel through this endpoint. Their recourse
   * at that point is ConcernsService.raise (which reopens the errand rather
   * than refunding it) or, for a timed errand, letting the deadline sweep
   * in ConcernsService.processTimedErrandDeadlines cancel and refund it.
   */
  async cancel(id: string, userId: string): Promise<void> {
    const errand = await this.findOne(id);

    if (errand.requesterId !== userId) {
      throw new ForbiddenException("Only the requester can cancel this errand");
    }

    if (
      errand.status !== ErrandStatus.OPEN &&
      errand.status !== ErrandStatus.PENDING
    ) {
      throw new BadRequestException(
        "This errand has already been picked up by a runner and can no longer be cancelled. Raise a concern instead if the runner isn't able to complete it."
      );
    }

    if (errand.status === ErrandStatus.PENDING) {
      await this.errandApplicationsRepository.update(
        { errandId: id, status: ErrandApplicationStatus.PENDING },
        { status: ErrandApplicationStatus.DECLINED }
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

    try {
      await this.usersService.recordPostingFailure(userId);
    } catch (error: any) {
      this.logger.error(
        `Failed to record posting-failure streak for requester ${userId}: ${error.message}`
      );
    }
  }
}
