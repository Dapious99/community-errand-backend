import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UsersService } from "./users.service";
import { UsersController } from "./users.controller";
import { User } from "./entities/user.entity";
import { RatingsModule } from "../ratings/ratings.module";
import { WhatsappLinkModule } from "../whatsapp/whatsapp-link.module";

@Module({
  imports: [TypeOrmModule.forFeature([User]), RatingsModule, WhatsappLinkModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
