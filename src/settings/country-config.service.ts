import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CountryConfig } from "./entities/country-config.entity";

const DEFAULT_COUNTRY = "Nigeria";

export interface UpsertCountryConfigInput {
  currencyCode: string;
  currencySymbol: string;
  boostPrice: number;
  platformFeePercent: number;
  minWithdrawalAmount: number;
  withdrawalFeePercent: number;
  referralBonus: number;
  priorityPriceThreshold: number;
  subscriptionPrices: Record<string, number>;
  lightKycPriceThreshold: number;
  proPlatformFeePercent: number;
  surgeThresholdOpenErrands: number;
  surgeMultiplier: number;
  paymentGatewayProvider: string;
  isActive?: boolean;
}

@Injectable()
export class CountryConfigService {
  constructor(
    @InjectRepository(CountryConfig)
    private countryConfigRepository: Repository<CountryConfig>
  ) {}

  /**
   * Falls back to the default market (Nigeria) for a country that hasn't
   * been configured yet, so signing up from an unsupported country degrades
   * gracefully instead of breaking login/errand posting outright.
   */
  async get(country: string | undefined | null): Promise<CountryConfig> {
    if (country) {
      const row = await this.countryConfigRepository.findOne({
        where: { country },
      });
      if (row) return row;
    }

    const fallback = await this.countryConfigRepository.findOne({
      where: { country: DEFAULT_COUNTRY },
    });
    if (!fallback) {
      throw new NotFoundException("No country configuration available");
    }
    return fallback;
  }

  async list(): Promise<CountryConfig[]> {
    return this.countryConfigRepository.find({ order: { country: "ASC" } });
  }

  async upsert(
    country: string,
    input: UpsertCountryConfigInput
  ): Promise<CountryConfig> {
    const existing = await this.countryConfigRepository.findOne({
      where: { country },
    });

    if (existing) {
      Object.assign(existing, input);
      return this.countryConfigRepository.save(existing);
    }

    const created = this.countryConfigRepository.create({
      country,
      ...input,
    });
    return this.countryConfigRepository.save(created);
  }
}
