import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { ErrandsService } from "./errands.service";
import { CreateErrandDto } from "./dto/create-errand.dto";
import { UpdateErrandStatusDto } from "./dto/update-errand-status.dto";
import { FilterErrandsDto } from "./dto/filter-errands.dto";
import { CreateApplicationDto } from "./dto/create-application.dto";
import { MagicPostDto } from "./dto/magic-post.dto";
import { PriceEstimateDto } from "./dto/price-estimate.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AiService } from "../ai/ai.service";

@ApiTags("errands")
@Controller("errands")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ErrandsController {
  constructor(
    private readonly errandsService: ErrandsService,
    private readonly aiService: AiService
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Create a new errand" })
  async create(@Body() createErrandDto: CreateErrandDto, @Request() req) {
    return this.errandsService.create(
      createErrandDto,
      req.user.id,
      req.user.email
    );
  }

  @Post("ai/magic-post")
  @ApiOperation({
    summary:
      "AI Magic Post: extract a draft errand from free-form text (does not create it)",
  })
  async magicPost(@Body() magicPostDto: MagicPostDto) {
    return this.aiService.parseErrandFromText(magicPostDto.text);
  }

  @Post("ai/price-estimate")
  @ApiOperation({ summary: "AI market-rate price estimate for an errand" })
  async priceEstimate(@Body() priceEstimateDto: PriceEstimateDto) {
    return this.aiService.estimatePriceRange(priceEstimateDto);
  }

  @Get()
  @ApiOperation({ summary: "Get all errands with filters" })
  async findAll(@Query() filterDto: FilterErrandsDto, @Request() req) {
    return this.errandsService.findAll(filterDto, req.user.id);
  }

  @Get("my")
  @ApiOperation({ summary: "Get current user errands (posted and accepted)" })
  async findMyErrands(@Request() req) {
    return this.errandsService.findMyErrands(req.user.id);
  }

  @Get("boost-quote")
  @ApiOperation({
    summary:
      "Get the current boost price - surges when many errands are open at once",
  })
  async getBoostQuote(@Request() req) {
    return this.errandsService.getBoostPriceQuote(req.user.id);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get errand by ID" })
  async findOne(@Param("id") id: string) {
    return this.errandsService.findOne(id);
  }

  @Patch(":id/accept")
  @ApiOperation({ summary: "Accept an errand" })
  async acceptErrand(@Param("id") id: string, @Request() req) {
    return this.errandsService.acceptErrand(id, req.user.id, req.user.role);
  }

  @Post(":id/applications")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Apply to run an errand" })
  async applyToErrand(
    @Param("id") id: string,
    @Body() createApplicationDto: CreateApplicationDto,
    @Request() req
  ) {
    return this.errandsService.applyToErrand(
      id,
      req.user.id,
      req.user.role,
      createApplicationDto.message
    );
  }

  @Get(":id/applications")
  @ApiOperation({
    summary:
      "List applicants for an errand (the requester sees everyone; an applying runner sees only their own application)",
  })
  async getApplications(@Param("id") id: string, @Request() req) {
    return this.errandsService.getApplications(id, req.user.id);
  }

  @Patch(":id/applications/:applicationId/accept")
  @ApiOperation({ summary: "Requester accepts an applicant" })
  async acceptApplication(
    @Param("id") id: string,
    @Param("applicationId") applicationId: string,
    @Request() req
  ) {
    return this.errandsService.acceptApplication(
      id,
      applicationId,
      req.user.id
    );
  }

  @Patch(":id/applications/:applicationId/decline")
  @ApiOperation({ summary: "Requester declines an applicant" })
  async declineApplication(
    @Param("id") id: string,
    @Param("applicationId") applicationId: string,
    @Request() req
  ) {
    return this.errandsService.declineApplication(
      id,
      applicationId,
      req.user.id
    );
  }

  @Patch(":id/status")
  @ApiOperation({ summary: "Update errand status" })
  async updateStatus(
    @Param("id") id: string,
    @Body() updateStatusDto: UpdateErrandStatusDto,
    @Request() req
  ) {
    return this.errandsService.updateStatus(id, updateStatusDto, req.user.id);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Cancel an errand" })
  async cancel(@Param("id") id: string, @Request() req) {
    await this.errandsService.cancel(id, req.user.id);
  }
}
