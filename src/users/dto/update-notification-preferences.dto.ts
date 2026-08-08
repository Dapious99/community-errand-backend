import { IsBoolean, IsOptional } from "class-validator";
import { ApiPropertyOptional } from "@nestjs/swagger";

export class UpdateNotificationPreferencesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notifyNewErrandsNearby?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notifyBoostedErrandAlerts?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  notifyNewMessages?: boolean;
}
