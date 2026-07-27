import { Controller, Get, Patch, Param, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { SettingsService } from "../settings/settings.service";
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
