import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsArray,
  IsBoolean,
  ValidateNested,
  Min,
  MinLength,
  IsDateString,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ErrandCategory, UrgencyLevel } from "../entities/errand.entity";
import { LocationType } from "../entities/location.entity";
import { MediaType } from "../entities/media-attachment.entity";

class LocationDto {
  @ApiProperty({ enum: LocationType })
  @IsEnum(LocationType)
  type: LocationType;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  label: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  longitude?: number;
}

class MediaAttachmentDto {
  @ApiProperty()
  @IsString()
  url: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cloudinaryId?: string;

  @ApiPropertyOptional({ enum: MediaType, default: MediaType.IMAGE })
  @IsOptional()
  @IsEnum(MediaType)
  type?: MediaType;
}

export class CreateErrandDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  title: string;

  @ApiProperty()
  @IsString()
  @MinLength(10)
  description: string;

  @ApiProperty({ enum: ErrandCategory })
  @IsEnum(ErrandCategory)
  category: ErrandCategory;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  price: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  tip?: number;

  @ApiPropertyOptional({
    default: 1,
    description:
      "How many runners this errand needs. Errands needing more than one, or above the configurable priority-price threshold, are shown to Pro runners first (see the Pro priority-access window).",
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  requiredRunners?: number;

  @ApiProperty({ type: [LocationDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LocationDto)
  locations: LocationDto[];

  @ApiPropertyOptional({ enum: UrgencyLevel, default: UrgencyLevel.MEDIUM })
  @IsOptional()
  @IsEnum(UrgencyLevel)
  urgency?: UrgencyLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  timeWindowStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  timeWindowEnd?: string;

  @ApiPropertyOptional({ type: [MediaAttachmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MediaAttachmentDto)
  mediaAttachments?: MediaAttachmentDto[];

  @ApiPropertyOptional({
    description:
      "Pay the configurable AI-Boost fee to get an AI-rewritten title and an immediate notification to nearby top-rated runners. Activates once payment is confirmed, not on request.",
  })
  @IsOptional()
  @IsBoolean()
  isBoosted?: boolean;
}
