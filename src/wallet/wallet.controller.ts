import { Controller, Get, Query, Request, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { WalletService } from "./wallet.service";
import { WalletTransactionType } from "./entities/wallet-transaction.entity";

@ApiTags("wallet")
@Controller("wallet")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  @ApiOperation({ summary: "Get wallet balance and withdrawal eligibility" })
  async getWallet(@Request() req) {
    const [balance, minWithdrawalAmount, withdrawalFeePercent] =
      await Promise.all([
        this.walletService.getBalance(req.user.id),
        this.walletService.getMinWithdrawalThreshold(),
        this.walletService.getWithdrawalFeePercent(),
      ]);

    return {
      balance,
      minWithdrawalAmount,
      withdrawalFeePercent,
      canWithdraw: balance >= minWithdrawalAmount,
    };
  }

  @Get("transactions")
  @ApiOperation({ summary: "Get wallet transaction history" })
  async getTransactions(
    @Request() req,
    @Query("type") type?: WalletTransactionType
  ) {
    return this.walletService.getTransactions(req.user.id, { type });
  }
}
