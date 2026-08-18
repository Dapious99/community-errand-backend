import { Controller, Get, Patch, Param, Body, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { UsersService } from "../users/users.service";
import { AdminJwtAuthGuard } from "./guards/admin-jwt-auth.guard";
import { ListUsersQueryDto } from "./dto/list-users-query.dto";
import { BanUserDto } from "./dto/ban-user.dto";

@ApiTags("admin")
@Controller("admin/users")
@UseGuards(AdminJwtAuthGuard)
@ApiBearerAuth()
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({
    summary: "List users - paginated, searchable by name/email/phone/username, filterable by role or ban status",
  })
  async list(@Query() query: ListUsersQueryDto) {
    return this.usersService.listUsers(query);
  }

  @Get(":userId")
  @ApiOperation({ summary: "Get a single user's full profile (including KYC status)" })
  async getOne(@Param("userId") userId: string) {
    return this.usersService.findOne(userId);
  }

  @Patch(":userId/ban-picking")
  @ApiOperation({
    summary: "Manually ban a user from picking up errands (timed or permanent), independent of the 3-strike ladder",
  })
  async banPicking(@Param("userId") userId: string, @Body() dto: BanUserDto) {
    return this.usersService.banFromPicking(userId, dto);
  }

  @Patch(":userId/ban-posting")
  @ApiOperation({ summary: "Manually ban a user from posting errands (timed or permanent)" })
  async banPosting(@Param("userId") userId: string, @Body() dto: BanUserDto) {
    return this.usersService.banFromPosting(userId, dto);
  }

  @Patch(":userId/lift-ban")
  @ApiOperation({
    summary:
      "Lift a user's permanent picking ban (the 3rd escalation tier - timed bans expire on their own)",
  })
  async liftBan(@Param("userId") userId: string) {
    return this.usersService.liftPermanentBan(userId);
  }

  @Patch(":userId/lift-posting-ban")
  @ApiOperation({
    summary:
      "Lift a user's permanent posting ban (repeated-cancellation escalation, mirrors lift-ban)",
  })
  async liftPostingBan(@Param("userId") userId: string) {
    return this.usersService.liftPermanentPostingBan(userId);
  }
}
