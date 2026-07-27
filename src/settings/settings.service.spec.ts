import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { SettingsService } from "./settings.service";
import { PlatformSetting } from "./entities/platform-setting.entity";

describe("SettingsService", () => {
  let service: SettingsService;
  let repo: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SettingsService,
        {
          provide: getRepositoryToken(PlatformSetting),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn((data) => data),
            save: jest.fn((data) => Promise.resolve(data)),
            find: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(SettingsService);
    repo = module.get(getRepositoryToken(PlatformSetting));
  });

  describe("get", () => {
    it("returns the fallback when the key does not exist", async () => {
      repo.findOne.mockResolvedValue(null);

      const result = await service.get("ai_boost_price_ngn", 250000);

      expect(result).toBe(250000);
    });

    it("returns the parsed JSON value when the key exists", async () => {
      repo.findOne.mockResolvedValue({
        key: "ai_boost_price_ngn",
        value: "150000",
      });

      const result = await service.get("ai_boost_price_ngn", 250000);

      expect(result).toBe(150000);
    });

    it("returns the fallback if the stored value is not valid JSON", async () => {
      repo.findOne.mockResolvedValue({ key: "broken", value: "not-json{" });

      const result = await service.get("broken", "default");

      expect(result).toBe("default");
    });
  });

  describe("set", () => {
    it("creates a new row when the key does not exist", async () => {
      repo.findOne.mockResolvedValue(null);

      await service.set("ai_boost_price_ngn", 150000, "Boost price");

      expect(repo.create).toHaveBeenCalledWith({
        key: "ai_boost_price_ngn",
        value: "150000",
        description: "Boost price",
      });
    });

    it("updates the existing row in place, preserving description when omitted", async () => {
      const existing = {
        key: "ai_boost_price_ngn",
        value: "250000",
        description: "Old desc",
      };
      repo.findOne.mockResolvedValue(existing);

      await service.set("ai_boost_price_ngn", 150000);

      expect(existing.value).toBe("150000");
      expect(existing.description).toBe("Old desc");
      expect(repo.save).toHaveBeenCalledWith(existing);
    });
  });

  describe("list", () => {
    it("returns all settings ordered by key", async () => {
      repo.find.mockResolvedValue([{ key: "a" }, { key: "b" }]);

      const result = await service.list();

      expect(repo.find).toHaveBeenCalledWith({ order: { key: "ASC" } });
      expect(result).toHaveLength(2);
    });
  });
});
