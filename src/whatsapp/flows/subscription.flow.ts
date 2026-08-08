import { Injectable } from "@nestjs/common";
import { SubscriptionsService } from "../../subscriptions/subscriptions.service";
import { SubscriptionPlan } from "../../subscriptions/entities/subscription.entity";
import { User } from "../../users/entities/user.entity";
import { WhatsappService } from "../whatsapp.service";
import { WhatsappSession } from "../whatsapp-session.service";
import { WhatsappAction } from "./errands.flow";

const SUBMENU_ROWS = [
  { id: "sub_status", title: "Check Pro status" },
  { id: "sub_subscribe", title: "Subscribe / renew" },
  { id: "sub_cancel_autorenew", title: "Cancel auto-renew" },
  { id: "sub_back", title: "Back to main menu" },
];

const PLAN_LABELS: Record<SubscriptionPlan, string> = {
  [SubscriptionPlan.MONTHLY]: "Monthly",
  [SubscriptionPlan.QUARTERLY]: "Quarterly",
  [SubscriptionPlan.SEMI_ANNUAL]: "Semi-annual",
  [SubscriptionPlan.ANNUAL]: "Annual",
};

/**
 * Pro subscription over WhatsApp: check status, subscribe/renew (debited
 * from the wallet, same as the app - see SubscriptionsService.subscribe),
 * and cancel auto-renew. Insufficient-balance and other domain errors are
 * HttpExceptions already relayed generically by WhatsappRouterService, so
 * this flow doesn't need its own error handling for that.
 */
@Injectable()
export class SubscriptionFlow {
  constructor(
    private subscriptionsService: SubscriptionsService,
    private whatsappService: WhatsappService
  ) {}

  async start(user: User, phone: string): Promise<WhatsappSession> {
    await this.sendSubmenu(phone);
    return { flow: "subscription" };
  }

  async handle(
    user: User,
    session: WhatsappSession,
    phone: string,
    action: WhatsappAction
  ): Promise<WhatsappSession | null> {
    switch (session.step) {
      case undefined:
        return this.handleSubmenu(user, phone, action);
      case "choose_plan":
        return this.handleChoosePlan(user, phone, action);
      case "confirm_autorenew":
        return this.handleConfirmAutoRenew(user, phone, session, action);
      default:
        return this.start(user, phone);
    }
  }

  private async sendSubmenu(phone: string): Promise<void> {
    await this.whatsappService.sendList(
      phone,
      "Pro subscription - what would you like to do?",
      "Choose",
      [{ title: "Pro", rows: SUBMENU_ROWS }]
    );
  }

  private async handleSubmenu(
    user: User,
    phone: string,
    action: WhatsappAction
  ): Promise<WhatsappSession | null> {
    switch (action.id) {
      case "sub_status":
        await this.sendStatus(user, phone);
        return this.start(user, phone);
      case "sub_subscribe":
        return this.sendPlanList(user, phone);
      case "sub_cancel_autorenew":
        await this.subscriptionsService.cancelAutoRenew(user.id);
        await this.whatsappService.sendText(phone, "Auto-renew turned off.");
        return this.start(user, phone);
      case "sub_back":
        return null;
      default:
        await this.sendSubmenu(phone);
        return { flow: "subscription" };
    }
  }

  private async sendStatus(user: User, phone: string): Promise<void> {
    const status = await this.subscriptionsService.getStatus(user.id);
    const lines = [
      `Pro: ${status.isPro ? "Active" : "Not active"}`,
      status.plan ? `Plan: ${PLAN_LABELS[status.plan]}` : null,
      status.proExpiresAt
        ? `Expires: ${status.proExpiresAt.toDateString()}`
        : null,
      `Auto-renew: ${status.autoRenew ? "ON" : "OFF"}`,
    ].filter((line): line is string => !!line);
    await this.whatsappService.sendText(phone, lines.join("\n"));
  }

  private async sendPlanList(
    user: User,
    phone: string
  ): Promise<WhatsappSession> {
    const rows = await Promise.all(
      Object.values(SubscriptionPlan).map(async (plan) => {
        const price = await this.subscriptionsService.getPlanPrice(
          plan,
          user.country
        );
        return {
          id: `sub_plan_${plan}`,
          title: PLAN_LABELS[plan],
          description: `₦${price.toLocaleString()}`,
        };
      })
    );
    await this.whatsappService.sendList(
      phone,
      "Choose a plan:",
      "Choose",
      [{ title: "Plans", rows }]
    );
    return { flow: "subscription", step: "choose_plan" };
  }

  private async handleChoosePlan(
    user: User,
    phone: string,
    action: WhatsappAction
  ): Promise<WhatsappSession> {
    const plan = (action.id ?? "").replace("sub_plan_", "") as SubscriptionPlan;
    if (!Object.values(SubscriptionPlan).includes(plan)) {
      return this.sendPlanList(user, phone);
    }

    await this.whatsappService.sendButtons(
      phone,
      "Turn on auto-renew for this plan?",
      [
        { id: "sub_autorenew_yes", title: "Yes" },
        { id: "sub_autorenew_no", title: "No" },
      ]
    );
    return { flow: "subscription", step: "confirm_autorenew", data: { plan } };
  }

  private async handleConfirmAutoRenew(
    user: User,
    phone: string,
    session: WhatsappSession,
    action: WhatsappAction
  ): Promise<WhatsappSession> {
    if (action.id !== "sub_autorenew_yes" && action.id !== "sub_autorenew_no") {
      await this.whatsappService.sendText(
        phone,
        "Tap Yes or No to continue."
      );
      return session;
    }

    const autoRenew = action.id === "sub_autorenew_yes";
    const plan = session.data?.plan as SubscriptionPlan;
    const subscription = await this.subscriptionsService.subscribe(
      user.id,
      plan,
      autoRenew
    );

    await this.whatsappService.sendText(
      phone,
      `You're Pro until ${subscription.expiresAt.toDateString()} (${PLAN_LABELS[plan]}, auto-renew ${autoRenew ? "ON" : "OFF"}).`
    );
    return this.start(user, phone);
  }
}
