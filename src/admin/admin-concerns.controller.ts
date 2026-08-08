import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { ConcernsService } from "../concerns/concerns.service";
import { AdminJwtAuthGuard } from "./guards/admin-jwt-auth.guard";

@ApiTags("admin")
@Controller("admin/concerns")
@UseGuards(AdminJwtAuthGuard)
@ApiBearerAuth()
export class AdminConcernsController {
  constructor(private readonly concernsService: ConcernsService) {}

  @Get()
  @ApiOperation({
    summary:
      "List concerns, optionally filtered to only those needing admin action (acknowledged but unresolved for 10+ minutes)",
  })
  async list(@Query("needsAction") needsAction?: string) {
    return this.concernsService.listForAdmin(needsAction === "true");
  }

  @Post(":id/reopen")
  @ApiOperation({
    summary:
      "Manually reopen the errand tied to this concern (the acknowledged-but-stale case)",
  })
  async reopen(@Param("id") id: string) {
    return this.concernsService.adminReopen(id);
  }

  @Post(":id/dismiss")
  @ApiOperation({
    summary: "Mark this concern resolved without reopening the errand",
  })
  async dismiss(@Param("id") id: string) {
    return this.concernsService.adminDismiss(id);
  }
}
