import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { KycService } from "./kyc.service";
import { KycController } from "./kyc.controller";
import { DojahService } from "./services/dojah.service";
import { KYC } from "../users/entities/kyc.entity";
import { UsersModule } from "../users/users.module";
import { OtpModule } from "../otp/otp.module";

@Module({
  imports: [TypeOrmModule.forFeature([KYC]), UsersModule, OtpModule],
  controllers: [KycController],
  providers: [KycService, DojahService],
  exports: [KycService],
})
export class KycModule {}
