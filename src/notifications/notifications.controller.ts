import { Controller, Post, Body, UseGuards, Request } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { NotificationsService } from "./notifications.service";
import { RegisterTokenDto } from "./dto/register-token.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

@ApiTags("notifications")
@Controller("notifications")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post("register-token")
  @ApiOperation({ summary: "Register or update this device's Expo push token" })
  async registerToken(
    @Request() req,
    @Body() registerTokenDto: RegisterTokenDto
  ) {
    await this.notificationsService.registerToken(
      req.user.id,
      registerTokenDto.deviceId,
      registerTokenDto.expoPushToken
    );
    return { message: "Push token registered" };
  }
}
