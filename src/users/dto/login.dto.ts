import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class LoginDto {
  @ApiProperty({ example: "user@example.com" })
  @IsEmail()
  email: string;

  @ApiProperty({ example: "password123" })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({
    description:
      "Stable client-generated device identifier. Omitting it (or sending an unrecognized one) triggers a new-device confirmation email.",
  })
  @IsOptional()
  @IsString()
  deviceId?: string;
}
