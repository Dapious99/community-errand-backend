import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly apiKey?: string;
  private readonly fromAddress: string;
  private resend?: Resend;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>("RESEND_API_KEY");
    this.fromAddress = this.configService.get<string>(
      "MAIL_FROM_ADDRESS",
      "Community Errand <onboarding@resend.dev>"
    );

    if (!this.apiKey) {
      this.logger.warn(
        "RESEND_API_KEY is not set - emails (OTP codes, etc.) will fail to send until it's configured."
      );
    }
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    if (!this.apiKey) {
      throw new BadRequestException(
        "Email sending isn't configured yet (missing RESEND_API_KEY)."
      );
    }

    // Constructed lazily, and only once a key exists - the Resend SDK throws
    // in its constructor when the key is missing, which would otherwise crash
    // the whole app at startup rather than just this one feature.
    this.resend ??= new Resend(this.apiKey);

    try {
      const { error } = await this.resend.emails.send({
        from: this.fromAddress,
        to,
        subject,
        html,
      });

      if (error) {
        throw new Error(error.message);
      }
    } catch (error: any) {
      this.logger.error(`Failed to send email to ${to}: ${error.message}`);
      throw new BadRequestException("Failed to send email. Please try again.");
    }
  }
}
