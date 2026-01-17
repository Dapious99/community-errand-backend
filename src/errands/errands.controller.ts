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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ErrandsService } from './errands.service';
import { CreateErrandDto } from './dto/create-errand.dto';
import { UpdateErrandStatusDto } from './dto/update-errand-status.dto';
import { FilterErrandsDto } from './dto/filter-errands.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('errands')
@Controller('errands')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ErrandsController {
  constructor(private readonly errandsService: ErrandsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new errand' })
  async create(@Body() createErrandDto: CreateErrandDto, @Request() req) {
    return this.errandsService.create(createErrandDto, req.user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all errands with filters' })
  async findAll(@Query() filterDto: FilterErrandsDto) {
    return this.errandsService.findAll(filterDto);
  }

  @Get('my')
  @ApiOperation({ summary: 'Get current user errands (posted and accepted)' })
  async findMyErrands(@Request() req) {
    return this.errandsService.findMyErrands(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get errand by ID' })
  async findOne(@Param('id') id: string) {
    return this.errandsService.findOne(id);
  }

  @Patch(':id/accept')
  @ApiOperation({ summary: 'Accept an errand' })
  async acceptErrand(@Param('id') id: string, @Request() req) {
    return this.errandsService.acceptErrand(id, req.user.id, req.user.role);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update errand status' })
  async updateStatus(
    @Param('id') id: string,
    @Body() updateStatusDto: UpdateErrandStatusDto,
    @Request() req
  ) {
    return this.errandsService.updateStatus(id, updateStatusDto, req.user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cancel an errand' })
  async cancel(@Param('id') id: string, @Request() req) {
    await this.errandsService.cancel(id, req.user.id);
  }
}



