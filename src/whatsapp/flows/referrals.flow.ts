import { Injectable } from "@nestjs/common";
import { ReferralsService } from "../../referrals/referrals.service";
import { User } from "../../users/entities/user.entity";
import { WhatsappService } from "../whatsapp.service";
import { WhatsappSession } from "../whatsapp-session.service";

/** Single-screen, read-only referral summary - simplest flow in the module, no sub-steps. */
@Injectable()
export class ReferralsFlow {
  constructor(
    private referralsService: ReferralsService,
    private whatsappService: WhatsappService
  ) {}

  async start(user: User, phone: string): Promise<WhatsappSession> {
    const stats = await this.referralsService.getStats(user.id);
    const lines = [
      `Your referral code: *${stats.referralCode}*`,
      "",
      `Pending: ${stats.pending}`,
      `Completed: ${stats.completed}`,
      `Void: ${stats.void}`,
      "",
      "A referral pays out once the friend you referred completes their first errand - and only counts if you were an active Pro subscriber when they signed up.",
      "",
      "Reply with anything to go back to the main menu.",
    ];
    await this.whatsappService.sendText(phone, lines.join("\n"));
    return { flow: "referrals" };
  }

  /** Any reply while on this screen just exits back to the main menu. */
  async handle(): Promise<WhatsappSession | null> {
    return null;
  }
}
