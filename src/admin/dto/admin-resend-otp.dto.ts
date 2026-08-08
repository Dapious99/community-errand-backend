import { IsEmail } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class AdminResendOtpDto {
  @ApiProperty({ example: "admin@example.com" })
  @IsEmail()
  email: string;
}
