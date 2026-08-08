import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConcernsService } from "./concerns.service";
import { ConcernsController } from "./concerns.controller";
import { ConcernsCron } from "./concerns.cron";
import { ErrandConcern } from "../errands/entities/errand-concern.entity";
import { Errand } from "../errands/entities/errand.entity";
import { ErrandApplication } from "../errands/entities/errand-application.entity";
import { UsersModule } from "../users/users.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PaymentsModule } from "../payments/payments.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([ErrandConcern, Errand, ErrandApplication]),
    UsersModule,
    NotificationsModule,
    PaymentsModule,
  ],
  controllers: [ConcernsController],
  providers: [ConcernsService, ConcernsCron],
  exports: [ConcernsService],
})
export class ConcernsModule {}
