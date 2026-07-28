import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SubscriptionsService } from "./subscriptions.service";
import { SubscriptionsController } from "./subscriptions.controller";
import { SubscriptionsRenewalCron } from "./subscriptions-renewal.cron";
import { Subscription } from "./entities/subscription.entity";
import { User } from "../users/entities/user.entity";
import { WalletModule } from "../wallet/wallet.module";

@Module({
  imports: [TypeOrmModule.forFeature([Subscription, User]), WalletModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, SubscriptionsRenewalCron],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
