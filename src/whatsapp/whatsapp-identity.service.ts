import { Injectable } from "@nestjs/common";
import { UsersService } from "../users/users.service";
import { User } from "../users/entities/user.entity";
import { WhatsappLinkService } from "./whatsapp-link.service";

/** Resolves an inbound WhatsApp phone number to an app User, and links new ones. */
@Injectable()
export class WhatsappIdentityService {
  constructor(
    private usersService: UsersService,
    private whatsappLinkService: WhatsappLinkService
  ) {}

  async resolve(phone: string): Promise<User | null> {
    return this.usersService.findByWhatsappNumber(phone);
  }

  /**
   * Attempts to link `phone` using a code the user generated in-app.
   * Returns the newly linked User on success, or null if the code was
   * wrong, expired, already used, or rate-limited.
   */
  async linkWithCode(code: string, phone: string): Promise<User | null> {
    const userId = await this.whatsappLinkService.redeemCode(code, phone);
    if (!userId) {
      return null;
    }
    return this.usersService.linkWhatsapp(userId, phone);
  }
}
