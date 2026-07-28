import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ReferralsService } from "./referrals.service";
import { ReferralsController } from "./referrals.controller";
import { Referral } from "./entities/referral.entity";
import { User } from "../users/entities/user.entity";
import { WalletModule } from "../wallet/wallet.module";

@Module({
  imports: [TypeOrmModule.forFeature([Referral, User]), WalletModule],
  controllers: [ReferralsController],
  providers: [ReferralsService],
  exports: [ReferralsService],
})
export class ReferralsModule {}
