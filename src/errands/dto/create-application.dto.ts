import { IsOptional, IsString, MaxLength } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class CreateApplicationDto {
  @ApiPropertyOptional({
    description: "Optional note the applicant includes for the requester",
    example: "I'm nearby and can pick this up in 10 minutes.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  message?: string;
}
