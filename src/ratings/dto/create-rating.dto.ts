import { IsNumber, IsOptional, IsString, Min, Max, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRatingDto {
  @ApiProperty({ example: 'errand-uuid' })
  @IsString()
  errandId: string;

  @ApiProperty({ example: 'user-uuid' })
  @IsString()
  toUserId: string;

  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  @IsNumber()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  review?: string;
}

