import { Test, TestingModule } from "@nestjs/testing";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { WhatsappRouterService } from "./whatsapp-router.service";
import { WhatsappService } from "./whatsapp.service";
import { WhatsappSessionService } from "./whatsapp-session.service";
import { WhatsappIdentityService } from "./whatsapp-identity.service";
import { AiService } from "../ai/ai.service";
import { AccountFlow } from "./flows/account.flow";
import { ErrandsFlow } from "./flows/errands.flow";
import { WalletFlow } from "./flows/wallet.flow";
import { BillsFlow } from "./flows/bills.flow";
import { KycFlow } from "./flows/kyc.flow";
import { ReferralsFlow } from "./flows/referrals.flow";
import { SubscriptionFlow } from "./flows/subscription.flow";

const PHONE = "2348012345678";

function textMessage(body: string) {
  return {
    entry: [
      {
        changes: [
          { value: { messages: [{ from: PHONE, type: "text", text: { body } }] } },
        ],
      },
    ],
  };
}

function buttonMessage(id: string, title = id) {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from: PHONE,
                  type: "interactive",
                  interactive: {
                    type: "button_reply",
                    button_reply: { id, title },
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe("WhatsappRouterService", () => {
  let service: WhatsappRouterService;
  let whatsappService: jest.Mocked<WhatsappService>;
  let sessionService: jest.Mocked<WhatsappSessionService>;
  let identityService: jest.Mocked<WhatsappIdentityService>;
  let aiService: jest.Mocked<AiService>;
  let accountFlow: jest.Mocked<AccountFlow>;
  let errandsFlow: jest.Mocked<ErrandsFlow>;
  let walletFlow: jest.Mocked<WalletFlow>;
  let billsFlow: jest.Mocked<BillsFlow>;
  let kycFlow: jest.Mocked<KycFlow>;
  let referralsFlow: jest.Mocked<ReferralsFlow>;
  let subscriptionFlow: jest.Mocked<SubscriptionFlow>;

  const user = { id: "user-1", name: "Ada" } as any;

  beforeEach(async () => {
    whatsappService = {
      sendText: jest.fn(),
      sendList: jest.fn(),
      sendButtons: jest.fn(),
      sendLinkButton: jest.fn(),
    } as any;
    sessionService = {
      get: jest.fn().mockResolvedValue({}),
      set: jest.fn(),
      clear: jest.fn(),
    } as any;
    identityService = {
      resolve: jest.fn(),
      linkWithCode: jest.fn(),
    } as any;
    aiService = {
      classifyIntent: jest.fn(),
    } as any;
    accountFlow = {
      start: jest.fn(),
      handle: jest.fn(),
    } as any;
    errandsFlow = {
      start: jest.fn(),
      handle: jest.fn(),
    } as any;
    walletFlow = {
      start: jest.fn(),
      handle: jest.fn(),
    } as any;
    billsFlow = {
      start: jest.fn(),
      handle: jest.fn(),
    } as any;
    kycFlow = {
      start: jest.fn(),
      handle: jest.fn(),
    } as any;
    referralsFlow = {
      start: jest.fn(),
      handle: jest.fn(),
    } as any;
    subscriptionFlow = {
      start: jest.fn(),
      handle: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappRouterService,
        { provide: WhatsappService, useValue: whatsappService },
        { provide: WhatsappSessionService, useValue: sessionService },
        { provide: WhatsappIdentityService, useValue: identityService },
        { provide: AiService, useValue: aiService },
        { provide: AccountFlow, useValue: accountFlow },
        { provide: ErrandsFlow, useValue: errandsFlow },
        { provide: WalletFlow, useValue: walletFlow },
        { provide: BillsFlow, useValue: billsFlow },
        { provide: KycFlow, useValue: kycFlow },
        { provide: ReferralsFlow, useValue: referralsFlow },
        { provide: SubscriptionFlow, useValue: subscriptionFlow },
      ],
    }).compile();

    service = module.get(WhatsappRouterService);
  });

  describe("unlinked numbers", () => {
    it("prompts to link when the number is unrecognized and the text isn't a code", async () => {
      identityService.resolve.mockResolvedValue(null);

      await service.handleWebhookPayload(textMessage("hello there"));

      expect(whatsappService.sendText).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining("Link WhatsApp")
      );
      expect(identityService.linkWithCode).not.toHaveBeenCalled();
    });

    it("links the account on a valid 6-digit code", async () => {
      identityService.resolve.mockResolvedValue(null);
      identityService.linkWithCode.mockResolvedValue(user);

      await service.handleWebhookPayload(textMessage("123456"));

      expect(identityService.linkWithCode).toHaveBeenCalledWith(
        "123456",
        PHONE
      );
      expect(whatsappService.sendText).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining("linked")
      );
      expect(whatsappService.sendList).toHaveBeenCalled();
    });

    it("reports failure for a wrong/expired code without sending a menu", async () => {
      identityService.resolve.mockResolvedValue(null);
      identityService.linkWithCode.mockResolvedValue(null);

      await service.handleWebhookPayload(textMessage("000000"));

      expect(whatsappService.sendText).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining("didn't work")
      );
      expect(whatsappService.sendList).not.toHaveBeenCalled();
    });
  });

  describe("linked users", () => {
    beforeEach(() => {
      identityService.resolve.mockResolvedValue(user);
    });

    it("sends the main menu and clears the session on a greeting", async () => {
      await service.handleWebhookPayload(textMessage("hi"));

      expect(sessionService.clear).toHaveBeenCalledWith(PHONE);
      expect(whatsappService.sendList).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining("Ada"),
        expect.any(String),
        expect.any(Array)
      );
    });

    it("routes a main-menu button tap into the matching flow", async () => {
      accountFlow.start.mockResolvedValue({ flow: "account" });

      await service.handleWebhookPayload(buttonMessage("menu_account"));

      expect(accountFlow.start).toHaveBeenCalledWith(user, PHONE);
      expect(sessionService.set).toHaveBeenCalledWith(PHONE, {
        flow: "account",
      });
    });

    it("routes menu_bills into the bills flow", async () => {
      billsFlow.start.mockResolvedValue({ flow: "bills" });

      await service.handleWebhookPayload(buttonMessage("menu_bills"));

      expect(billsFlow.start).toHaveBeenCalledWith(user, PHONE);
      expect(sessionService.set).toHaveBeenCalledWith(PHONE, {
        flow: "bills",
      });
    });

    it("delegates to the bills flow while a session is active in it", async () => {
      sessionService.get.mockResolvedValue({ flow: "bills", step: "airtime_network" });
      billsFlow.handle.mockResolvedValue({ flow: "bills", step: "airtime_phone" });

      await service.handleWebhookPayload(buttonMessage("mtn", "MTN"));

      expect(billsFlow.handle).toHaveBeenCalledWith(
        user,
        { flow: "bills", step: "airtime_network" },
        PHONE,
        { id: "mtn", text: "MTN" }
      );
      expect(sessionService.set).toHaveBeenCalledWith(PHONE, {
        flow: "bills",
        step: "airtime_phone",
      });
    });

    it("routes menu_errands into the errands flow", async () => {
      errandsFlow.start.mockResolvedValue({ flow: "errands" });

      await service.handleWebhookPayload(buttonMessage("menu_errands"));

      expect(errandsFlow.start).toHaveBeenCalledWith(user, PHONE);
      expect(sessionService.set).toHaveBeenCalledWith(PHONE, {
        flow: "errands",
      });
    });

    it("routes menu_wallet into the wallet flow", async () => {
      walletFlow.start.mockResolvedValue({ flow: "wallet" });

      await service.handleWebhookPayload(buttonMessage("menu_wallet"));

      expect(walletFlow.start).toHaveBeenCalledWith(user, PHONE);
      expect(sessionService.set).toHaveBeenCalledWith(PHONE, {
        flow: "wallet",
      });
    });

    it("delegates to the wallet flow while a session is active in it", async () => {
      sessionService.get.mockResolvedValue({ flow: "wallet" });
      walletFlow.handle.mockResolvedValue({ flow: "wallet", step: "deposit_amount" });

      await service.handleWebhookPayload(buttonMessage("wal_deposit"));

      expect(walletFlow.handle).toHaveBeenCalledWith(
        user,
        { flow: "wallet" },
        PHONE,
        { id: "wal_deposit", text: "wal_deposit" }
      );
      expect(sessionService.set).toHaveBeenCalledWith(PHONE, {
        flow: "wallet",
        step: "deposit_amount",
      });
    });

    it("delegates to the errands flow while a session is active in it", async () => {
      sessionService.get.mockResolvedValue({ flow: "errands", step: "browse_list" });
      errandsFlow.handle.mockResolvedValue({ flow: "errands", step: "browse_detail" });

      await service.handleWebhookPayload(buttonMessage("errand-1", "Pick up documents"));

      expect(errandsFlow.handle).toHaveBeenCalledWith(
        user,
        { flow: "errands", step: "browse_list" },
        PHONE,
        { id: "errand-1", text: "Pick up documents" }
      );
      expect(sessionService.set).toHaveBeenCalledWith(PHONE, {
        flow: "errands",
        step: "browse_detail",
      });
    });

    it("routes menu_kyc into the kyc flow", async () => {
      kycFlow.start.mockResolvedValue({ flow: "kyc" });

      await service.handleWebhookPayload(buttonMessage("menu_kyc"));

      expect(kycFlow.start).toHaveBeenCalledWith(user, PHONE);
      expect(sessionService.set).toHaveBeenCalledWith(PHONE, { flow: "kyc" });
    });

    it("delegates to the kyc flow while a session is active in it", async () => {
      sessionService.get.mockResolvedValue({ flow: "kyc", step: "bank_account_number" });
      kycFlow.handle.mockResolvedValue({ flow: "kyc", step: "bank_name" });

      await service.handleWebhookPayload(textMessage("0123456789"));

      expect(kycFlow.handle).toHaveBeenCalledWith(
        user,
        { flow: "kyc", step: "bank_account_number" },
        PHONE,
        { id: undefined, text: "0123456789" }
      );
      expect(sessionService.set).toHaveBeenCalledWith(PHONE, {
        flow: "kyc",
        step: "bank_name",
      });
    });

    it("routes menu_referrals into the referrals flow", async () => {
      referralsFlow.start.mockResolvedValue({ flow: "referrals" });

      await service.handleWebhookPayload(buttonMessage("menu_referrals"));

      expect(referralsFlow.start).toHaveBeenCalledWith(user, PHONE);
      expect(sessionService.set).toHaveBeenCalledWith(PHONE, {
        flow: "referrals",
      });
    });

    it("delegates to the referrals flow while a session is active in it, then exits on any reply", async () => {
      sessionService.get.mockResolvedValue({ flow: "referrals" });
      referralsFlow.handle.mockResolvedValue(null);

      await service.handleWebhookPayload(textMessage("ok"));

      expect(referralsFlow.handle).toHaveBeenCalled();
      expect(sessionService.clear).toHaveBeenCalledWith(PHONE);
      expect(whatsappService.sendList).toHaveBeenCalled();
    });

    it("routes menu_subscription into the subscription flow", async () => {
      subscriptionFlow.start.mockResolvedValue({ flow: "subscription" });

      await service.handleWebhookPayload(buttonMessage("menu_subscription"));

      expect(subscriptionFlow.start).toHaveBeenCalledWith(user, PHONE);
      expect(sessionService.set).toHaveBeenCalledWith(PHONE, {
        flow: "subscription",
      });
    });

    it("delegates to the subscription flow while a session is active in it", async () => {
      sessionService.get.mockResolvedValue({ flow: "subscription" });
      subscriptionFlow.handle.mockResolvedValue({
        flow: "subscription",
        step: "choose_plan",
      });

      await service.handleWebhookPayload(buttonMessage("sub_subscribe"));

      expect(subscriptionFlow.handle).toHaveBeenCalledWith(
        user,
        { flow: "subscription" },
        PHONE,
        { id: "sub_subscribe", text: "sub_subscribe" }
      );
      expect(sessionService.set).toHaveBeenCalledWith(PHONE, {
        flow: "subscription",
        step: "choose_plan",
      });
    });

    it("classifies free text into a main-menu intent when there's no active flow", async () => {
      aiService.classifyIntent.mockResolvedValue({ intent: "menu_account" });
      accountFlow.start.mockResolvedValue({ flow: "account" });

      await service.handleWebhookPayload(textMessage("I want to check my profile"));

      expect(aiService.classifyIntent).toHaveBeenCalled();
      expect(accountFlow.start).toHaveBeenCalledWith(user, PHONE);
    });

    it("delegates to the account flow while a session is active in it", async () => {
      sessionService.get.mockResolvedValue({ flow: "account" });
      accountFlow.handle.mockResolvedValue({ flow: "account", step: "notifications" });

      await service.handleWebhookPayload(buttonMessage("acct_notifications"));

      expect(accountFlow.handle).toHaveBeenCalledWith(
        user,
        { flow: "account" },
        PHONE,
        "acct_notifications"
      );
      expect(sessionService.set).toHaveBeenCalledWith(PHONE, {
        flow: "account",
        step: "notifications",
      });
    });

    it("clears the session and shows the main menu when a flow returns null", async () => {
      sessionService.get.mockResolvedValue({ flow: "account" });
      accountFlow.handle.mockResolvedValue(null);

      await service.handleWebhookPayload(buttonMessage("acct_back"));

      expect(sessionService.clear).toHaveBeenCalledWith(PHONE);
      expect(whatsappService.sendList).toHaveBeenCalled();
    });

    it("surfaces an HttpException's message directly and resets to the main menu", async () => {
      sessionService.get.mockResolvedValue({ flow: "account" });
      accountFlow.handle.mockRejectedValue(
        new ConflictException("This WhatsApp number is already linked to a different account.")
      );

      await service.handleWebhookPayload(buttonMessage("acct_profile"));

      expect(whatsappService.sendText).toHaveBeenCalledWith(
        PHONE,
        "This WhatsApp number is already linked to a different account."
      );
      expect(sessionService.clear).toHaveBeenCalledWith(PHONE);
      expect(whatsappService.sendList).toHaveBeenCalled();
    });

    it("relays a domain error from the errands flow (e.g. insufficient balance) the same way", async () => {
      sessionService.get.mockResolvedValue({ flow: "errands", step: "post_confirm" });
      errandsFlow.handle.mockRejectedValue(
        new NotFoundException("Errand not found")
      );

      await service.handleWebhookPayload(buttonMessage("err_confirm_post"));

      expect(whatsappService.sendText).toHaveBeenCalledWith(
        PHONE,
        "Errand not found"
      );
      expect(sessionService.clear).toHaveBeenCalledWith(PHONE);
    });

    it("falls back to a generic error message on unexpected failures", async () => {
      sessionService.get.mockResolvedValue({ flow: "account" });
      accountFlow.handle.mockRejectedValue(new Error("boom"));

      await service.handleWebhookPayload(buttonMessage("acct_profile"));

      expect(whatsappService.sendText).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining("Something went wrong")
      );
    });
  });
});
