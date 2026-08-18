import { IsBoolean, IsNumber, IsOptional, Min } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class BanUserDto {
  @ApiPropertyOptional({ description: "Ban indefinitely - only an admin can lift this" })
  @IsOptional()
  @IsBoolean()
  permanent?: boolean;

  @ApiPropertyOptional({
    description: "Timed ban length in hours, ignored if `permanent` is true. Defaults to 72h (the ladder's first tier) if neither is given.",
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  durationHours?: number;
}
