import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { Request as ExpressRequest, Response as ExpressResponse } from "express";
import { WhatsappRouterService } from "./whatsapp-router.service";

@ApiExcludeController()
@Controller("whatsapp")
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(
    private configService: ConfigService,
    private routerService: WhatsappRouterService
  ) {}

  /**
   * Meta's one-time webhook verification handshake. Must reply with the bare
   * `hub.challenge` string as the response body (not the app's global
   * {success, data} JSON envelope), so this bypasses TransformInterceptor by
   * writing directly to the raw response via @Res().
   */
  @Get("webhook")
  verifyWebhook(
    @Query("hub.mode") mode: string,
    @Query("hub.verify_token") token: string,
    @Query("hub.challenge") challenge: string,
    @Res() res: ExpressResponse
  ) {
    const expected = this.configService.get<string>("WHATSAPP_VERIFY_TOKEN");
    if (mode === "subscribe" && expected && token === expected) {
      res.status(HttpStatus.OK).send(challenge);
      return;
    }
    throw new ForbiddenException("Webhook verification failed");
  }

  @Post("webhook")
  @HttpCode(HttpStatus.OK)
  async receiveWebhook(
    @Body() body: any,
    @Req() req: ExpressRequest,
    @Headers("x-hub-signature-256") signature?: string
  ) {
    const appSecret = this.configService.get<string>("WHATSAPP_APP_SECRET", "");

    if (appSecret) {
      const rawBody = (req as any).rawBody as Buffer | undefined;
      const hash = crypto
        .createHmac("sha256", appSecret)
        .update(rawBody ?? JSON.stringify(body))
        .digest("hex");
      const expectedHeader = `sha256=${hash}`;

      const signatureBuffer = Buffer.from(signature ?? "", "utf8");
      const expectedBuffer = Buffer.from(expectedHeader, "utf8");
      const isValid =
        signatureBuffer.length === expectedBuffer.length &&
        crypto.timingSafeEqual(signatureBuffer, expectedBuffer);

      if (!isValid) {
        this.logger.warn("Rejected WhatsApp webhook with invalid signature");
        // Ack (200) without processing rather than 401/403 - Meta retries
        // non-2xx responses, and a spoofed request doesn't deserve a retry-storm.
        return { received: true };
      }
    }

    try {
      await this.routerService.handleWebhookPayload(body);
    } catch (error: any) {
      this.logger.error(
        `Failed to process WhatsApp webhook payload: ${error.message}`,
        error.stack
      );
    }

    return { received: true };
  }
}
