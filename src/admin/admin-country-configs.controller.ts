import { Controller, Get, Patch, Param, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { CountryConfigService } from "../settings/country-config.service";
import { UpsertCountryConfigDto } from "./dto/upsert-country-config.dto";
import { AdminJwtAuthGuard } from "./guards/admin-jwt-auth.guard";

@ApiTags("admin")
@Controller("admin/country-configs")
@UseGuards(AdminJwtAuthGuard)
@ApiBearerAuth()
export class AdminCountryConfigsController {
  constructor(private readonly countryConfigService: CountryConfigService) {}

  @Get()
  @ApiOperation({ summary: "List every configured country's settings" })
  async list() {
    return this.countryConfigService.list();
  }

  @Patch(":country")
  @ApiOperation({
    summary:
      "Create or update a country's currency/boost-price/fee/payment-gateway configuration",
  })
  async upsert(
    @Param("country") country: string,
    @Body() dto: UpsertCountryConfigDto
  ) {
    return this.countryConfigService.upsert(country, dto);
  }
}
