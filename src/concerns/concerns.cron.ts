import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { ConcernsService } from "./concerns.service";

/** Kept separate from ConcernsService so the business logic stays trivially unit-testable without the cron wiring - same pattern as SubscriptionsRenewalCron. */
@Injectable()
export class ConcernsCron {
  private readonly logger = new Logger(ConcernsCron.name);

  constructor(private concernsService: ConcernsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleUnansweredConcerns(): Promise<void> {
    const { reopened } = await this.concernsService.processUnansweredConcerns();
    if (reopened > 0) {
      this.logger.log(`Unanswered-concern sweep: ${reopened} errand(s) reopened`);
    }
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleTimedErrandDeadlines(): Promise<void> {
    const { forfeited } =
      await this.concernsService.processTimedErrandDeadlines();
    if (forfeited > 0) {
      this.logger.log(
        `Timed-errand deadline sweep: ${forfeited} errand(s) forfeited and refunded`
      );
    }
  }
}
