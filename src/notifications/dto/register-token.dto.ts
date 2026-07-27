import { IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class RegisterTokenDto {
  @ApiProperty({
    description:
      "Stable per-device identifier, same one used for device-trust login",
  })
  @IsString()
  deviceId: string;

  @ApiProperty({ example: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]" })
  @IsString()
  expoPushToken: string;
}
