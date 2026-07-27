import { IsString, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class RejectKycDto {
  @ApiProperty({ example: "ID card image is blurry, please resubmit." })
  @IsString()
  @MinLength(3)
  reason: string;
}
