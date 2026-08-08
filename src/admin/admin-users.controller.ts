import { Controller, Patch, Param, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { UsersService } from "../users/users.service";
import { AdminJwtAuthGuard } from "./guards/admin-jwt-auth.guard";

@ApiTags("admin")
@Controller("admin/users")
@UseGuards(AdminJwtAuthGuard)
@ApiBearerAuth()
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

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
