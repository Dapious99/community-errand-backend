import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance } from "axios";

export interface WhatsappButton {
  id: string;
  /** WhatsApp caps reply button titles at 20 characters. */
  title: string;
}

export interface WhatsappListRow {
  id: string;
  title: string;
  description?: string;
}

export interface WhatsappListSection {
  title: string;
  rows: WhatsappListRow[];
}

/**
 * Thin client over the WhatsApp Cloud API message-send endpoint. Works
 * against either 360dialog (leave WHATSAPP_PHONE_NUMBER_ID unset - the
 * phone number is implied by the API key, so the path is just "/messages")
 * or Meta directly (set WHATSAPP_PHONE_NUMBER_ID - the path becomes
 * "/{phoneNumberId}/messages"). The JSON message payloads are identical
 * either way, since both speak Meta's Cloud API message schema. Both known
 * auth header styles (360dialog's D360-API-KEY, Meta's Bearer token) are
 * sent together - each provider ignores the header it doesn't use.
 */
@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);
  private client?: AxiosInstance;

  constructor(private configService: ConfigService) {}

  private getClient(): AxiosInstance {
    if (this.client) {
      return this.client;
    }

    const accessToken = this.configService.get<string>(
      "WHATSAPP_ACCESS_TOKEN"
    );
    if (!accessToken) {
      this.logger.warn(
        "WHATSAPP_ACCESS_TOKEN is not set - outbound WhatsApp messages will fail until it's configured."
      );
    }

    this.client = axios.create({
      baseURL: this.configService.get<string>(
        "WHATSAPP_API_BASE_URL",
        "https://waba-v2.360dialog.io"
      ),
      headers: accessToken
        ? {
            "D360-API-KEY": accessToken,
            Authorization: `Bearer ${accessToken}`,
          }
        : {},
    });
    return this.client;
  }

  private messagesPath(): string {
    const phoneNumberId = this.configService.get<string>(
      "WHATSAPP_PHONE_NUMBER_ID"
    );
    return phoneNumberId ? `/${phoneNumberId}/messages` : "/messages";
  }

  private async send(payload: Record<string, any>): Promise<void> {
    try {
      await this.getClient().post(this.messagesPath(), {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        ...payload,
      });
    } catch (error: any) {
      this.logger.error(
        `Failed to send WhatsApp message: ${error.response?.data ? JSON.stringify(error.response.data) : error.message}`
      );
      throw error;
    }
  }

  async sendText(to: string, body: string): Promise<void> {
    await this.send({
      to,
      type: "text",
      text: { body },
    });
  }

  /** Reply buttons - WhatsApp allows at most 3. */
  async sendButtons(
    to: string,
    bodyText: string,
    buttons: WhatsappButton[]
  ): Promise<void> {
    await this.send({
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: bodyText },
        action: {
          buttons: buttons.slice(0, 3).map((button) => ({
            type: "reply",
            reply: { id: button.id, title: button.title.slice(0, 20) },
          })),
        },
      },
    });
  }

  /** Interactive list picker - for menus with more than 3 options. */
  async sendList(
    to: string,
    bodyText: string,
    buttonLabel: string,
    sections: WhatsappListSection[]
  ): Promise<void> {
    await this.send({
      to,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: bodyText },
        action: { button: buttonLabel, sections },
      },
    });
  }

  /** Tappable external link - used for handing off to Paystack's hosted checkout, etc. */
  async sendLinkButton(
    to: string,
    bodyText: string,
    url: string,
    label: string
  ): Promise<void> {
    await this.send({
      to,
      type: "interactive",
      interactive: {
        type: "cta_url",
        body: { text: bodyText },
        action: {
          name: "cta_url",
          parameters: { display_text: label, url },
        },
      },
    });
  }
}
