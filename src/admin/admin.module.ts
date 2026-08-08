import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AdminAuthService } from "./admin-auth.service";
import { AdminAuthController } from "./admin-auth.controller";
import { AdminSettingsController } from "./admin-settings.controller";
import { AdminKycController } from "./admin-kyc.controller";
import { AdminConcernsController } from "./admin-concerns.controller";
import { AdminUsersController } from "./admin-users.controller";
import { AdminCountryConfigsController } from "./admin-country-configs.controller";
import { AdminJwtStrategy } from "./strategies/admin-jwt.strategy";
import { Admin } from "./entities/admin.entity";
import { UsersModule } from "../users/users.module";
import { OtpModule } from "../otp/otp.module";
import { ConcernsModule } from "../concerns/concerns.module";
import { KycModule } from "../kyc/kyc.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Admin]),
    UsersModule,
    OtpModule,
    ConcernsModule,
    KycModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>("ADMIN_JWT_SECRET"),
        signOptions: {
          expiresIn: configService.get<string>("ADMIN_JWT_EXPIRES_IN", "4h"),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [
    AdminAuthController,
    AdminSettingsController,
    AdminKycController,
    AdminConcernsController,
    AdminUsersController,
    AdminCountryConfigsController,
  ],
  providers: [AdminAuthService, AdminJwtStrategy],
  exports: [AdminAuthService],
})
export class AdminModule {}
