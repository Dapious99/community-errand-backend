import { IsString, IsOptional, MinLength, Matches } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class CreateKycDto {
  @ApiProperty({
    example: "12345678901",
    description: "11-digit National Identification Number",
  })
  @IsString()
  @Matches(/^\d{11}$/, { message: "NIN must be exactly 11 digits" })
  nin: string;

  @ApiProperty({
    example: "https://res.cloudinary.com/.../nin-slip.jpg",
    description: "Cloudinary URL of the uploaded NIN slip/card photo",
  })
  @IsString()
  ninImageUrl: string;

  @ApiPropertyOptional({
    example: "12345678901",
    description: "Optional - 11-digit Bank Verification Number",
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{11}$/, { message: "BVN must be exactly 11 digits" })
  bvn?: string;

  @ApiPropertyOptional({
    example: "https://res.cloudinary.com/.../id-card.jpg",
  })
  @IsOptional()
  @IsString()
  idCardUrl?: string;

  @ApiPropertyOptional({ example: "0123456789" })
  @IsOptional()
  @IsString()
  bankAccountNumber?: string;

  @ApiPropertyOptional({ example: "Access Bank" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  bankName?: string;
}
