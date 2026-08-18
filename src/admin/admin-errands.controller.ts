import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { ErrandsService } from "../errands/errands.service";
import { MessagesService } from "../messages/messages.service";
import { FilterErrandsDto } from "../errands/dto/filter-errands.dto";
import { AdminJwtAuthGuard } from "./guards/admin-jwt-auth.guard";

@ApiTags("admin")
@Controller("admin/errands")
@UseGuards(AdminJwtAuthGuard)
@ApiBearerAuth()
export class AdminErrandsController {
  constructor(
    private readonly errandsService: ErrandsService,
    private readonly messagesService: MessagesService
  ) {}

  @Get()
  @ApiOperation({
    summary:
      "List every errand platform-wide (not scoped to a requester/runner), with full requester/runner contact details for moderation",
  })
  async list(@Query() filterDto: FilterErrandsDto) {
    return this.errandsService.findAllForAdmin(filterDto);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get one errand's full detail, including requester/runner contact info" })
  async getOne(@Param("id") id: string) {
    return this.errandsService.findOneForAdmin(id);
  }

  @Get(":id/messages")
  @ApiOperation({ summary: "Read an errand's full message history for moderation/support - bypasses the participant check" })
  async getMessages(@Param("id") id: string) {
    return this.messagesService.findByErrandForAdmin(id);
  }
}
