import { IsEnum, IsNumber, Matches, Min } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { NetworkProvider } from "../enums/network-provider.enum";

export class PurchaseAirtimeDto {
  @ApiProperty({ enum: NetworkProvider })
  @IsEnum(NetworkProvider)
  network: NetworkProvider;

  @ApiProperty({ example: "+2348012345678" })
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: "Phone number must be in valid international format",
  })
  phone: string;

  @ApiProperty({ example: 500 })
  @IsNumber()
  @Min(50)
  amount: number;
}
