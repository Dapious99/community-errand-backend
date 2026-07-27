import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PlatformSetting } from "./entities/platform-setting.entity";

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(PlatformSetting)
    private settingsRepository: Repository<PlatformSetting>
  ) {}

  async get<T>(key: string, fallback: T): Promise<T> {
    const row = await this.settingsRepository.findOne({ where: { key } });
    if (!row) {
      return fallback;
    }
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return fallback;
    }
  }

  async set(
    key: string,
    value: unknown,
    description?: string
  ): Promise<PlatformSetting> {
    const encoded = JSON.stringify(value);
    const existing = await this.settingsRepository.findOne({ where: { key } });

    if (existing) {
      existing.value = encoded;
      if (description !== undefined) {
        existing.description = description;
      }
      return this.settingsRepository.save(existing);
    }

    const created = this.settingsRepository.create({
      key,
      value: encoded,
      description,
    });
    return this.settingsRepository.save(created);
  }

  async list(): Promise<PlatformSetting[]> {
    return this.settingsRepository.find({ order: { key: "ASC" } });
  }
}
