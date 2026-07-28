import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OtpService } from "./otp.service";
import { RedisService } from "../common/redis/redis.service";
import { MailService } from "../mail/mail.service";
import { OtpPurpose } from "./otp-purpose.enum";

describe("OtpService", () => {
  let service: OtpService;
  let redisService: jest.Mocked<RedisService>;
  let mailService: jest.Mocked<MailService>;
  let store: Map<string, string>;

  beforeEach(async () => {
    store = new Map();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpService,
        {
          provide: RedisService,
          useValue: {
            set: jest.fn((key: string, value: string) => {
              store.set(key, value);
              return Promise.resolve();
            }),
            get: jest.fn((key: string) =>
              Promise.resolve(store.get(key) ?? null)
            ),
            del: jest.fn((...keys: string[]) => {
              keys.forEach((k) => store.delete(k));
              return Promise.resolve();
            }),
            incr: jest.fn((key: string) => {
              const next = (parseInt(store.get(key) ?? "0", 10) + 1).toString();
              store.set(key, next);
              return Promise.resolve(parseInt(next, 10));
            }),
          },
        },
        {
          provide: MailService,
          useValue: { send: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((key: string, fallback?: any) => fallback) },
        },
      ],
    }).compile();

    service = module.get(OtpService);
    redisService = module.get(RedisService);
    mailService = module.get(MailService);
  });

  it("emails a 6-digit code and stores it with a 0 attempts counter", async () => {
    await service.request(
      OtpPurpose.SIGNUP_VERIFICATION,
      "user-1",
      "user@example.com"
    );

    expect(mailService.send).toHaveBeenCalledTimes(1);
    const [to, , html] = mailService.send.mock.calls[0];
    expect(to).toBe("user@example.com");
    expect(html).toMatch(/\d{6}/);
    expect(redisService.set).toHaveBeenCalledWith(
      expect.stringContaining("otp:signup_verification:user-1"),
      expect.any(String),
      600
    );
  });

  it("verifies successfully with the correct code and cleans up its keys", async () => {
    await service.request(
      OtpPurpose.PASSWORD_RESET,
      "user-1",
      "user@example.com",
      {
        hint: "reset",
      }
    );
    const [, , html] = mailService.send.mock.calls[0];
    const code = html.match(/(\d{6})/)[1];

    const metadata = await service.verify(
      OtpPurpose.PASSWORD_RESET,
      "user-1",
      code
    );

    expect(metadata).toEqual({ hint: "reset" });
    expect(store.size).toBe(0);
  });

  it("rejects an incorrect code and increments the attempt counter", async () => {
    await service.request(
      OtpPurpose.PASSWORD_RESET,
      "user-1",
      "user@example.com"
    );

    await expect(
      service.verify(OtpPurpose.PASSWORD_RESET, "user-1", "000000")
    ).rejects.toThrow(BadRequestException);

    expect(redisService.incr).toHaveBeenCalledTimes(1);
  });

  it("throws when no code was ever requested for that identifier", async () => {
    await expect(
      service.verify(OtpPurpose.PASSWORD_RESET, "ghost", "123456")
    ).rejects.toThrow(BadRequestException);
  });

  describe("resend", () => {
    it("throws when there's nothing pending to resend", async () => {
      await expect(
        service.resend(
          OtpPurpose.NEW_DEVICE_LOGIN,
          "user-1",
          "user@example.com"
        )
      ).rejects.toThrow(BadRequestException);
      expect(mailService.send).not.toHaveBeenCalled();
    });

    it("issues a fresh code, preserving the original metadata", async () => {
      await service.request(
        OtpPurpose.BANK_CHANGE,
        "user-1",
        "user@example.com",
        { pendingChanges: { bankName: "GTBank" } }
      );

      await service.resend(
        OtpPurpose.BANK_CHANGE,
        "user-1",
        "user@example.com"
      );

      expect(mailService.send).toHaveBeenCalledTimes(2);
      const [, , secondHtml] = mailService.send.mock.calls[1];
      const secondCode = secondHtml.match(/(\d{6})/)[1];

      const metadata = await service.verify(
        OtpPurpose.BANK_CHANGE,
        "user-1",
        secondCode
      );
      expect(metadata).toEqual({ pendingChanges: { bankName: "GTBank" } });
    });

    it("resets the attempts counter on resend", async () => {
      await service.request(
        OtpPurpose.NEW_DEVICE_LOGIN,
        "user-1",
        "user@example.com"
      );
      await expect(
        service.verify(OtpPurpose.NEW_DEVICE_LOGIN, "user-1", "000000")
      ).rejects.toThrow(BadRequestException);

      await service.resend(
        OtpPurpose.NEW_DEVICE_LOGIN,
        "user-1",
        "user@example.com"
      );

      const [, , html] = mailService.send.mock.calls[1];
      const code = html.match(/(\d{6})/)[1];
      await expect(
        service.verify(OtpPurpose.NEW_DEVICE_LOGIN, "user-1", code)
      ).resolves.toBeUndefined();
    });
  });

  it("invalidates the code once the max attempts are exhausted", async () => {
    await service.request(
      OtpPurpose.PASSWORD_RESET,
      "user-1",
      "user@example.com"
    );
    const [, , html] = mailService.send.mock.calls[0];
    const code = html.match(/(\d{6})/)[1];
    const wrongCode = code === "000000" ? "111111" : "000000";

    for (let i = 0; i < 5; i++) {
      await expect(
        service.verify(OtpPurpose.PASSWORD_RESET, "user-1", wrongCode)
      ).rejects.toThrow(BadRequestException);
    }

    // Even the correct code no longer works - the record was wiped after 5 misses.
    await expect(
      service.verify(OtpPurpose.PASSWORD_RESET, "user-1", code)
    ).rejects.toThrow("Too many incorrect attempts. Request a new code.");
  });
});

describe("OtpService with OTP_BYPASS enabled", () => {
  let service: OtpService;
  let redisService: jest.Mocked<RedisService>;
  let mailService: jest.Mocked<MailService>;

  const buildService = async (nodeEnv = "development") => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpService,
        {
          provide: RedisService,
          useValue: {
            set: jest.fn(),
            get: jest.fn(),
            del: jest.fn(),
            incr: jest.fn(),
          },
        },
        {
          provide: MailService,
          useValue: { send: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: any) => {
              if (key === "OTP_BYPASS") return true;
              if (key === "NODE_ENV") return nodeEnv;
              return fallback;
            }),
          },
        },
      ],
    }).compile();

    return {
      service: module.get(OtpService),
      redisService: module.get(RedisService) as jest.Mocked<RedisService>,
      mailService: module.get(MailService) as jest.Mocked<MailService>,
    };
  };

  beforeEach(async () => {
    const built = await buildService();
    service = built.service;
    redisService = built.redisService;
    mailService = built.mailService;
  });

  it("refuses to construct when NODE_ENV is production", async () => {
    await expect(buildService("production")).rejects.toThrow(
      "OTP_BYPASS must not be enabled in production"
    );
  });

  it("never touches Redis or Mail", async () => {
    await service.request(
      OtpPurpose.SIGNUP_VERIFICATION,
      "user-1",
      "user@example.com"
    );

    expect(redisService.set).not.toHaveBeenCalled();
    expect(mailService.send).not.toHaveBeenCalled();
  });

  it("still verifies correctly and round-trips metadata, entirely in memory", async () => {
    const logSpy = jest.spyOn((service as any).logger, "warn");

    await service.request(
      OtpPurpose.BANK_CHANGE,
      "user-1",
      "user@example.com",
      { pendingChanges: { bankName: "GTBank" } }
    );

    const logged: string = logSpy.mock.calls
      .map((args) => args[0] as string)
      .find((msg: string) => msg.includes("[OTP BYPASS]"));
    expect(logged).toBeDefined();
    const code = logged.match(/(\d{6})/)[1];

    const metadata = await service.verify(
      OtpPurpose.BANK_CHANGE,
      "user-1",
      code
    );
    expect(metadata).toEqual({ pendingChanges: { bankName: "GTBank" } });
  });

  it("still rejects an incorrect code", async () => {
    await service.request(
      OtpPurpose.NEW_DEVICE_LOGIN,
      "user-1",
      "user@example.com"
    );

    await expect(
      service.verify(OtpPurpose.NEW_DEVICE_LOGIN, "user-1", "000000000")
    ).rejects.toThrow(BadRequestException);
  });
});
