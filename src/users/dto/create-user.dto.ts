import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsEnum,
  Matches,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { UserRole } from "../entities/user.entity";

export class CreateUserDto {
  @ApiProperty({ example: "user@example.com" })
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: "+2348012345678" })
  @IsOptional()
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message: "Phone number must be in valid international format",
  })
  phone?: string;

  @ApiProperty({ example: "John Doe" })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: "johndoe123" })
  @IsString()
  @MinLength(3)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: "Username may only contain letters, numbers, and underscores",
  })
  username: string;

  @ApiProperty({ example: "password123", minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiPropertyOptional({
    enum: UserRole,
    deprecated: true,
    description:
      "Ignored - every new account is created with role BOTH. Kept optional so older clients that still send it aren't rejected.",
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({
    description:
      "A stable identifier generated and persisted by the client (e.g. a UUID saved in AsyncStorage/localStorage). If provided, this device is trusted immediately so future logins from it skip the new-device OTP check.",
  })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({
    example: "CEL7K@3B",
    description:
      "Another user's referral code, if they were referred. Invalid/unknown codes are silently ignored - registration never fails because of this field.",
  })
  @IsOptional()
  @IsString()
  referralCode?: string;
}
