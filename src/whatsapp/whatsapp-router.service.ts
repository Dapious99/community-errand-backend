import { HttpException, Injectable, Logger } from "@nestjs/common";
import { WhatsappService } from "./whatsapp.service";
import { WhatsappSessionService, WhatsappSession } from "./whatsapp-session.service";
import { WhatsappIdentityService } from "./whatsapp-identity.service";
import { AiService } from "../ai/ai.service";
import { AccountFlow } from "./flows/account.flow";
import { ErrandsFlow } from "./flows/errands.flow";
import { WalletFlow } from "./flows/wallet.flow";
import { BillsFlow } from "./flows/bills.flow";
import { KycFlow } from "./flows/kyc.flow";
import { ReferralsFlow } from "./flows/referrals.flow";
import { SubscriptionFlow } from "./flows/subscription.flow";
import { User } from "../users/entities/user.entity";

const MAIN_MENU_ROWS = [
  {
    id: "menu_account",
    title: "Account",
    description: "Profile, ratings, notification settings",
  },
  {
    id: "menu_errands",
    title: "Errands",
    description: "Post, browse, and track errands",
  },
  {
    id: "menu_wallet",
    title: "Wallet & Payments",
    description: "Balance, deposit, withdraw",
  },
  {
    id: "menu_bills",
    title: "Buy Airtime/Data",
    description: "Top up airtime or data",
  },
  {
    id: "menu_kyc",
    title: "Identity & Payout",
    description: "KYC status, bank details",
  },
  {
    id: "menu_referrals",
    title: "Referrals",
    description: "Your code and referral stats",
  },
  {
    id: "menu_subscription",
    title: "Go Pro",
    description: "Subscription status, subscribe, renew",
  },
];

const MAIN_MENU_INTENTS = [
  "menu_account",
  "menu_errands",
  "menu_wallet",
  "menu_bills",
  "menu_kyc",
  "menu_referrals",
  "menu_subscription",
  "menu_help",
];

const GREETING_WORDS = new Set(["hi", "hello", "hey", "menu", "start", "help"]);

/**
 * Entry point for every inbound WhatsApp message: resolves identity, routes
 * button/list taps deterministically, and falls back to AiService for free
 * text with no active flow.
 */
@Injectable()
export class WhatsappRouterService {
  private readonly logger = new Logger(WhatsappRouterService.name);

  constructor(
    private whatsappService: WhatsappService,
    private sessionService: WhatsappSessionService,
    private identityService: WhatsappIdentityService,
    private aiService: AiService,
    private accountFlow: AccountFlow,
    private errandsFlow: ErrandsFlow,
    private walletFlow: WalletFlow,
    private billsFlow: BillsFlow,
    private kycFlow: KycFlow,
    private referralsFlow: ReferralsFlow,
    private subscriptionFlow: SubscriptionFlow
  ) {}

  async handleWebhookPayload(body: any): Promise<void> {
    for (const message of this.extractMessages(body)) {
      await this.handleInboundMessage(message);
    }
  }

  private extractMessages(body: any): any[] {
    const messages: any[] = [];
    for (const entry of body?.entry ?? []) {
      for (const change of entry?.changes ?? []) {
        for (const message of change?.value?.messages ?? []) {
          messages.push(message);
        }
      }
    }
    return messages;
  }

  private extractAction(message: any): { id?: string; text?: string } {
    if (message.type === "interactive") {
      const interactive = message.interactive;
      if (interactive?.type === "button_reply") {
        return {
          id: interactive.button_reply.id,
          text: interactive.button_reply.title,
        };
      }
      if (interactive?.type === "list_reply") {
        return {
          id: interactive.list_reply.id,
          text: interactive.list_reply.title,
        };
      }
      return {};
    }
    if (message.type === "text") {
      return { text: message.text?.body?.trim() };
    }
    // Unsupported message types (image, location, sticker, etc.) fall
    // through with no id/text - handleInboundMessage responds with the main
    // menu rather than crashing.
    return {};
  }

  private async handleInboundMessage(message: any): Promise<void> {
    const phone = message.from;
    if (!phone) {
      return;
    }

    const { id, text } = this.extractAction(message);
    let user: User | null = null;

    try {
      user = await this.identityService.resolve(phone);
      if (!user) {
        await this.handleUnlinked(phone, text);
        return;
      }

      const normalized = (text ?? "").trim().toLowerCase();
      if (!id && GREETING_WORDS.has(normalized)) {
        await this.sessionService.clear(phone);
        await this.sendMainMenu(phone, user);
        return;
      }

      const session = await this.sessionService.get(phone);

      if (session.flow === "account") {
        const next = await this.accountFlow.handle(user, session, phone, id);
        await this.applyNext(phone, user, next);
        return;
      }

      if (session.flow === "errands") {
        const next = await this.errandsFlow.handle(user, session, phone, {
          id,
          text,
        });
        await this.applyNext(phone, user, next);
        return;
      }

      if (session.flow === "wallet") {
        const next = await this.walletFlow.handle(user, session, phone, {
          id,
          text,
        });
        await this.applyNext(phone, user, next);
        return;
      }

      if (session.flow === "bills") {
        const next = await this.billsFlow.handle(user, session, phone, {
          id,
          text,
        });
        await this.applyNext(phone, user, next);
        return;
      }

      if (session.flow === "kyc") {
        const next = await this.kycFlow.handle(user, session, phone, {
          id,
          text,
        });
        await this.applyNext(phone, user, next);
        return;
      }

      if (session.flow === "referrals") {
        const next = await this.referralsFlow.handle();
        await this.applyNext(phone, user, next);
        return;
      }

      if (session.flow === "subscription") {
        const next = await this.subscriptionFlow.handle(user, session, phone, {
          id,
          text,
        });
        await this.applyNext(phone, user, next);
        return;
      }

      const menuAction = id ?? (await this.classifyMainMenuIntent(text));
      await this.routeMainMenu(phone, user, menuAction);
    } catch (error: any) {
      if (error instanceof HttpException) {
        // Domain errors (insufficient balance, not eligible to pick up,
        // already accepted by someone else, etc) already carry a
        // user-facing message - relay it as-is and reset to the main menu
        // rather than leaving the session stuck mid-flow.
        await this.whatsappService.sendText(phone, error.message);
        if (user) {
          await this.sessionService.clear(phone);
          await this.sendMainMenu(phone, user);
        }
        return;
      }
      this.logger.error(
        `Failed handling WhatsApp message from ${phone}: ${error.message}`,
        error.stack
      );
      await this.whatsappService.sendText(
        phone,
        "Something went wrong on our end - please try again."
      );
    }
  }

  private async handleUnlinked(phone: string, text?: string): Promise<void> {
    const code = (text ?? "").trim();
    if (/^\d{6}$/.test(code)) {
      const user = await this.identityService.linkWithCode(code, phone);
      if (user) {
        await this.whatsappService.sendText(
          phone,
          `You're linked, ${user.name}! Here's what you can do:`
        );
        await this.sendMainMenu(phone, user);
        return;
      }
      await this.whatsappService.sendText(
        phone,
        "That code didn't work - it may be wrong, expired, or already used. Generate a fresh one in the app under Profile > Link WhatsApp."
      );
      return;
    }

    await this.whatsappService.sendText(
      phone,
      "Hi! I don't recognize this number yet. Open the app, go to Profile > Link WhatsApp, and send the 6-digit code you get there to connect this chat to your account."
    );
  }

  private async classifyMainMenuIntent(text?: string): Promise<string> {
    if (!text) {
      return "menu_help";
    }
    const { intent } = await this.aiService.classifyIntent(
      text,
      MAIN_MENU_INTENTS
    );
    return intent;
  }

  private async routeMainMenu(
    phone: string,
    user: User,
    action: string
  ): Promise<void> {
    switch (action) {
      case "menu_account": {
        const next = await this.accountFlow.start(user, phone);
        await this.sessionService.set(phone, next);
        return;
      }
      case "menu_errands": {
        const next = await this.errandsFlow.start(user, phone);
        await this.sessionService.set(phone, next);
        return;
      }
      case "menu_wallet": {
        const next = await this.walletFlow.start(user, phone);
        await this.sessionService.set(phone, next);
        return;
      }
      case "menu_bills": {
        const next = await this.billsFlow.start(user, phone);
        await this.sessionService.set(phone, next);
        return;
      }
      case "menu_kyc": {
        const next = await this.kycFlow.start(user, phone);
        await this.sessionService.set(phone, next);
        return;
      }
      case "menu_referrals": {
        const next = await this.referralsFlow.start(user, phone);
        await this.sessionService.set(phone, next);
        return;
      }
      case "menu_subscription": {
        const next = await this.subscriptionFlow.start(user, phone);
        await this.sessionService.set(phone, next);
        return;
      }
      default:
        await this.sendMainMenu(phone, user);
        return;
    }
  }

  private async applyNext(
    phone: string,
    user: User,
    next: WhatsappSession | null
  ): Promise<void> {
    if (next === null) {
      await this.sessionService.clear(phone);
      await this.sendMainMenu(phone, user);
      return;
    }
    await this.sessionService.set(phone, next);
  }

  private async sendMainMenu(phone: string, user: User): Promise<void> {
    await this.whatsappService.sendList(
      phone,
      `Hi ${user.name}! What would you like to do?`,
      "Menu",
      [{ title: "Main menu", rows: MAIN_MENU_ROWS }]
    );
  }
}
