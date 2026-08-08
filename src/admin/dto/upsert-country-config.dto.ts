import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  MinLength,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

class SubscriptionPricesDto {
  // Index signature so this satisfies CountryConfigService's
  // Record<string, number> - the named properties below are what's actually
  // validated, this just makes the class assignable to that plain map type.
  [key: string]: number;

  @ApiProperty({ example: 1500 })
  @IsNumber()
  monthly: number;

  @ApiProperty({ example: 4000 })
  @IsNumber()
  quarterly: number;

  @ApiProperty({ example: 7000 })
  @IsNumber()
  semi_annual: number;

  @ApiProperty({ example: 12000 })
  @IsNumber()
  annual: number;
}

export class UpsertCountryConfigDto {
  @ApiProperty({ example: "NGN" })
  @IsString()
  @MinLength(2)
  currencyCode: string;

  @ApiProperty({ example: "₦" })
  @IsString()
  currencySymbol: string;

  @ApiProperty({ example: 2500 })
  @IsNumber()
  boostPrice: number;

  @ApiProperty({ example: 10 })
  @IsNumber()
  platformFeePercent: number;

  @ApiProperty({ example: 2000 })
  @IsNumber()
  minWithdrawalAmount: number;

  @ApiProperty({ example: 3.5 })
  @IsNumber()
  withdrawalFeePercent: number;

  @ApiProperty({ example: 500 })
  @IsNumber()
  referralBonus: number;

  @ApiProperty({ example: 20000 })
  @IsNumber()
  priorityPriceThreshold: number;

  @ApiProperty({ type: SubscriptionPricesDto })
  @ValidateNested()
  @Type(() => SubscriptionPricesDto)
  subscriptionPrices: SubscriptionPricesDto;

  @ApiProperty({
    example: 5000,
    description: "Below this errand price, a submitted-but-not-yet-approved KYC is enough to pick it up",
  })
  @IsNumber()
  lightKycPriceThreshold: number;

  @ApiProperty({ example: 5, description: "Payout fee percent for a currently-Pro runner" })
  @IsNumber()
  proPlatformFeePercent: number;

  @ApiProperty({ example: 50, description: "Open-errand count at/above which boost pricing surges" })
  @IsNumber()
  surgeThresholdOpenErrands: number;

  @ApiProperty({ example: 1.5, description: "Multiplier applied to boostPrice while surge is active" })
  @IsNumber()
  surgeMultiplier: number;

  @ApiProperty({ example: "paystack" })
  @IsString()
  paymentGatewayProvider: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
