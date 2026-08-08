import { IsString, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class SubmitBankDetailsDto {
  @ApiProperty({ example: "0123456789" })
  @IsString()
  bankAccountNumber: string;

  @ApiProperty({ example: "Access Bank" })
  @IsString()
  @MinLength(2)
  bankName: string;

  @ApiProperty({
    example: "John Doe",
    description: "The name registered on the bank account, as it appears with the bank",
  })
  @IsString()
  @MinLength(2)
  bankAccountName: string;
}
