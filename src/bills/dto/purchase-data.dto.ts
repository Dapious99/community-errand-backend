import { IsEnum, IsString, Matches } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { NetworkProvider } from "../enums/network-provider.enum";

export class PurchaseDataDto {
  @ApiProperty({ enum: NetworkProvider })
  @IsEnum(NetworkProvider)
  network: NetworkProvider;

  @ApiProperty({ example: "+2348012345678" })
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: "Phone number must be in valid international format",
  })
  phone: string;

  @ApiProperty({ example: "mtn-100mb-100" })
  @IsString()
  variationCode: string;
}
