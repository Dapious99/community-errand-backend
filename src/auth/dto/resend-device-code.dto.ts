import { IsEmail, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class ResendDeviceCodeDto {
  @ApiProperty({ example: "user@example.com" })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: "The same deviceId sent with the original login attempt",
  })
  @IsString()
  deviceId: string;
}
