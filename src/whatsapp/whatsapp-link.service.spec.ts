import { Test, TestingModule } from "@nestjs/testing";
import { WhatsappLinkService } from "./whatsapp-link.service";
import { RedisService } from "../common/redis/redis.service";
import { SettingsService } from "../settings/settings.service";

describe("WhatsappLinkService", () => {
  let service: WhatsappLinkService;
  let redisService: jest.Mocked<RedisService>;
  let settingsService: jest.Mocked<SettingsService>;
  let store: Map<string, string>;

  beforeEach(async () => {
    store = new Map();
    redisService = {
      set: jest.fn((key: string, value: string) => {
        store.set(key, value);
        return Promise.resolve();
      }),
      get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
      del: jest.fn((...keys: string[]) => {
        keys.forEach((key) => store.delete(key));
        return Promise.resolve();
      }),
      incr: jest.fn((key: string) => {
        const next = (parseInt(store.get(key) ?? "0", 10) + 1).toString();
        store.set(key, next);
        return Promise.resolve(parseInt(next, 10));
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappLinkService,
        { provide: RedisService, useValue: redisService },
        {
          provide: SettingsService,
          useValue: {
            get: jest.fn((key: string, fallback: any) =>
              Promise.resolve(fallback)
            ),
          },
        },
      ],
    }).compile();

    service = module.get(WhatsappLinkService);
    settingsService = module.get(SettingsService);
  });

  it("redeems a freshly generated code and links it to the issuing userId", async () => {
    const code = await service.generateCode("user-1");
    const userId = await service.redeemCode(code, "2348012345678");
    expect(userId).toBe("user-1");
  });

  it("is single-use - redeeming the same code twice fails the second time", async () => {
    const code = await service.generateCode("user-1");
    await service.redeemCode(code, "2348012345678");
    const second = await service.redeemCode(code, "2348012345678");
    expect(second).toBeNull();
  });

  it("returns null for a code that was never generated", async () => {
    const userId = await service.redeemCode("000000", "2348012345678");
    expect(userId).toBeNull();
  });

  it("rate-limits redemption attempts per phone number after 5 tries", async () => {
    const code = await service.generateCode("user-1");
    for (let i = 0; i < 5; i++) {
      await service.redeemCode("wrong-code", "2348099999999");
    }
    // The 6th attempt is rejected by the rate limit even with the right code.
    const result = await service.redeemCode(code, "2348099999999");
    expect(result).toBeNull();
  });

  it("does not rate-limit a different phone number", async () => {
    const code = await service.generateCode("user-1");
    for (let i = 0; i < 5; i++) {
      await service.redeemCode("wrong-code", "2348099999999");
    }
    const result = await service.redeemCode(code, "2348011111111");
    expect(result).toBe("user-1");
  });

  it("honors an admin-configured max-attempts override", async () => {
    settingsService.get.mockImplementation((key: string, fallback: any) =>
      Promise.resolve(key === "whatsapp_link_max_redeem_attempts" ? 1 : fallback)
    );
    const code = await service.generateCode("user-1");
    await service.redeemCode("wrong-code", "2348099999999");

    const result = await service.redeemCode(code, "2348099999999");

    expect(result).toBeNull();
  });
});
