import { IsString, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class MagicPostDto {
  @ApiProperty({
    example:
      "I need someone to pick up a large pizza from Domino's on 5th street and bring it to my apartment in 30 mins",
  })
  @IsString()
  @MinLength(3)
  text: string;
}
