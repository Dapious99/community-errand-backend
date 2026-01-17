import {
  IsOptional,
  IsEnum,
  IsNumber,
  IsString,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ErrandCategory,
  ErrandStatus,
  UrgencyLevel,
} from '../entities/errand.entity';

export class FilterErrandsDto {
  @ApiPropertyOptional({ enum: ErrandCategory })
  @IsOptional()
  @IsEnum(ErrandCategory)
  category?: ErrandCategory;

  @ApiPropertyOptional({ enum: ErrandStatus })
  @IsOptional()
  @IsEnum(ErrandStatus)
  status?: ErrandStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: UrgencyLevel })
  @IsOptional()
  @IsEnum(UrgencyLevel)
  urgency?: UrgencyLevel;

  @ApiPropertyOptional({
    enum: ['newest', 'price_high', 'price_low', 'distance'],
  })
  @IsOptional()
  @IsEnum(['newest', 'price_high', 'price_low', 'distance'])
  sortBy?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}



