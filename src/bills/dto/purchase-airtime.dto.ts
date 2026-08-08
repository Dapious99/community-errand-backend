import { IsEnum, IsNumber, Matches, Max, Min } from "class-validator";
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

  // 50,000 is a generic sanity ceiling, not VTpass's actual per-network
  // limit - tighten this to match their real allowed range if it differs.
  @ApiProperty({ example: 500 })
  @IsNumber()
  @Min(50)
  @Max(50_000)
  amount: number;
}
