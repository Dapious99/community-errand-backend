import { Controller, Get, Patch, Param, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { SettingsService } from "../settings/settings.service";
import { SETTINGS_CATALOG } from "../settings/settings-catalog";
import { UpdateSettingDto } from "./dto/update-setting.dto";
import { AdminJwtAuthGuard } from "./guards/admin-jwt-auth.guard";

@ApiTags("admin")
@Controller("admin/settings")
@UseGuards(AdminJwtAuthGuard)
@ApiBearerAuth()
export class AdminSettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: "List all platform settings" })
  async list() {
    return this.settingsService.list();
  }

  /**
   * Every settings key the codebase actually reads, with its description,
   * default, and live current value in one call - so tuning a fee/tier/ban
   * duration/etc. never requires reading source to discover the key name.
   * `PATCH /admin/settings/:key` (below) is still how you change one.
   */
  @Get("catalog")
  @ApiOperation({ summary: "List every admin-tunable setting with its description, default, and current value" })
  async catalog() {
    return Promise.all(
      SETTINGS_CATALOG.map(async (entry) => ({
        ...entry,
        currentValue: await this.settingsService.get(
          entry.key,
          entry.defaultValue
        ),
      }))
    );
  }

  @Patch(":key")
  @ApiOperation({ summary: "Create or update a platform setting" })
  async update(
    @Param("key") key: string,
    @Body() updateSettingDto: UpdateSettingDto
  ) {
    return this.settingsService.set(
      key,
      updateSettingDto.value,
      updateSettingDto.description
    );
  }
}
