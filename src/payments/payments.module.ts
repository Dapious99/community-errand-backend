import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { PaymentsService } from "./payments.service";
import { PaymentsController } from "./payments.controller";
import { PaystackService } from "./services/paystack.service";
import { Payment } from "./entities/payment.entity";
import { Errand } from "../errands/entities/errand.entity";
import { User } from "../users/entities/user.entity";
import { KYC } from "../users/entities/kyc.entity";
import { WalletModule } from "../wallet/wallet.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment, Errand, User, KYC]),
    WalletModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaystackService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
