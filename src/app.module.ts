import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { getDatabaseConfig } from "./config/database.config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthModule } from "./auth/auth.module";
import { UsersModule } from "./users/users.module";
import { ErrandsModule } from "./errands/errands.module";
import { MessagesModule } from "./messages/messages.module";
import { RatingsModule } from "./ratings/ratings.module";
import { PaymentsModule } from "./payments/payments.module";
import { UploadsModule } from "./uploads/uploads.module";
import { RedisModule } from "./common/redis/redis.module";
import { SettingsModule } from "./settings/settings.module";
import { AdminModule } from "./admin/admin.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { AiModule } from "./ai/ai.module";
import { WalletModule } from "./wallet/wallet.module";
import { BillsModule } from "./bills/bills.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ".env",
    }),
    EventEmitterModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: getDatabaseConfig,
      inject: [ConfigService],
    }),
    RedisModule,
    SettingsModule,
    AuthModule,
    UsersModule,
    ErrandsModule,
    MessagesModule,
    RatingsModule,
    PaymentsModule,
    UploadsModule,
    AdminModule,
    NotificationsModule,
    AiModule,
    WalletModule,
    BillsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
