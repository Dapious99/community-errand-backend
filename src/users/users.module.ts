import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UsersService } from "./users.service";
import { UsersController } from "./users.controller";
import { User } from "./entities/user.entity";
import { KYC } from "./entities/kyc.entity";
import { RatingsModule } from "../ratings/ratings.module";

@Module({
  imports: [TypeOrmModule.forFeature([User, KYC]), RatingsModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
