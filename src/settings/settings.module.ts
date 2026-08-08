import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SettingsService } from "./settings.service";
import { SettingsController } from "./settings.controller";
import { PlatformSetting } from "./entities/platform-setting.entity";
import { CountryConfigService } from "./country-config.service";
import { CountryConfig } from "./entities/country-config.entity";
import { UsersModule } from "../users/users.module";

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([PlatformSetting, CountryConfig]),
    UsersModule,
  ],
  controllers: [SettingsController],
  providers: [SettingsService, CountryConfigService],
  exports: [SettingsService, CountryConfigService],
})
export class SettingsModule {}
