import { IsString, MinLength, MaxLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class RaiseConcernDto {
  @ApiProperty({ example: "Runner has gone silent and the ETA already passed." })
  @IsString()
  @MinLength(3)
  @MaxLength(1000)
  reason: string;
}
