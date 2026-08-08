import { Injectable, BadRequestException } from "@nestjs/common";
import { PaystackService } from "./services/paystack.service";

/**
 * Resolves a country's configured `paymentGatewayProvider` (see
 * CountryConfig) to the service that actually talks to that gateway.
 * Paystack is the only real implementation today - this exists so that
 * assigning a country to any other provider fails loudly (instead of
 * silently charging through Paystack) until that provider is actually
 * integrated, rather than pretending multi-gateway support already works.
 */
@Injectable()
export class PaymentGatewayRegistry {
  constructor(private paystackService: PaystackService) {}

  resolve(provider: string): PaystackService {
    switch (provider) {
      case "paystack":
        return this.paystackService;
      default:
        throw new BadRequestException(
          `Payment gateway "${provider}" is not supported yet - only "paystack" is integrated.`
        );
    }
  }
}
