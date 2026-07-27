import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { BillsService } from "./bills.service";
import { PurchaseAirtimeDto } from "./dto/purchase-airtime.dto";
import { PurchaseDataDto } from "./dto/purchase-data.dto";
import { NetworkProvider } from "./enums/network-provider.enum";

@ApiTags("bills")
@Controller("bills")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class BillsController {
  constructor(private readonly billsService: BillsService) {}

  @Post("airtime")
  @ApiOperation({ summary: "Buy airtime using wallet balance" })
  async purchaseAirtime(@Body() dto: PurchaseAirtimeDto, @Request() req) {
    return this.billsService.purchaseAirtime(
      req.user.id,
      dto.network,
      dto.phone,
      dto.amount
    );
  }

  @Post("data")
  @ApiOperation({ summary: "Buy a data bundle using wallet balance" })
  async purchaseData(@Body() dto: PurchaseDataDto, @Request() req) {
    return this.billsService.purchaseData(
      req.user.id,
      dto.network,
      dto.phone,
      dto.variationCode
    );
  }

  @Get("data-plans")
  @ApiOperation({
    summary: "List available data plan variations for a network",
  })
  async listDataPlans(@Query("network") network: NetworkProvider) {
    return this.billsService.listDataPlans(network);
  }

  @Get("history")
  @ApiOperation({ summary: "Get bill purchase history" })
  async getHistory(@Request() req) {
    return this.billsService.getHistory(req.user.id);
  }
}
