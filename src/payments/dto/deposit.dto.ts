import { IsNumber, Max, Min } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class DepositDto {
  @ApiProperty({
    example: 5000,
    description: "Amount in NGN to deposit into your wallet",
  })
  @IsNumber()
  @Min(1)
  @Max(10_000_000)
  amount: number;
}
