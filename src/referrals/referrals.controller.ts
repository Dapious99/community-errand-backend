import { Controller, Get, Request, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ReferralsService } from "./referrals.service";

@ApiTags("referrals")
@Controller("referrals")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ReferralsController {
  constructor(private readonly referralsService: ReferralsService) {}

  @Get("me")
  @ApiOperation({ summary: "Get your referral code and referral stats" })
  async getStats(@Request() req) {
    return this.referralsService.getStats(req.user.id);
  }
}
