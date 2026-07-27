import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { OtpService } from "./otp.service";
import { MailModule } from "../mail/mail.module";

@Module({
  imports: [ConfigModule, MailModule],
  providers: [OtpService],
  exports: [OtpService],
})
export class OtpModule {}
