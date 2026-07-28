import {
  Body,
  Controller,
  Get,
  Post,
  Request,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { SubscriptionsService } from "./subscriptions.service";
import { SubscribeDto } from "./dto/subscribe.dto";

@ApiTags("subscriptions")
@Controller("subscriptions")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Post("subscribe")
  @ApiOperation({
    summary: "Subscribe to (or renew/extend) Pro, debited from your wallet",
  })
  async subscribe(@Body() dto: SubscribeDto, @Request() req) {
    return this.subscriptionsService.subscribe(
      req.user.id,
      dto.plan,
      dto.autoRenew ?? false
    );
  }

  @Post("cancel-auto-renew")
  @ApiOperation({
    summary: "Stop auto-renewing - Pro stays active until it expires",
  })
  async cancelAutoRenew(@Request() req) {
    await this.subscriptionsService.cancelAutoRenew(req.user.id);
    return { message: "Auto-renew turned off" };
  }

  @Get("me")
  @ApiOperation({ summary: "Get current Pro status" })
  async getStatus(@Request() req) {
    return this.subscriptionsService.getStatus(req.user.id);
  }
}
