import { IsEmail, IsString, Length, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class ResetPasswordDto {
  @ApiProperty({ example: "user@example.com" })
  @IsEmail()
  email: string;

  @ApiProperty({ example: "482913" })
  @IsString()
  @Length(6, 6)
  code: string;

  @ApiProperty({ example: "newPassword123", minLength: 6 })
  @IsString()
  @MinLength(6)
  newPassword: string;
}
