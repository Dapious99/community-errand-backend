import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { SubscriptionsService } from "./subscriptions.service";

/** Kept separate from SubscriptionsService so the business logic (processRenewals) stays trivially unit-testable without the cron wiring. */
@Injectable()
export class SubscriptionsRenewalCron {
  private readonly logger = new Logger(SubscriptionsRenewalCron.name);

  constructor(private subscriptionsService: SubscriptionsService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async handleRenewals(): Promise<void> {
    const { renewed, lapsed } =
      await this.subscriptionsService.processRenewals();
    if (renewed > 0 || lapsed > 0) {
      this.logger.log(
        `Pro renewal sweep: ${renewed} renewed, ${lapsed} lapsed`
      );
    }
  }
}
