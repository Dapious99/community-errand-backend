import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ErrandStatus } from '../entities/errand.entity';

export class UpdateErrandStatusDto {
  @ApiProperty({ enum: ErrandStatus })
  @IsEnum(ErrandStatus)
  status: ErrandStatus;
}

