import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";

export interface DojahVerificationResult {
  verified: boolean;
  data?: Record<string, any>;
  error?: string;
}

/**
 * Wraps Dojah's KYC lookup API (NIN + BVN). Verification here is only an
 * automated signal stored alongside the KYC submission for the admin
 * reviewer - it never auto-approves/rejects on its own (see
 * UsersService.approveKyc/rejectKyc), since a name/DOB mismatch can be a
 * legitimate data-entry difference that a human should still weigh in on.
 * Failures (bad keys, Dojah downtime, no match) are swallowed and logged so
 * a KYC submission never fails outright just because this lookup didn't
 * succeed - the submission still goes to the PENDING queue either way.
 */
@Injectable()
export class DojahService {
  private readonly logger = new Logger(DojahService.name);
  private readonly appId: string;
  private readonly secretKey: string;
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.appId = this.configService.get<string>("DOJAH_APP_ID", "");
    this.secretKey = this.configService.get<string>("DOJAH_SECRET_KEY", "");
    // Defaults to the sandbox host until real credentials + DOJAH_BASE_URL
    // (https://api.dojah.io) are configured.
    this.baseUrl = this.configService.get<string>(
      "DOJAH_BASE_URL",
      "https://sandbox.dojah.io"
    );
  }

  private get headers() {
    return {
      AppId: this.appId,
      Authorization: this.secretKey,
    };
  }

  async verifyNin(nin: string): Promise<DojahVerificationResult> {
    if (!this.appId || !this.secretKey) {
      return { verified: false, error: "Dojah credentials not configured" };
    }

    try {
      const response = await axios.get(`${this.baseUrl}/api/v1/kyc/nin`, {
        headers: this.headers,
        params: { nin },
      });
      return { verified: true, data: response.data?.entity ?? response.data };
    } catch (error: any) {
      const message =
        error.response?.data?.error || error.response?.data?.message || error.message;
      this.logger.warn(`Dojah NIN verification failed: ${message}`);
      return { verified: false, error: message };
    }
  }

  async verifyBvn(bvn: string): Promise<DojahVerificationResult> {
    if (!this.appId || !this.secretKey) {
      return { verified: false, error: "Dojah credentials not configured" };
    }

    try {
      const response = await axios.get(`${this.baseUrl}/api/v1/kyc/bvn/full`, {
        headers: this.headers,
        params: { bvn },
      });
      return { verified: true, data: response.data?.entity ?? response.data };
    } catch (error: any) {
      const message =
        error.response?.data?.error || error.response?.data?.message || error.message;
      this.logger.warn(`Dojah BVN verification failed: ${message}`);
      return { verified: false, error: message };
    }
  }
}
