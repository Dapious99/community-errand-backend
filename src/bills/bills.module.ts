import { Module } from "@nestjs/common";
import { BillsService } from "./bills.service";
import { BillsController } from "./bills.controller";
import { VtpassService } from "./services/vtpass.service";
import { WalletModule } from "../wallet/wallet.module";

@Module({
  imports: [WalletModule],
  controllers: [BillsController],
  providers: [BillsService, VtpassService],
  exports: [BillsService],
})
export class BillsModule {}
