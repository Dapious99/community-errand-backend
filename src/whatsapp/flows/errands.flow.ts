import { Injectable } from "@nestjs/common";
import { ErrandsService } from "../../errands/errands.service";
import { Errand, ErrandCategory, ErrandStatus } from "../../errands/entities/errand.entity";
import { LocationType } from "../../errands/entities/location.entity";
import { User } from "../../users/entities/user.entity";
import { WhatsappService, WhatsappButton } from "../whatsapp.service";
import { WhatsappSession } from "../whatsapp-session.service";

export interface WhatsappAction {
  id?: string;
  text?: string;
}

const SUBMENU_ROWS = [
  {
    id: "err_post",
    title: "Post an errand",
    description: "Get something done",
  },
  {
    id: "err_browse",
    title: "Browse open errands",
    description: "Find work nearby",
  },
  {
    id: "err_my",
    title: "My errands",
    description: "Track what you've posted or picked up",
  },
  { id: "err_back", title: "Back to main menu" },
];

const CATEGORY_LABELS: Record<ErrandCategory, string> = {
  [ErrandCategory.DELIVERY]: "Delivery",
  [ErrandCategory.BUY_FOR_ME]: "Buy for me",
  [ErrandCategory.QUEUE]: "Queue for me",
  [ErrandCategory.REPAIR]: "Repair",
  [ErrandCategory.CUSTOM]: "Custom / other",
};

const STATUS_LABELS: Record<ErrandStatus, string> = {
  [ErrandStatus.OPEN]: "Open",
  [ErrandStatus.PENDING]: "Pending applicants",
  [ErrandStatus.ACCEPTED]: "Accepted",
  [ErrandStatus.IN_PROGRESS]: "In progress",
  [ErrandStatus.COMPLETED]: "Completed",
  [ErrandStatus.CANCELLED]: "Cancelled",
};

const MAX_LIST_ROWS = 10; // WhatsApp's own cap on rows per list message

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Errands over WhatsApp: post (a short multi-step form), browse open
 * errands with a direct "Accept", and track/manage your own. Deliberately
 * scoped down from the full mobile feature set for a chat interface: no
 * dropoff location, tip, urgency, time windows, or the bidding/application
 * review flow (acceptApplication/declineApplication) - posting always
 * creates a single-pickup, default-urgency errand, and picking up work
 * always goes through the instant PATCH /:id/accept equivalent. Those can
 * be added as further steps later without touching the plumbing here.
 */
@Injectable()
export class ErrandsFlow {
  constructor(
    private errandsService: ErrandsService,
    private whatsappService: WhatsappService
  ) {}

  async start(user: User, phone: string): Promise<WhatsappSession> {
    await this.sendSubmenu(phone);
    return { flow: "errands" };
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
      case "post_category":
        return this.handlePostCategory(phone, session, action);
      case "post_title":
        return this.handlePostTitle(phone, session, action);
      case "post_description":
        return this.handlePostDescription(phone, session, action);
      case "post_price":
        return this.handlePostPrice(phone, session, action);
      case "post_location":
        return this.handlePostLocation(phone, session, action);
      case "post_confirm":
        return this.handlePostConfirm(user, phone, session, action);
      case "browse_list":
        return this.handleBrowseList(user, phone, action);
      case "browse_detail":
        return this.handleBrowseDetail(user, phone, session, action);
      case "my_list":
        return this.handleMyList(user, phone, action);
      case "my_detail":
        return this.handleMyDetail(user, phone, session, action);
      default:
        return this.start(user, phone);
    }
  }

  // ---------------------------------------------------------------- submenu

  private async sendSubmenu(phone: string): Promise<void> {
    await this.whatsappService.sendList(
      phone,
      "Errands - what would you like to do?",
      "Choose",
      [{ title: "Errands", rows: SUBMENU_ROWS }]
    );
  }

  private async handleSubmenu(
    user: User,
    phone: string,
    action: WhatsappAction
  ): Promise<WhatsappSession | null> {
    switch (action.id) {
      case "err_post":
        await this.sendCategoryPicker(phone);
        return { flow: "errands", step: "post_category", data: {} };
      case "err_browse":
        return this.showBrowseList(user, phone);
      case "err_my":
        return this.showMyList(user, phone);
      case "err_back":
        return null;
      default:
        await this.sendSubmenu(phone);
        return { flow: "errands" };
    }
  }

  // ------------------------------------------------------------ post flow

  private async sendCategoryPicker(phone: string): Promise<void> {
    await this.whatsappService.sendList(
      phone,
      "What kind of errand is this?",
      "Choose",
      [
        {
          title: "Category",
          rows: Object.entries(CATEGORY_LABELS).map(([value, title]) => ({
            id: value,
            title,
          })),
        },
      ]
    );
  }

  private async handlePostCategory(
    phone: string,
    session: WhatsappSession,
    action: WhatsappAction
  ): Promise<WhatsappSession> {
    const category = action.id as ErrandCategory | undefined;
    if (!category || !CATEGORY_LABELS[category]) {
      await this.sendCategoryPicker(phone);
      return { flow: "errands", step: "post_category", data: {} };
    }
    await this.whatsappService.sendText(
      phone,
      'Got it. What\'s a short title for this errand? (e.g. "Pick up documents from Ikeja")'
    );
    return { flow: "errands", step: "post_title", data: { category } };
  }

  private async handlePostTitle(
    phone: string,
    session: WhatsappSession,
    action: WhatsappAction
  ): Promise<WhatsappSession> {
    const title = (action.text ?? "").trim();
    if (title.length < 3) {
      await this.whatsappService.sendText(
        phone,
        "That title's a bit short - give me at least 3 characters."
      );
      return session;
    }
    await this.whatsappService.sendText(
      phone,
      "Now describe what needs to be done, in a bit more detail (at least 10 characters)."
    );
    return {
      ...session,
      step: "post_description",
      data: { ...session.data, title },
    };
  }

  private async handlePostDescription(
    phone: string,
    session: WhatsappSession,
    action: WhatsappAction
  ): Promise<WhatsappSession> {
    const description = (action.text ?? "").trim();
    if (description.length < 10) {
      await this.whatsappService.sendText(
        phone,
        "Add a bit more detail - at least 10 characters."
      );
      return session;
    }
    await this.whatsappService.sendText(
      phone,
      "What's the price, in Naira? (numbers only, e.g. 2000)"
    );
    return {
      ...session,
      step: "post_price",
      data: { ...session.data, description },
    };
  }

  private async handlePostPrice(
    phone: string,
    session: WhatsappSession,
    action: WhatsappAction
  ): Promise<WhatsappSession> {
    const price = Number((action.text ?? "").replace(/[^\d.]/g, ""));
    if (!price || price < 1 || price > 10_000_000) {
      await this.whatsappService.sendText(
        phone,
        "Enter a valid price between ₦1 and ₦10,000,000 (numbers only)."
      );
      return session;
    }
    await this.whatsappService.sendText(
      phone,
      'Where should the runner pick this up from? (e.g. "Shoprite, Lekki Phase 1")'
    );
    return {
      ...session,
      step: "post_location",
      data: { ...session.data, price },
    };
  }

  private async handlePostLocation(
    phone: string,
    session: WhatsappSession,
    action: WhatsappAction
  ): Promise<WhatsappSession> {
    const pickupLabel = (action.text ?? "").trim();
    if (pickupLabel.length < 3) {
      await this.whatsappService.sendText(
        phone,
        "That location's too short - add a bit more detail."
      );
      return session;
    }
    const data = { ...session.data, pickupLabel };
    await this.sendPostSummary(phone, data);
    return { ...session, step: "post_confirm", data };
  }

  private async sendPostSummary(
    phone: string,
    data: Record<string, any>
  ): Promise<void> {
    const lines = [
      "Here's what you're posting:",
      `*${data.title}*`,
      data.description,
      `Category: ${CATEGORY_LABELS[data.category as ErrandCategory]}`,
      `Price: ₦${data.price}`,
      `Pickup: ${data.pickupLabel}`,
      "",
      "This will be charged to your wallet balance now.",
    ];
    await this.whatsappService.sendText(phone, lines.join("\n"));
    await this.whatsappService.sendButtons(phone, "Post this errand?", [
      { id: "err_confirm_post", title: "Confirm" },
      { id: "err_cancel_post", title: "Cancel" },
    ]);
  }

  private async handlePostConfirm(
    user: User,
    phone: string,
    session: WhatsappSession,
    action: WhatsappAction
  ): Promise<WhatsappSession> {
    if (action.id === "err_cancel_post") {
      await this.whatsappService.sendText(phone, "Okay, discarded that draft.");
      return this.start(user, phone);
    }

    if (action.id !== "err_confirm_post") {
      await this.sendPostSummary(phone, session.data ?? {});
      return session;
    }

    const data = session.data ?? {};
    // Any failure here (most commonly insufficient wallet balance) is an
    // HttpException that WhatsappRouterService catches and relays as-is -
    // ErrandsService's messages are already written to be shown to the user.
    await this.errandsService.create(
      {
        title: data.title,
        description: data.description,
        category: data.category,
        price: data.price,
        locations: [{ type: LocationType.PICKUP, label: data.pickupLabel }],
      },
      user.id,
      user.email
    );

    await this.whatsappService.sendText(
      phone,
      "Errand posted! Nearby runners will be notified."
    );
    return this.start(user, phone);
  }

  // --------------------------------------------------------------- browse

  private async showBrowseList(
    user: User,
    phone: string
  ): Promise<WhatsappSession> {
    const { data } = await this.errandsService.findAll(
      { status: ErrandStatus.OPEN, limit: MAX_LIST_ROWS, sortBy: "newest" },
      user.id
    );

    if (data.length === 0) {
      await this.whatsappService.sendText(
        phone,
        "No open errands right now - check back soon."
      );
      await this.sendSubmenu(phone);
      return { flow: "errands" };
    }

    await this.whatsappService.sendList(
      phone,
      `Open errands near you${data.length >= MAX_LIST_ROWS ? ` (showing the ${MAX_LIST_ROWS} most recent)` : ""}`,
      "View",
      [
        {
          title: "Open errands",
          rows: data.map((errand) => ({
            id: errand.id,
            title: truncate(errand.title, 24),
            description: `₦${errand.price} · ${CATEGORY_LABELS[errand.category]}`,
          })),
        },
      ]
    );
    return { flow: "errands", step: "browse_list" };
  }

  private async handleBrowseList(
    user: User,
    phone: string,
    action: WhatsappAction
  ): Promise<WhatsappSession> {
    if (!action.id) {
      return this.showBrowseList(user, phone);
    }

    const errand = await this.errandsService.findOne(action.id);
    const actions: WhatsappButton[] =
      errand.status === ErrandStatus.OPEN && errand.requesterId !== user.id
        ? [
            { id: "err_accept", title: "Accept" },
            { id: "err_back", title: "Back" },
          ]
        : [{ id: "err_back", title: "Back" }];

    await this.sendErrandDetail(phone, errand, actions);
    return {
      flow: "errands",
      step: "browse_detail",
      data: { selectedErrandId: action.id },
    };
  }

  private async handleBrowseDetail(
    user: User,
    phone: string,
    session: WhatsappSession,
    action: WhatsappAction
  ): Promise<WhatsappSession> {
    const errandId = session.data?.selectedErrandId;
    if (action.id === "err_accept" && errandId) {
      await this.errandsService.acceptErrand(errandId, user.id, user.role);
      await this.whatsappService.sendText(
        phone,
        "You've got it! Check 'My errands' to track it."
      );
      await this.sendSubmenu(phone);
      return { flow: "errands" };
    }
    return this.showBrowseList(user, phone);
  }

  // ------------------------------------------------------------- my errands

  private async showMyList(
    user: User,
    phone: string
  ): Promise<WhatsappSession> {
    const errands = await this.errandsService.findMyErrands(user.id);

    if (errands.length === 0) {
      await this.whatsappService.sendText(
        phone,
        "You haven't posted or picked up any errands yet."
      );
      await this.sendSubmenu(phone);
      return { flow: "errands" };
    }

    const shown = errands.slice(0, MAX_LIST_ROWS);
    await this.whatsappService.sendList(
      phone,
      `Your errands${errands.length > MAX_LIST_ROWS ? ` (showing the ${MAX_LIST_ROWS} most recent)` : ""}`,
      "View",
      [
        {
          title: "My errands",
          rows: shown.map((errand) => ({
            id: errand.id,
            title: truncate(errand.title, 24),
            description: `${STATUS_LABELS[errand.status]} · ₦${errand.price}`,
          })),
        },
      ]
    );
    return { flow: "errands", step: "my_list" };
  }

  private async handleMyList(
    user: User,
    phone: string,
    action: WhatsappAction
  ): Promise<WhatsappSession> {
    if (!action.id) {
      return this.showMyList(user, phone);
    }

    const errand = await this.errandsService.findOne(action.id);
    await this.sendErrandDetail(
      phone,
      errand,
      this.myErrandActions(errand, user.id)
    );
    return {
      flow: "errands",
      step: "my_detail",
      data: { selectedErrandId: action.id },
    };
  }

  private myErrandActions(errand: Errand, userId: string): WhatsappButton[] {
    const actions: WhatsappButton[] = [];
    const isRequester = errand.requesterId === userId;

    if (
      isRequester &&
      (errand.status === ErrandStatus.OPEN ||
        errand.status === ErrandStatus.PENDING)
    ) {
      actions.push({ id: "err_cancel", title: "Cancel" });
    }
    if (errand.status === ErrandStatus.ACCEPTED) {
      actions.push({ id: "err_in_progress", title: "Mark in progress" });
    }
    if (errand.status === ErrandStatus.IN_PROGRESS) {
      actions.push({ id: "err_complete", title: "Mark completed" });
    }
    actions.push({ id: "err_back", title: "Back" });
    return actions;
  }

  private async handleMyDetail(
    user: User,
    phone: string,
    session: WhatsappSession,
    action: WhatsappAction
  ): Promise<WhatsappSession> {
    const errandId = session.data?.selectedErrandId;
    if (!errandId) {
      return this.showMyList(user, phone);
    }

    switch (action.id) {
      case "err_cancel":
        await this.errandsService.cancel(errandId, user.id);
        await this.whatsappService.sendText(
          phone,
          "Errand cancelled - your payment has been refunded to your wallet."
        );
        break;
      case "err_in_progress":
        await this.errandsService.updateStatus(
          errandId,
          { status: ErrandStatus.IN_PROGRESS },
          user.id
        );
        await this.whatsappService.sendText(phone, "Marked as in progress.");
        break;
      case "err_complete":
        await this.errandsService.updateStatus(
          errandId,
          { status: ErrandStatus.COMPLETED },
          user.id
        );
        await this.whatsappService.sendText(
          phone,
          "Marked as completed - payout is on its way."
        );
        break;
      default:
        break;
    }

    return this.showMyList(user, phone);
  }

  // --------------------------------------------------------------- shared

  private async sendErrandDetail(
    phone: string,
    errand: Errand,
    actions: WhatsappButton[]
  ): Promise<void> {
    const pickup = errand.locations?.find(
      (location) => location.type === LocationType.PICKUP
    );
    const lines = [
      `*${errand.title}*`,
      errand.description,
      `Category: ${CATEGORY_LABELS[errand.category]}`,
      `Price: ₦${errand.price}`,
      pickup ? `Pickup: ${pickup.label}` : undefined,
      `Status: ${STATUS_LABELS[errand.status]}`,
    ].filter((line): line is string => Boolean(line));

    await this.whatsappService.sendText(phone, lines.join("\n"));
    if (actions.length > 0) {
      await this.whatsappService.sendButtons(
        phone,
        "What would you like to do?",
        actions
      );
    }
  }
}
