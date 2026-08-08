import { Controller, Get, Request, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { CountryConfigService } from "./country-config.service";
import { UsersService } from "../users/users.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

// Keep this endpoint to a small explicit whitelist - the backing store also
// holds admin-only settings that must never be exposed to end users.
const AI_BOOST_PRICE_DEFAULT_NGN = 2500;

@ApiTags("settings")
@Controller("settings")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SettingsController {
  constructor(
    private readonly countryConfigService: CountryConfigService,
    private readonly usersService: UsersService
  ) {}

  @Get("public")
  @ApiOperation({ summary: "Get platform settings safe to expose to end users" })
  async getPublicSettings(@Request() req) {
    const user = await this.usersService.findOne(req.user.id);
    const countryConfig = await this.countryConfigService.get(user.country);

    // aiBoostPriceNgn is kept only for older clients that haven't switched
    // to reading countryConfig.boostPrice yet - the country config is now
    // the source of truth for boost pricing, not the old global setting.
    return {
      aiBoostPriceNgn: countryConfig.boostPrice ?? AI_BOOST_PRICE_DEFAULT_NGN,
      countryConfig,
    };
  }
}
