import { Injectable } from "@nestjs/common";
import { BillsService } from "../../bills/bills.service";
import { NetworkProvider } from "../../bills/enums/network-provider.enum";
import { VtpassVariation } from "../../bills/services/vtpass.service";
import { User } from "../../users/entities/user.entity";
import { WhatsappService } from "../whatsapp.service";
import { WhatsappSession } from "../whatsapp-session.service";
import { WhatsappAction } from "./errands.flow";

const SUBMENU_ROWS = [
  { id: "bill_airtime", title: "Buy airtime" },
  { id: "bill_data", title: "Buy a data bundle" },
  { id: "bill_history", title: "Purchase history" },
  { id: "bill_back", title: "Back to main menu" },
];

const NETWORK_LABELS: Record<NetworkProvider, string> = {
  [NetworkProvider.MTN]: "MTN",
  [NetworkProvider.GLO]: "Glo",
  [NetworkProvider.AIRTEL]: "Airtel",
  [NetworkProvider["9Mobile"]]: "9mobile",
};

const MAX_PLAN_ROWS = 10; // WhatsApp's own cap on rows per list message
const PHONE_REGEX = /^\+?[1-9]\d{1,14}$/;

/** "0" + 10 digits is how most Nigerian users type their own number locally. */
function normalizePhone(raw: string): string {
  const digitsOnly = raw.trim().replace(/[^\d+]/g, "");
  if (/^0\d{10}$/.test(digitsOnly)) {
    return `234${digitsOnly.slice(1)}`;
  }
  return digitsOnly;
}

/**
 * Airtime/data purchases over WhatsApp, both mapping to BillsService 1:1.
 * Data plan variations come from VTpass and can't be known ahead of time,
 * so they're fetched live and the picked list capped at WhatsApp's 10-row
 * limit - see showDataPlans.
 */
@Injectable()
export class BillsFlow {
  constructor(
    private billsService: BillsService,
    private whatsappService: WhatsappService
  ) {}

  async start(user: User, phone: string): Promise<WhatsappSession> {
    await this.sendSubmenu(phone);
    return { flow: "bills" };
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
      case "airtime_network":
        return this.handleAirtimeNetwork(phone, session, action);
      case "airtime_phone":
        return this.handleAirtimePhone(phone, session, action);
      case "airtime_amount":
        return this.handleAirtimeAmount(phone, session, action);
      case "airtime_confirm":
        return this.handleAirtimeConfirm(user, phone, session, action);
      case "data_network":
        return this.handleDataNetwork(phone, session, action);
      case "data_plan":
        return this.handleDataPlan(phone, session, action);
      case "data_phone":
        return this.handleDataPhone(phone, session, action);
      case "data_confirm":
        return this.handleDataConfirm(user, phone, session, action);
      default:
        return this.start(user, phone);
    }
  }

  // ---------------------------------------------------------------- submenu

  private async sendSubmenu(phone: string): Promise<void> {
    await this.whatsappService.sendList(
      phone,
      "Airtime & data - what would you like to do?",
      "Choose",
      [{ title: "Bills", rows: SUBMENU_ROWS }]
    );
  }

  private async handleSubmenu(
    user: User,
    phone: string,
    action: WhatsappAction
  ): Promise<WhatsappSession | null> {
    switch (action.id) {
      case "bill_airtime":
        await this.sendNetworkPicker(phone);
        return { flow: "bills", step: "airtime_network", data: {} };
      case "bill_data":
        await this.sendNetworkPicker(phone);
        return { flow: "bills", step: "data_network", data: {} };
      case "bill_history":
        await this.sendHistory(user, phone);
        return { flow: "bills" };
      case "bill_back":
        return null;
      default:
        await this.sendSubmenu(phone);
        return { flow: "bills" };
    }
  }

  private async sendHistory(user: User, phone: string): Promise<void> {
    const transactions = await this.billsService.getHistory(user.id);
    if (transactions.length === 0) {
      await this.whatsappService.sendText(
        phone,
        "No airtime/data purchases yet."
      );
      return;
    }
    const shown = transactions.slice(0, MAX_PLAN_ROWS);
    await this.whatsappService.sendText(
      phone,
      [
        `Recent purchases${transactions.length > MAX_PLAN_ROWS ? ` (last ${MAX_PLAN_ROWS})` : ""}:`,
        ...shown.map(
          (tx) =>
            `${tx.createdAt.toDateString()} · ${tx.description ?? tx.type} · ₦${tx.amount} (${tx.status})`
        ),
      ].join("\n")
    );
  }

  private async sendNetworkPicker(phone: string): Promise<void> {
    await this.whatsappService.sendList(phone, "Which network?", "Choose", [
      {
        title: "Network",
        rows: Object.entries(NETWORK_LABELS).map(([value, title]) => ({
          id: value,
          title,
        })),
      },
    ]);
  }

  // ------------------------------------------------------------ airtime flow

  private async handleAirtimeNetwork(
    phone: string,
    session: WhatsappSession,
    action: WhatsappAction
  ): Promise<WhatsappSession> {
    const network = action.id as NetworkProvider | undefined;
    if (!network || !NETWORK_LABELS[network]) {
      await this.sendNetworkPicker(phone);
      return { flow: "bills", step: "airtime_network", data: {} };
    }
    await this.whatsappService.sendText(
      phone,
      "What phone number should be topped up? (e.g. 08012345678)"
    );
    return { flow: "bills", step: "airtime_phone", data: { network } };
  }

  private async handleAirtimePhone(
    phone: string,
    session: WhatsappSession,
    action: WhatsappAction
  ): Promise<WhatsappSession> {
    const billPhone = normalizePhone(action.text ?? "");
    if (!PHONE_REGEX.test(billPhone)) {
      await this.whatsappService.sendText(
        phone,
        "That doesn't look like a valid phone number - try again (e.g. 08012345678)."
      );
      return session;
    }
    await this.whatsappService.sendText(
      phone,
      "How much airtime? (₦50 - ₦50,000, numbers only)"
    );
    return {
      ...session,
      step: "airtime_amount",
      data: { ...session.data, billPhone },
    };
  }

  private async handleAirtimeAmount(
    phone: string,
    session: WhatsappSession,
    action: WhatsappAction
  ): Promise<WhatsappSession> {
    const amount = Number((action.text ?? "").replace(/[^\d.]/g, ""));
    if (!amount || amount < 50 || amount > 50_000) {
      await this.whatsappService.sendText(
        phone,
        "Enter a valid amount between ₦50 and ₦50,000."
      );
      return session;
    }
    const data = { ...session.data, amount };
    await this.whatsappService.sendText(
      phone,
      `Buy ₦${amount} airtime on ${NETWORK_LABELS[data.network as NetworkProvider]} for ${data.billPhone}?`
    );
    await this.whatsappService.sendButtons(phone, "Confirm?", [
      { id: "bill_confirm", title: "Confirm" },
      { id: "bill_cancel", title: "Cancel" },
    ]);
    return { ...session, step: "airtime_confirm", data };
  }

  private async handleAirtimeConfirm(
    user: User,
    phone: string,
    session: WhatsappSession,
    action: WhatsappAction
  ): Promise<WhatsappSession> {
    if (action.id !== "bill_confirm") {
      await this.whatsappService.sendText(phone, "Okay, cancelled.");
      return this.start(user, phone);
    }

    const data = session.data ?? {};
    // Any failure (VTpass rejection, insufficient balance) is an
    // HttpException that WhatsappRouterService relays as-is.
    await this.billsService.purchaseAirtime(
      user.id,
      data.network,
      data.billPhone,
      data.amount
    );
    await this.whatsappService.sendText(
      phone,
      "Airtime purchase successful!"
    );
    return this.start(user, phone);
  }

  // --------------------------------------------------------------- data flow

  private async handleDataNetwork(
    phone: string,
    session: WhatsappSession,
    action: WhatsappAction
  ): Promise<WhatsappSession> {
    const network = action.id as NetworkProvider | undefined;
    if (!network || !NETWORK_LABELS[network]) {
      await this.sendNetworkPicker(phone);
      return { flow: "bills", step: "data_network", data: {} };
    }
    return this.showDataPlans(phone, network);
  }

  private async showDataPlans(
    phone: string,
    network: NetworkProvider
  ): Promise<WhatsappSession> {
    const variations = await this.billsService.listDataPlans(network);
    if (variations.length === 0) {
      await this.whatsappService.sendText(
        phone,
        "No data plans are available for that network right now."
      );
      await this.sendSubmenu(phone);
      return { flow: "bills" };
    }

    const shown = variations.slice(0, MAX_PLAN_ROWS);
    await this.whatsappService.sendList(
      phone,
      `${NETWORK_LABELS[network]} data plans${variations.length > MAX_PLAN_ROWS ? ` (showing ${MAX_PLAN_ROWS})` : ""}`,
      "Choose",
      [
        {
          title: "Data plans",
          rows: shown.map((variation) => ({
            id: variation.variation_code,
            title: variation.name.slice(0, 24),
            description: `₦${variation.variation_amount}`,
          })),
        },
      ]
    );
    return {
      flow: "bills",
      step: "data_plan",
      data: { network, variations: shown },
    };
  }

  private async handleDataPlan(
    phone: string,
    session: WhatsappSession,
    action: WhatsappAction
  ): Promise<WhatsappSession> {
    const variations: VtpassVariation[] = session.data?.variations ?? [];
    const variation = variations.find((v) => v.variation_code === action.id);
    if (!variation) {
      return this.showDataPlans(
        phone,
        session.data?.network as NetworkProvider
      );
    }
    await this.whatsappService.sendText(
      phone,
      "What phone number is this data bundle for? (e.g. 08012345678)"
    );
    return {
      flow: "bills",
      step: "data_phone",
      data: {
        network: session.data?.network,
        variationCode: variation.variation_code,
        planName: variation.name,
        planAmount: variation.variation_amount,
      },
    };
  }

  private async handleDataPhone(
    phone: string,
    session: WhatsappSession,
    action: WhatsappAction
  ): Promise<WhatsappSession> {
    const billPhone = normalizePhone(action.text ?? "");
    if (!PHONE_REGEX.test(billPhone)) {
      await this.whatsappService.sendText(
        phone,
        "That doesn't look like a valid phone number - try again (e.g. 08012345678)."
      );
      return session;
    }
    const data = { ...session.data, billPhone };
    await this.whatsappService.sendText(
      phone,
      `Buy "${data.planName}" (₦${data.planAmount}) on ${NETWORK_LABELS[data.network as NetworkProvider]} for ${billPhone}?`
    );
    await this.whatsappService.sendButtons(phone, "Confirm?", [
      { id: "bill_confirm", title: "Confirm" },
      { id: "bill_cancel", title: "Cancel" },
    ]);
    return { flow: "bills", step: "data_confirm", data };
  }

  private async handleDataConfirm(
    user: User,
    phone: string,
    session: WhatsappSession,
    action: WhatsappAction
  ): Promise<WhatsappSession> {
    if (action.id !== "bill_confirm") {
      await this.whatsappService.sendText(phone, "Okay, cancelled.");
      return this.start(user, phone);
    }

    const data = session.data ?? {};
    await this.billsService.purchaseData(
      user.id,
      data.network,
      data.billPhone,
      data.variationCode
    );
    await this.whatsappService.sendText(phone, "Data purchase successful!");
    return this.start(user, phone);
  }
}
