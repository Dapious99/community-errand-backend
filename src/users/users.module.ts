import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UsersService } from "./users.service";
import { UsersController } from "./users.controller";
import { User } from "./entities/user.entity";
import { KYC } from "./entities/kyc.entity";
import { RatingsModule } from "../ratings/ratings.module";
import { OtpModule } from "../otp/otp.module";
import { DojahService } from "./services/dojah.service";

@Module({
  imports: [TypeOrmModule.forFeature([User, KYC]), RatingsModule, OtpModule],
  controllers: [UsersController],
  providers: [UsersService, DojahService],
  exports: [UsersService],
})
export class UsersModule {}
