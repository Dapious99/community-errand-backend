import { Injectable } from "@nestjs/common";
import { UsersService } from "../../users/users.service";
import { RatingsService } from "../../ratings/ratings.service";
import { User } from "../../users/entities/user.entity";
import { WhatsappService } from "../whatsapp.service";
import { WhatsappSession } from "../whatsapp-session.service";

const SUBMENU_ROWS = [
  {
    id: "acct_profile",
    title: "View profile",
    description: "Name, role, rating, and more",
  },
  {
    id: "acct_ratings",
    title: "Ratings",
    description: "Your rating breakdown",
  },
  {
    id: "acct_notifications",
    title: "Notification preferences",
    description: "Choose what you get notified about",
  },
  { id: "acct_back", title: "Back to main menu" },
];

type NotificationField =
  | "notifyNewErrandsNearby"
  | "notifyBoostedErrandAlerts"
  | "notifyNewMessages";

const TOGGLE_FIELD: Record<string, NotificationField> = {
  notif_toggle_nearby: "notifyNewErrandsNearby",
  notif_toggle_boosted: "notifyBoostedErrandAlerts",
  notif_toggle_messages: "notifyNewMessages",
};

/** Account operations reachable from the WhatsApp main menu: profile, ratings, notification prefs. */
@Injectable()
export class AccountFlow {
  constructor(
    private usersService: UsersService,
    private ratingsService: RatingsService,
    private whatsappService: WhatsappService
  ) {}

  async start(user: User, phone: string): Promise<WhatsappSession> {
    await this.sendSubmenu(phone);
    return { flow: "account" };
  }

  /**
   * Handles a reply while the session is inside this flow. Returns the next
   * session to persist, or null to signal "exit to main menu" (the router
   * clears the session and re-sends the main menu in that case).
   */
  async handle(
    user: User,
    session: WhatsappSession,
    phone: string,
    actionId: string | undefined
  ): Promise<WhatsappSession | null> {
    if (session.step === "notifications") {
      return this.handleNotificationsStep(user, phone, actionId);
    }

    switch (actionId) {
      case "acct_profile":
        await this.sendProfile(user, phone);
        await this.sendSubmenu(phone);
        return { flow: "account" };
      case "acct_ratings":
        await this.sendRatings(user, phone);
        await this.sendSubmenu(phone);
        return { flow: "account" };
      case "acct_notifications":
        await this.sendNotificationsMenu(user.id, phone);
        return { flow: "account", step: "notifications" };
      case "acct_back":
        return null;
      default:
        await this.sendSubmenu(phone);
        return { flow: "account" };
    }
  }

  private async sendSubmenu(phone: string): Promise<void> {
    await this.whatsappService.sendList(
      phone,
      "Account - what would you like to do?",
      "Choose",
      [{ title: "Account", rows: SUBMENU_ROWS }]
    );
  }

  private async sendProfile(user: User, phone: string): Promise<void> {
    const lines = [
      `*${user.name}*`,
      `Role: ${user.role}`,
      `Email: ${user.email}`,
      user.phone ? `Phone: ${user.phone}` : null,
      `Verified: ${user.verified ? "Yes" : "No"}`,
      `Rating: ${user.ratingAvg || 0} / 5`,
      `Member since: ${user.createdAt.toDateString()}`,
    ].filter((line): line is string => line !== null);
    await this.whatsappService.sendText(phone, lines.join("\n"));
  }

  private async sendRatings(user: User, phone: string): Promise<void> {
    const stats = await this.ratingsService.getStats(user.id);
    const dist = stats.ratingDistribution as Record<number, number>;
    const lines = [
      `Average rating: ${stats.averageRating} / 5 (${stats.totalRatings} ratings)`,
      ...[5, 4, 3, 2, 1].map((star) => `${star}★: ${dist[star] ?? 0}`),
    ];
    await this.whatsappService.sendText(phone, lines.join("\n"));
  }

  private async sendNotificationsMenu(
    userId: string,
    phone: string
  ): Promise<void> {
    const prefs = await this.usersService.getNotificationPreferences(userId);
    const rows = [
      {
        id: "notif_toggle_nearby",
        title: `Nearby errands: ${prefs.notifyNewErrandsNearby ? "ON" : "OFF"}`,
        description: "Tap to toggle",
      },
      {
        id: "notif_toggle_boosted",
        title: `Boosted alerts: ${prefs.notifyBoostedErrandAlerts ? "ON" : "OFF"}`,
        description: "Tap to toggle",
      },
      {
        id: "notif_toggle_messages",
        title: `New messages: ${prefs.notifyNewMessages ? "ON" : "OFF"}`,
        description: "Tap to toggle",
      },
      { id: "notif_back", title: "Back" },
    ];
    await this.whatsappService.sendList(
      phone,
      "Notification preferences - tap one to toggle it",
      "Choose",
      [{ title: "Preferences", rows }]
    );
  }

  private async handleNotificationsStep(
    user: User,
    phone: string,
    actionId: string | undefined
  ): Promise<WhatsappSession | null> {
    if (actionId === "notif_back") {
      await this.sendSubmenu(phone);
      return { flow: "account" };
    }

    const field = TOGGLE_FIELD[actionId ?? ""];
    if (field) {
      const current = await this.usersService.getNotificationPreferences(
        user.id
      );
      await this.usersService.updateNotificationPreferences(user.id, {
        [field]: !current[field],
      });
    }

    await this.sendNotificationsMenu(user.id, phone);
    return { flow: "account", step: "notifications" };
  }
}
