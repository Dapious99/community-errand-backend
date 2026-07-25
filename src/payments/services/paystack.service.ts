import { Injectable, BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";

interface PaystackInitializeResponse {
  status: boolean;
  message: string;
  data: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data: {
    amount: number;
    currency: string;
    status: string;
    reference: string;
    customer: any;
  };
}

interface PaystackBank {
  name: string;
  code: string;
}

interface PaystackTransferRecipientResponse {
  status: boolean;
  message: string;
  data: {
    recipient_code: string;
  };
}

interface PaystackTransferResponse {
  status: boolean;
  message: string;
  data: {
    reference: string;
    status: string;
    transfer_code: string;
  };
}

@Injectable()
export class PaystackService {
  private readonly secretKey: string;
  private readonly publicKey: string;
  private readonly baseUrl = "https://api.paystack.co";

  constructor(private configService: ConfigService) {
    this.secretKey = this.configService.get<string>("PAYSTACK_SECRET_KEY", "");
    this.publicKey = this.configService.get<string>("PAYSTACK_PUBLIC_KEY", "");
  }

  async initializePayment(
    email: string,
    amount: number,
    reference: string,
    metadata?: Record<string, any>
  ): Promise<PaystackInitializeResponse> {
    try {
      const response = await axios.post<PaystackInitializeResponse>(
        `${this.baseUrl}/transaction/initialize`,
        {
          email,
          amount: amount * 100, // Convert to kobo
          reference,
          metadata,
        },
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      return response.data;
    } catch (error: any) {
      throw new BadRequestException(
        error.response?.data?.message || "Failed to initialize payment"
      );
    }
  }

  async verifyPayment(reference: string): Promise<PaystackVerifyResponse> {
    try {
      const response = await axios.get<PaystackVerifyResponse>(
        `${this.baseUrl}/transaction/verify/${reference}`,
        {
          headers: {
            Authorization: `Bearer ${this.secretKey}`,
          },
        }
      );

      return response.data;
    } catch (error: any) {
      throw new BadRequestException(
        error.response?.data?.message || "Failed to verify payment"
      );
    }
  }

  getPublicKey(): string {
    return this.publicKey;
  }

  async resolveBankCode(bankName: string): Promise<string | null> {
    try {
      const response = await axios.get<{
        status: boolean;
        data: PaystackBank[];
      }>(`${this.baseUrl}/bank`, {
        headers: { Authorization: `Bearer ${this.secretKey}` },
        params: { country: "nigeria" },
      });

      const normalizedTarget = bankName.trim().toLowerCase();
      const match = response.data.data.find(
        (bank) =>
          bank.name.toLowerCase() === normalizedTarget ||
          bank.name.toLowerCase().includes(normalizedTarget)
      );

      return match?.code ?? null;
    } catch (error) {
      return null;
    }
  }

  async createTransferRecipient(
    name: string,
    accountNumber: string,
    bankCode: string
  ): Promise<string> {
    const response = await axios.post<PaystackTransferRecipientResponse>(
      `${this.baseUrl}/transferrecipient`,
      {
        type: "nuban",
        name,
        account_number: accountNumber,
        bank_code: bankCode,
        currency: "NGN",
      },
      {
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.data.recipient_code;
  }

  async initiateTransfer(
    recipientCode: string,
    amount: number,
    reason: string,
    reference: string
  ): Promise<PaystackTransferResponse> {
    const response = await axios.post<PaystackTransferResponse>(
      `${this.baseUrl}/transfer`,
      {
        source: "balance",
        amount: Math.round(amount * 100), // Convert to kobo
        recipient: recipientCode,
        reason,
        reference,
      },
      {
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data;
  }

  async refundTransaction(reference: string, amount?: number): Promise<any> {
    const response = await axios.post(
      `${this.baseUrl}/refund`,
      {
        transaction: reference,
        ...(amount !== undefined ? { amount: Math.round(amount * 100) } : {}),
      },
      {
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data;
  }
}
