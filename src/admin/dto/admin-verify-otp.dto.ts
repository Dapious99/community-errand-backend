import { IsEmail, IsString, Length } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class AdminVerifyOtpDto {
  @ApiProperty({ example: "admin@example.com" })
  @IsEmail()
  email: string;

  @ApiProperty({ example: "983467" })
  @IsString()
  @Length(6, 6)
  code: string;
}
