import { Global, Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SettingsService } from "./settings.service";
import { PlatformSetting } from "./entities/platform-setting.entity";

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([PlatformSetting])],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
