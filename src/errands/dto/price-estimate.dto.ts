import { IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ErrandCategory } from "../entities/errand.entity";

export class PriceEstimateDto {
  @ApiProperty({ enum: ErrandCategory })
  @IsEnum(ErrandCategory)
  category: ErrandCategory;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  description: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  pickupLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dropoffLabel?: string;
}
