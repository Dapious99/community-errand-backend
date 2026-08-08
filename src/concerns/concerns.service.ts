import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, LessThan, Repository } from "typeorm";
import {
  ErrandConcern,
  ErrandConcernStatus,
  ErrandConcernReopenedBy,
} from "../errands/entities/errand-concern.entity";
import { Errand, ErrandStatus } from "../errands/entities/errand.entity";
import {
  ErrandApplication,
  ErrandApplicationStatus,
} from "../errands/entities/errand-application.entity";
import { UsersService } from "../users/users.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PaymentsService } from "../payments/payments.service";
import { SettingsService } from "../settings/settings.service";

const DEFAULT_CONCERN_ACK_TIMEOUT_MINUTES = 10;

@Injectable()
export class ConcernsService {
  private readonly logger = new Logger(ConcernsService.name);

  constructor(
    @InjectRepository(ErrandConcern)
    private errandConcernsRepository: Repository<ErrandConcern>,
    @InjectRepository(Errand)
    private errandsRepository: Repository<Errand>,
    @InjectRepository(ErrandApplication)
    private errandApplicationsRepository: Repository<ErrandApplication>,
    private usersService: UsersService,
    private notificationsService: NotificationsService,
    private paymentsService: PaymentsService,
    private settingsService: SettingsService
  ) {}

  /** Admin-tunable via `PATCH /admin/settings/concern_ack_timeout_minutes` - see src/settings/settings-catalog.ts. */
  private async getAckTimeoutMinutes(): Promise<number> {
    return this.settingsService.get(
      "concern_ack_timeout_minutes",
      DEFAULT_CONCERN_ACK_TIMEOUT_MINUTES
    );
  }

  /**
   * The requester's replacement for cancelling once a runner has accepted -
   * flags a problem instead. Only one active (open/acknowledged) concern is
   * allowed per errand at a time.
   */
  async raise(
    errandId: string,
    requesterId: string,
    reason: string
  ): Promise<ErrandConcern> {
    const errand = await this.errandsRepository.findOne({
      where: { id: errandId },
    });
    if (!errand) {
      throw new NotFoundException("Errand not found");
    }
    if (errand.requesterId !== requesterId) {
      throw new ForbiddenException(
        "Only the requester can raise a concern on this errand"
      );
    }
    if (
      errand.status !== ErrandStatus.ACCEPTED &&
      errand.status !== ErrandStatus.IN_PROGRESS
    ) {
      throw new BadRequestException(
        "A concern can only be raised once a runner has accepted this errand"
      );
    }

    const existing = await this.errandConcernsRepository.findOne({
      where: {
        errandId,
        status: In([ErrandConcernStatus.OPEN, ErrandConcernStatus.ACKNOWLEDGED]),
      },
    });
    if (existing) {
      throw new ConflictException(
        "There's already an active concern on this errand"
      );
    }

    const concern = await this.errandConcernsRepository.save(
      this.errandConcernsRepository.create({
        errandId,
        raisedByUserId: requesterId,
        reason,
        status: ErrandConcernStatus.OPEN,
      })
    );

    if (errand.runnerId) {
      try {
        const ackTimeoutMinutes = await this.getAckTimeoutMinutes();
        await this.notificationsService.sendToUsers(
          [errand.runnerId],
          "A concern was raised on your errand",
          `"${errand.title}" - reply within ${ackTimeoutMinutes} minutes or it may be reopened for another runner.`,
          { errandId, concernId: concern.id }
        );
      } catch (error: any) {
        this.logger.warn(
          `Concern-raised notification failed for errand ${errandId}: ${error.message}`
        );
      }
    }

    return concern;
  }

  /** Runner confirms they're still working the errand - clears the 10-min timer without changing errand status. */
  async acknowledge(
    concernId: string,
    runnerId: string,
    reply?: string
  ): Promise<ErrandConcern> {
    const concern = await this.findConcernOrThrow(concernId);
    const errand = await this.errandsRepository.findOne({
      where: { id: concern.errandId },
    });
    if (!errand || errand.runnerId !== runnerId) {
      throw new ForbiddenException(
        "Only the assigned runner can respond to this concern"
      );
    }
    if (concern.status !== ErrandConcernStatus.OPEN) {
      throw new BadRequestException(
        "This concern has already been responded to or resolved"
      );
    }

    concern.status = ErrandConcernStatus.ACKNOWLEDGED;
    concern.acknowledgedAt = new Date();
    concern.runnerReply = reply;
    const saved = await this.errandConcernsRepository.save(concern);

    try {
      await this.notificationsService.sendToUsers(
        [concern.raisedByUserId],
        "Runner responded to your concern",
        reply
          ? `"${errand.title}": ${reply}`
          : `The runner acknowledged your concern on "${errand.title}".`,
        { errandId: errand.id, concernId: concern.id }
      );
    } catch (error: any) {
      this.logger.warn(
        `Concern-acknowledged notification failed for errand ${errand.id}: ${error.message}`
      );
    }

    return saved;
  }

  /** Runner explicitly can't complete the errand - same reopen/strike mechanics as the 10-min timeout, but immediate. */
  async release(concernId: string, runnerId: string): Promise<ErrandConcern> {
    const concern = await this.findConcernOrThrow(concernId);
    const errand = await this.errandsRepository.findOne({
      where: { id: concern.errandId },
    });
    if (!errand || errand.runnerId !== runnerId) {
      throw new ForbiddenException(
        "Only the assigned runner can release this errand"
      );
    }
    if (
      concern.status !== ErrandConcernStatus.OPEN &&
      concern.status !== ErrandConcernStatus.ACKNOWLEDGED
    ) {
      throw new BadRequestException("This concern is no longer active");
    }

    await this.reopenErrand(errand, concern, ErrandConcernReopenedBy.RUNNER);
    return this.findConcernOrThrow(concernId);
  }

  /** Scoped like ErrandsService.getApplications - only the errand's requester or assigned runner can see its concerns. */
  async getForErrand(
    errandId: string,
    userId: string
  ): Promise<ErrandConcern[]> {
    const errand = await this.errandsRepository.findOne({
      where: { id: errandId },
    });
    if (!errand) {
      throw new NotFoundException("Errand not found");
    }
    if (errand.requesterId !== userId && errand.runnerId !== userId) {
      throw new ForbiddenException(
        "You do not have access to this errand's concerns"
      );
    }

    return this.errandConcernsRepository.find({
      where: { errandId },
      order: { createdAt: "DESC" },
    });
  }

  /** Acknowledged concerns whose grace period has elapsed with no resolution - these need a human to reopen or dismiss. */
  async listNeedingAdminAction(): Promise<ErrandConcern[]> {
    const ackTimeoutMinutes = await this.getAckTimeoutMinutes();
    const threshold = new Date(Date.now() - ackTimeoutMinutes * 60 * 1000);
    return this.errandConcernsRepository.find({
      where: {
        status: ErrandConcernStatus.ACKNOWLEDGED,
        acknowledgedAt: LessThan(threshold),
      },
      order: { acknowledgedAt: "ASC" },
    });
  }

  async listForAdmin(needsAction?: boolean): Promise<ErrandConcern[]> {
    if (needsAction) {
      return this.listNeedingAdminAction();
    }
    return this.errandConcernsRepository.find({
      order: { createdAt: "DESC" },
    });
  }

  async adminReopen(concernId: string): Promise<ErrandConcern> {
    const concern = await this.findConcernOrThrow(concernId);
    if (
      concern.status !== ErrandConcernStatus.OPEN &&
      concern.status !== ErrandConcernStatus.ACKNOWLEDGED
    ) {
      throw new BadRequestException("This concern is no longer active");
    }
    const errand = await this.errandsRepository.findOne({
      where: { id: concern.errandId },
    });
    if (!errand) {
      throw new NotFoundException("Errand not found");
    }

    await this.reopenErrand(errand, concern, ErrandConcernReopenedBy.ADMIN);
    return this.findConcernOrThrow(concernId);
  }

  async adminDismiss(concernId: string): Promise<ErrandConcern> {
    const concern = await this.findConcernOrThrow(concernId);
    if (
      concern.status !== ErrandConcernStatus.OPEN &&
      concern.status !== ErrandConcernStatus.ACKNOWLEDGED
    ) {
      throw new BadRequestException("This concern is no longer active");
    }

    concern.status = ErrandConcernStatus.RESOLVED;
    concern.resolvedAt = new Date();
    return this.errandConcernsRepository.save(concern);
  }

  /** Cron entry point: OPEN concerns the runner never responded to in time get auto-reopened. */
  async processUnansweredConcerns(): Promise<{ reopened: number }> {
    const ackTimeoutMinutes = await this.getAckTimeoutMinutes();
    const threshold = new Date(Date.now() - ackTimeoutMinutes * 60 * 1000);
    const stale = await this.errandConcernsRepository.find({
      where: { status: ErrandConcernStatus.OPEN, createdAt: LessThan(threshold) },
    });

    let reopened = 0;
    for (const concern of stale) {
      const errand = await this.errandsRepository.findOne({
        where: { id: concern.errandId },
      });
      if (!errand) continue;
      await this.reopenErrand(errand, concern, ErrandConcernReopenedBy.SYSTEM);
      reopened += 1;
    }
    return { reopened };
  }

  /**
   * Cron entry point: any errand with a requester-set timeWindowEnd that's
   * still ACCEPTED/IN_PROGRESS once that deadline passes gets cancelled and
   * fully refunded (price + tip + boost), independent of whether a concern
   * was ever raised.
   */
  async processTimedErrandDeadlines(): Promise<{ forfeited: number }> {
    const now = new Date();
    const overdue = await this.errandsRepository.find({
      where: [
        { status: ErrandStatus.ACCEPTED, timeWindowEnd: LessThan(now) },
        { status: ErrandStatus.IN_PROGRESS, timeWindowEnd: LessThan(now) },
      ],
    });

    let forfeited = 0;
    for (const errand of overdue) {
      // Atomic conditional cancel guards against this racing a concurrent
      // completion or concern-driven reopen for the same errand.
      const result = await this.errandsRepository
        .createQueryBuilder()
        .update(Errand)
        .set({ status: ErrandStatus.CANCELLED })
        .where("id = :id AND status IN (:...activeStatuses)", {
          id: errand.id,
          activeStatuses: [ErrandStatus.ACCEPTED, ErrandStatus.IN_PROGRESS],
        })
        .execute();

      if (result.affected === 0) continue;

      try {
        await this.paymentsService.forfeitErrandFunds(
          errand.id,
          "Timed errand deadline missed"
        );
      } catch (error: any) {
        this.logger.error(
          `Failed to forfeit funds for errand ${errand.id}: ${error.message}`
        );
      }

      if (errand.runnerId) {
        await this.usersService.recordErrandFailure(errand.runnerId);
      }

      try {
        await this.notificationsService.sendToUsers(
          [errand.requesterId],
          "Errand deadline missed - refunded",
          `"${errand.title}" wasn't completed in time. Your payment${
            errand.isBoosted ? " and boost fee" : ""
          } has been refunded to your wallet.`,
          { errandId: errand.id }
        );
        if (errand.runnerId) {
          await this.notificationsService.sendToUsers(
            [errand.runnerId],
            "Errand payout forfeited",
            `"${errand.title}" missed its deadline, so the payout was forfeited.`,
            { errandId: errand.id }
          );
        }
      } catch (error: any) {
        this.logger.warn(
          `Deadline-miss notification failed for errand ${errand.id}: ${error.message}`
        );
      }

      forfeited += 1;
    }

    return { forfeited };
  }

  private async findConcernOrThrow(concernId: string): Promise<ErrandConcern> {
    const concern = await this.errandConcernsRepository.findOne({
      where: { id: concernId },
    });
    if (!concern) {
      throw new NotFoundException("Concern not found");
    }
    return concern;
  }

  /**
   * Shared reopen path for the concern-timeout cron, an admin's manual
   * reopen, and a runner's self-release. Only touches errand status/runner
   * assignment - the escrowed payment deliberately stays put, since it pays
   * out to whoever completes the errand next (unlike the timed-deadline
   * path, which refunds instead).
   */
  private async reopenErrand(
    errand: Errand,
    concern: ErrandConcern,
    reopenedBy: ErrandConcernReopenedBy
  ): Promise<void> {
    const previousRunnerId = errand.runnerId;

    const result = await this.errandsRepository
      .createQueryBuilder()
      .update(Errand)
      .set({ status: ErrandStatus.OPEN, runnerId: null, etaMinutes: null })
      .where("id = :id AND status IN (:...activeStatuses)", {
        id: errand.id,
        activeStatuses: [ErrandStatus.ACCEPTED, ErrandStatus.IN_PROGRESS],
      })
      .execute();

    if (result.affected === 0) {
      // The errand already moved on (completed/cancelled/reopened elsewhere)
      // by the time this ran - just resolve the concern, no double strike.
      concern.status = ErrandConcernStatus.RESOLVED;
      concern.resolvedAt = new Date();
      await this.errandConcernsRepository.save(concern);
      return;
    }

    await this.errandApplicationsRepository.update(
      { errandId: errand.id, status: ErrandApplicationStatus.PENDING },
      { status: ErrandApplicationStatus.DECLINED }
    );
    await this.errandApplicationsRepository.update(
      { errandId: errand.id, status: ErrandApplicationStatus.ACCEPTED },
      { status: ErrandApplicationStatus.DECLINED }
    );

    concern.status = ErrandConcernStatus.REOPENED;
    concern.reopenedAt = new Date();
    concern.reopenedBy = reopenedBy;
    await this.errandConcernsRepository.save(concern);

    if (previousRunnerId) {
      await this.usersService.recordErrandFailure(previousRunnerId);
    }

    try {
      await this.notificationsService.sendToUsers(
        [concern.raisedByUserId],
        "Your errand is open again",
        `"${errand.title}" is back up for another runner to pick up.`,
        { errandId: errand.id }
      );
      if (previousRunnerId) {
        await this.notificationsService.sendToUsers(
          [previousRunnerId],
          "You've been removed from an errand",
          `"${errand.title}" was reopened after an unresolved concern.`,
          { errandId: errand.id }
        );
      }
    } catch (error: any) {
      this.logger.warn(
        `Reopen notification failed for errand ${errand.id}: ${error.message}`
      );
    }
  }
}
