import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { MessagesService } from "./messages.service";
import { MessagesController } from "./messages.controller";
import { MessagesGateway } from "./gateways/messages.gateway";
import { Message } from "./entities/message.entity";
import { Errand } from "../errands/entities/errand.entity";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule } from "@nestjs/config";
import { AiModule } from "../ai/ai.module";
import { UsersModule } from "../users/users.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Message, Errand]),
    JwtModule,
    ConfigModule,
    AiModule,
    UsersModule,
    NotificationsModule,
  ],
  controllers: [MessagesController],
  providers: [MessagesService, MessagesGateway],
  exports: [MessagesService],
})
export class MessagesModule {}
