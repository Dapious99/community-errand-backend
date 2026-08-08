import { IsString, Length } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class ConfirmBankChangeDto {
  @ApiProperty({ example: "482913" })
  @IsString()
  @Length(6, 6)
  code: string;
}
