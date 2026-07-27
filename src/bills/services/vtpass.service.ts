import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";

export interface VtpassVariation {
  variation_code: string;
  name: string;
  variation_amount: string;
  fixedPrice?: string;
}

interface VtpassServiceVariationsResponse {
  response_description: string;
  content: {
    ServiceName: string;
    serviceID: string;
    convinience_fee?: string;
    variations: VtpassVariation[];
  };
}

export interface VtpassPurchaseResponse {
  code: string;
  response_description: string;
  requestId: string;
  amount?: string;
  transaction_date?: string;
  content?: {
    transactions?: {
      status: string;
      product_name?: string;
      unit_price?: string;
      quantity?: number;
      commission?: string;
      total_amount?: string;
      transactionId?: string;
    };
  };
}

@Injectable()
export class VtpassService {
  private readonly logger = new Logger(VtpassService.name);
  private readonly apiKey?: string;
  private readonly secretKey?: string;
  private readonly publicKey?: string;
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>("VTPASS_API_KEY");
    this.secretKey = this.configService.get<string>("VTPASS_SECRET_KEY");
    this.publicKey = this.configService.get<string>("VTPASS_PUBLIC_KEY");

    const env = this.configService.get<string>("VTPASS_ENV", "sandbox");
    this.baseUrl =
      env === "live"
        ? "https://vtpass.com/api"
        : "https://sandbox.vtpass.com/api";

    if (!this.apiKey || !this.secretKey || !this.publicKey) {
      this.logger.warn(
        "VTPASS_API_KEY/VTPASS_SECRET_KEY/VTPASS_PUBLIC_KEY are not fully set - airtime/data bill purchases will fail until configured."
      );
    }
  }

  private assertConfigured(): void {
    if (!this.apiKey || !this.secretKey || !this.publicKey) {
      throw new BadRequestException(
        "Bill payments aren't configured yet (missing VTpass credentials)."
      );
    }
  }

  /** Unique per attempt; VTpass requires it to be distinct across requests. */
  generateRequestId(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
      now.getDate()
    )}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const suffix = Math.random().toString(36).slice(2, 8);
    return `${timestamp}${suffix}`;
  }

  async getDataVariations(serviceId: string): Promise<VtpassVariation[]> {
    this.assertConfigured();

    try {
      const response = await axios.get<VtpassServiceVariationsResponse>(
        `${this.baseUrl}/service-variations`,
        {
          params: { serviceID: serviceId },
          headers: {
            "api-key": this.apiKey,
            "public-key": this.publicKey,
          },
        }
      );

      return response.data.content?.variations ?? [];
    } catch (error: any) {
      this.logger.error(
        `Failed to fetch VTpass data variations for ${serviceId}: ${error.message}`
      );
      throw new BadRequestException("Failed to fetch data plans from VTpass.");
    }
  }

  async purchase(params: {
    requestId: string;
    serviceID: string;
    phone: string;
    amount?: number;
    variationCode?: string;
    billersCode?: string;
  }): Promise<VtpassPurchaseResponse> {
    this.assertConfigured();

    const response = await axios.post<VtpassPurchaseResponse>(
      `${this.baseUrl}/pay`,
      {
        request_id: params.requestId,
        serviceID: params.serviceID,
        phone: params.phone,
        ...(params.amount !== undefined ? { amount: params.amount } : {}),
        ...(params.variationCode !== undefined
          ? { variation_code: params.variationCode }
          : {}),
        ...(params.billersCode !== undefined
          ? { billersCode: params.billersCode }
          : {}),
      },
      {
        headers: {
          "api-key": this.apiKey,
          "secret-key": this.secretKey,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data;
  }

  async requeryTransaction(requestId: string): Promise<VtpassPurchaseResponse> {
    this.assertConfigured();

    const response = await axios.post<VtpassPurchaseResponse>(
      `${this.baseUrl}/requery`,
      { request_id: requestId },
      {
        headers: {
          "api-key": this.apiKey,
          "secret-key": this.secretKey,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data;
  }
}
