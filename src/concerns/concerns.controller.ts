import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { ConcernsService } from "./concerns.service";
import { RaiseConcernDto } from "./dto/raise-concern.dto";
import { AcknowledgeConcernDto } from "./dto/acknowledge-concern.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

@ApiTags("concerns")
@Controller()
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ConcernsController {
  constructor(private readonly concernsService: ConcernsService) {}

  @Post("errands/:errandId/concerns")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      "Raise a concern on a picked errand (the requester's replacement for cancelling post-acceptance)",
  })
  async raise(
    @Param("errandId") errandId: string,
    @Body() dto: RaiseConcernDto,
    @Request() req
  ) {
    return this.concernsService.raise(errandId, req.user.id, dto.reason);
  }

  @Get("errands/:errandId/concerns")
  @ApiOperation({ summary: "List concerns raised on an errand" })
  async getForErrand(@Param("errandId") errandId: string, @Request() req) {
    return this.concernsService.getForErrand(errandId, req.user.id);
  }

  @Post("concerns/:id/acknowledge")
  @ApiOperation({
    summary:
      "Runner confirms they're still working the errand - clears the 10-minute response timer",
  })
  async acknowledge(
    @Param("id") id: string,
    @Body() dto: AcknowledgeConcernDto,
    @Request() req
  ) {
    return this.concernsService.acknowledge(id, req.user.id, dto.reply);
  }

  @Post("concerns/:id/release")
  @ApiOperation({
    summary:
      "Runner explicitly can't complete the errand - reopens it immediately for another runner",
  })
  async release(@Param("id") id: string, @Request() req) {
    return this.concernsService.release(id, req.user.id);
  }
}
