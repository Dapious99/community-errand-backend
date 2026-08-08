import { IsEnum } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { NetworkProvider } from "../enums/network-provider.enum";

export class ListDataPlansDto {
  @ApiProperty({ enum: NetworkProvider })
  @IsEnum(NetworkProvider)
  network: NetworkProvider;
}
