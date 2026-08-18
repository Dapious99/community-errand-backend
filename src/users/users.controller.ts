import {
  Controller,
  Get,
  Patch,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { UsersService } from "./users.service";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UpdateLocationDto } from "./dto/update-location.dto";
import { UpdateNotificationPreferencesDto } from "./dto/update-notification-preferences.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { WhatsappLinkService } from "../whatsapp/whatsapp-link.service";

@ApiTags("users")
@Controller("users")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly whatsappLinkService: WhatsappLinkService
  ) {}

  @Get("profile")
  @ApiOperation({ summary: "Get current user profile" })
  async getProfile(@Request() req) {
    const user = await this.usersService.findOne(req.user.id);
    return Object.assign(user, {
      identityVerified: this.usersService.isIdentityVerified(user),
    });
  }

  @Patch("profile")
  @ApiOperation({ summary: "Update user profile" })
  async updateProfile(@Request() req, @Body() updateUserDto: UpdateUserDto) {
    const user = await this.usersService.update(req.user.id, updateUserDto);
    return Object.assign(user, {
      identityVerified: this.usersService.isIdentityVerified(user),
    });
  }

  @Get("stats")
  @ApiOperation({ summary: "Get user statistics" })
  async getStats(@Request() req) {
    return this.usersService.getUserStats(req.user.id);
  }

  @Patch("location")
  @ApiOperation({
    summary: "Report the current user's last known location (runners)",
  })
  async updateLocation(
    @Request() req,
    @Body() updateLocationDto: UpdateLocationDto
  ) {
    await this.usersService.updateLocation(
      req.user.id,
      updateLocationDto.latitude,
      updateLocationDto.longitude
    );
    return { message: "Location updated" };
  }

  @Get("notification-preferences")
  @ApiOperation({ summary: "Get the current user's push notification preferences" })
  async getNotificationPreferences(@Request() req) {
    return this.usersService.getNotificationPreferences(req.user.id);
  }

  @Patch("notification-preferences")
  @ApiOperation({ summary: "Update the current user's push notification preferences" })
  async updateNotificationPreferences(
    @Request() req,
    @Body() dto: UpdateNotificationPreferencesDto
  ) {
    return this.usersService.updateNotificationPreferences(req.user.id, dto);
  }

  @Post("whatsapp/link-code")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      "Generate a one-time code (valid 10 minutes) to link your WhatsApp number - send it as a message to the app's WhatsApp number to finish linking",
  })
  async createWhatsappLinkCode(@Request() req) {
    const code = await this.whatsappLinkService.generateCode(req.user.id);
    return { code, expiresInSeconds: 600 };
  }

  @Get(":id/ratings")
  @ApiOperation({ summary: "Get user ratings" })
  async getUserRatings(@Param("id") id: string) {
    return this.usersService.getUserRatings(id);
  }

  @Get(":id/public-profile")
  @ApiOperation({
    summary:
      "Get another user's public profile (name, avatar, rating) - used e.g. when a requester reviews an applicant",
  })
  async getPublicProfile(@Param("id") id: string) {
    return this.usersService.getPublicProfile(id);
  }
}
