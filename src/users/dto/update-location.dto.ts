import { IsNumber } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class UpdateLocationDto {
  @ApiProperty({ example: 6.5244 })
  @IsNumber()
  latitude: number;

  @ApiProperty({ example: 3.3792 })
  @IsNumber()
  longitude: number;
}
