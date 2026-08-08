import { Module } from "@nestjs/common";
import { WhatsappLinkService } from "./whatsapp-link.service";

@Module({
  providers: [WhatsappLinkService],
  exports: [WhatsappLinkService],
})
export class WhatsappLinkModule {}
