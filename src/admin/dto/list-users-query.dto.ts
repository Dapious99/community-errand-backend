import { IsEnum, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { UserRole } from "../../users/entities/user.entity";

export class ListUsersQueryDto {
  @ApiPropertyOptional({ description: "Matches name, email, phone, or username" })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: UserRole })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({
    enum: ["picking", "posting"],
    description: "Filter to users currently banned (timed or permanent) from picking up or posting errands",
  })
  @IsOptional()
  @IsEnum(["picking", "posting"])
  banned?: "picking" | "posting";

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
