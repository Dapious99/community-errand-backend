import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { BadRequestException } from "@nestjs/common";
import { VtpassService } from "./vtpass.service";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("VtpassService", () => {
  const buildService = async (configured: boolean) => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VtpassService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: any) => {
              if (!configured) return fallback;
              const values: Record<string, string> = {
                VTPASS_API_KEY: "api-key",
                VTPASS_SECRET_KEY: "secret-key",
                VTPASS_PUBLIC_KEY: "public-key",
                VTPASS_ENV: "sandbox",
              };
              return values[key] ?? fallback;
            }),
          },
        },
      ],
    }).compile();

    return module.get(VtpassService);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("when VTpass credentials are not configured", () => {
    it("throws instead of calling the API", async () => {
      const service = await buildService(false);

      await expect(service.getDataVariations("mtn-data")).rejects.toThrow(
        BadRequestException
      );
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });
  });

  describe("when configured", () => {
    it("fetches data variations from the sandbox base URL", async () => {
      const service = await buildService(true);
      mockedAxios.get.mockResolvedValue({
        data: {
          response_description: "ok",
          content: {
            ServiceName: "MTN Data",
            serviceID: "mtn-data",
            variations: [
              {
                variation_code: "mtn-100mb-100",
                name: "100MB - N100",
                variation_amount: "100.00",
              },
            ],
          },
        },
      });

      const variations = await service.getDataVariations("mtn-data");

      expect(mockedAxios.get).toHaveBeenCalledWith(
        "https://sandbox.vtpass.com/api/service-variations",
        expect.objectContaining({
          params: { serviceID: "mtn-data" },
          headers: expect.objectContaining({
            "api-key": "api-key",
            "public-key": "public-key",
          }),
        })
      );
      expect(variations).toHaveLength(1);
      expect(variations[0].variation_code).toBe("mtn-100mb-100");
    });

    it("posts a purchase request with the request_id and secret-key auth", async () => {
      const service = await buildService(true);
      mockedAxios.post.mockResolvedValue({
        data: {
          code: "000",
          response_description: "successful",
          requestId: "req-1",
        },
      });

      const result = await service.purchase({
        requestId: "req-1",
        serviceID: "mtn",
        phone: "08012345678",
        amount: 500,
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        "https://sandbox.vtpass.com/api/pay",
        expect.objectContaining({
          request_id: "req-1",
          serviceID: "mtn",
          phone: "08012345678",
          amount: 500,
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            "api-key": "api-key",
            "secret-key": "secret-key",
          }),
        })
      );
      expect(result.code).toBe("000");
    });

    it("generates a unique-looking request id", () => {
      const service = new VtpassService({ get: () => undefined } as any);
      const first = service.generateRequestId();
      const second = service.generateRequestId();

      expect(first).not.toBe(second);
      expect(first.length).toBeGreaterThan(10);
    });
  });
});
