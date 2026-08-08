import { IsOptional, IsString, MaxLength } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class AcknowledgeConcernDto {
  @ApiPropertyOptional({
    description: "Optional note the runner includes for the requester",
    example: "Still on it, traffic is heavy - almost there.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reply?: string;
}
