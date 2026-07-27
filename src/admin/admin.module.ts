import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AdminAuthService } from "./admin-auth.service";
import { AdminAuthController } from "./admin-auth.controller";
import { AdminSettingsController } from "./admin-settings.controller";
import { AdminKycController } from "./admin-kyc.controller";
import { AdminJwtStrategy } from "./strategies/admin-jwt.strategy";
import { Admin } from "./entities/admin.entity";
import { UsersModule } from "../users/users.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Admin]),
    UsersModule,
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
  ],
  providers: [AdminAuthService, AdminJwtStrategy],
  exports: [AdminAuthService],
})
export class AdminModule {}
