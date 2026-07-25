import { IsString, IsOptional, MinLength } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class CreateKycDto {
  @ApiPropertyOptional({ example: "12345678901" })
  @IsOptional()
  @IsString()
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
