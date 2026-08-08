import { Module } from "@nestjs/common";
import { WhatsappController } from "./whatsapp.controller";
import { WhatsappService } from "./whatsapp.service";
import { WhatsappSessionService } from "./whatsapp-session.service";
import { WhatsappIdentityService } from "./whatsapp-identity.service";
import { WhatsappRouterService } from "./whatsapp-router.service";
import { WhatsappLinkModule } from "./whatsapp-link.module";
import { AccountFlow } from "./flows/account.flow";
import { ErrandsFlow } from "./flows/errands.flow";
import { WalletFlow } from "./flows/wallet.flow";
import { BillsFlow } from "./flows/bills.flow";
import { KycFlow } from "./flows/kyc.flow";
import { ReferralsFlow } from "./flows/referrals.flow";
import { SubscriptionFlow } from "./flows/subscription.flow";
import { UsersModule } from "../users/users.module";
import { RatingsModule } from "../ratings/ratings.module";
import { AiModule } from "../ai/ai.module";
import { ErrandsModule } from "../errands/errands.module";
import { WalletModule } from "../wallet/wallet.module";
import { PaymentsModule } from "../payments/payments.module";
import { BillsModule } from "../bills/bills.module";
import { KycModule } from "../kyc/kyc.module";
import { ReferralsModule } from "../referrals/referrals.module";
import { SubscriptionsModule } from "../subscriptions/subscriptions.module";

@Module({
  imports: [
    WhatsappLinkModule,
    UsersModule,
    RatingsModule,
    AiModule,
    ErrandsModule,
    WalletModule,
    PaymentsModule,
    BillsModule,
    KycModule,
    ReferralsModule,
    SubscriptionsModule,
  ],
  controllers: [WhatsappController],
  providers: [
    WhatsappService,
    WhatsappSessionService,
    WhatsappIdentityService,
    WhatsappRouterService,
    AccountFlow,
    ErrandsFlow,
    WalletFlow,
    BillsFlow,
    KycFlow,
    ReferralsFlow,
    SubscriptionFlow,
  ],
})
export class WhatsappModule {}
