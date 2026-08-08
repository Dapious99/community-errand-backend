import { Test, TestingModule } from "@nestjs/testing";
import { SubscriptionFlow } from "./subscription.flow";
import { SubscriptionsService } from "../../subscriptions/subscriptions.service";
import { SubscriptionPlan } from "../../subscriptions/entities/subscription.entity";
import { WhatsappService } from "../whatsapp.service";

const PHONE = "2348012345678";
const user = { id: "user-1", email: "ada@example.com", country: "Nigeria" } as any;

describe("SubscriptionFlow", () => {
  let flow: SubscriptionFlow;
  let subscriptionsService: jest.Mocked<SubscriptionsService>;
  let whatsappService: jest.Mocked<WhatsappService>;

  beforeEach(async () => {
    subscriptionsService = {
      getStatus: jest.fn(),
      getPlanPrice: jest.fn().mockResolvedValue(1500),
      subscribe: jest.fn(),
      cancelAutoRenew: jest.fn(),
    } as any;
    whatsappService = {
      sendText: jest.fn(),
      sendList: jest.fn(),
      sendButtons: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionFlow,
        { provide: SubscriptionsService, useValue: subscriptionsService },
        { provide: WhatsappService, useValue: whatsappService },
      ],
    }).compile();

    flow = module.get(SubscriptionFlow);
  });

  it("start sends the submenu and enters the subscription flow", async () => {
    const session = await flow.start(user, PHONE);
    expect(whatsappService.sendList).toHaveBeenCalled();
    expect(session).toEqual({ flow: "subscription" });
  });

  it("sub_status reports the current Pro status", async () => {
    subscriptionsService.getStatus.mockResolvedValue({
      isPro: true,
      proExpiresAt: new Date("2026-12-01"),
      plan: SubscriptionPlan.ANNUAL,
      autoRenew: true,
    });

    await flow.handle(user, {}, PHONE, { id: "sub_status" });

    expect(whatsappService.sendText).toHaveBeenCalledWith(
      PHONE,
      expect.stringContaining("Active")
    );
  });

  it("sub_subscribe lists the available plans with prices", async () => {
    const session = await flow.handle(user, {}, PHONE, { id: "sub_subscribe" });

    expect(subscriptionsService.getPlanPrice).toHaveBeenCalledWith(
      SubscriptionPlan.MONTHLY,
      "Nigeria"
    );
    expect(whatsappService.sendList).toHaveBeenCalled();
    expect(session).toEqual({ flow: "subscription", step: "choose_plan" });
  });

  it("choosing a plan asks for auto-renew confirmation", async () => {
    const session = await flow.handle(
      user,
      { flow: "subscription", step: "choose_plan" },
      PHONE,
      { id: "sub_plan_monthly" }
    );

    expect(whatsappService.sendButtons).toHaveBeenCalled();
    expect(session).toEqual({
      flow: "subscription",
      step: "confirm_autorenew",
      data: { plan: "monthly" },
    });
  });

  it("re-prompts when the chosen plan id is invalid", async () => {
    const session = await flow.handle(
      user,
      { flow: "subscription", step: "choose_plan" },
      PHONE,
      { id: "sub_plan_bogus" }
    );

    expect(session.step).toBe("choose_plan");
    expect(subscriptionsService.subscribe).not.toHaveBeenCalled();
  });

  it("confirming auto-renew subscribes and reports the new expiry", async () => {
    subscriptionsService.subscribe.mockResolvedValue({
      expiresAt: new Date("2026-09-01"),
    } as any);

    const session = await flow.handle(
      user,
      {
        flow: "subscription",
        step: "confirm_autorenew",
        data: { plan: SubscriptionPlan.MONTHLY },
      },
      PHONE,
      { id: "sub_autorenew_yes" }
    );

    expect(subscriptionsService.subscribe).toHaveBeenCalledWith(
      user.id,
      SubscriptionPlan.MONTHLY,
      true
    );
    expect(session).toEqual({ flow: "subscription" });
  });

  it("re-prompts when the auto-renew reply isn't yes/no", async () => {
    const session = await flow.handle(
      user,
      {
        flow: "subscription",
        step: "confirm_autorenew",
        data: { plan: SubscriptionPlan.MONTHLY },
      },
      PHONE,
      { text: "maybe" }
    );

    expect(session.step).toBe("confirm_autorenew");
    expect(subscriptionsService.subscribe).not.toHaveBeenCalled();
  });

  it("sub_cancel_autorenew turns off auto-renew", async () => {
    await flow.handle(user, {}, PHONE, { id: "sub_cancel_autorenew" });

    expect(subscriptionsService.cancelAutoRenew).toHaveBeenCalledWith(user.id);
  });

  it("sub_back exits to the main menu", async () => {
    const session = await flow.handle(user, {}, PHONE, { id: "sub_back" });
    expect(session).toBeNull();
  });
});
