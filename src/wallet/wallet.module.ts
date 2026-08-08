import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WalletService } from "./wallet.service";
import { WalletController } from "./wallet.controller";
import { Wallet } from "./entities/wallet.entity";
import { WalletTransaction } from "./entities/wallet-transaction.entity";
import { UsersModule } from "../users/users.module";

@Module({
  imports: [TypeOrmModule.forFeature([Wallet, WalletTransaction]), UsersModule],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
