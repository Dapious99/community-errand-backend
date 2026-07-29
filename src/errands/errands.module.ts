import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ErrandsService } from "./errands.service";
import { ErrandsController } from "./errands.controller";
import { Errand } from "./entities/errand.entity";
import { Location } from "./entities/location.entity";
import { MediaAttachment } from "./entities/media-attachment.entity";
import { ErrandApplication } from "./entities/errand-application.entity";
import { PaymentsModule } from "../payments/payments.module";
import { AiModule } from "../ai/ai.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { WalletModule } from "../wallet/wallet.module";
import { UsersModule } from "../users/users.module";
import { ReferralsModule } from "../referrals/referrals.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Errand, Location, MediaAttachment, ErrandApplication]),
    PaymentsModule,
    AiModule,
    NotificationsModule,
    WalletModule,
    UsersModule,
    ReferralsModule,
  ],
  controllers: [ErrandsController],
  providers: [ErrandsService],
  exports: [ErrandsService],
})
export class ErrandsModule {}
