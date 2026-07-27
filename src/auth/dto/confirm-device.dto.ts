import { IsEmail, IsString, Length } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class ConfirmDeviceDto {
  @ApiProperty({ example: "user@example.com" })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: "The same deviceId sent with the original login attempt",
  })
  @IsString()
  deviceId: string;

  @ApiProperty({ example: "482913" })
  @IsString()
  @Length(6, 6)
  code: string;
}
