import { Test, TestingModule } from "@nestjs/testing";
import { ConflictException } from "@nestjs/common";
import { WhatsappIdentityService } from "./whatsapp-identity.service";
import { UsersService } from "../users/users.service";
import { WhatsappLinkService } from "./whatsapp-link.service";

describe("WhatsappIdentityService", () => {
  let service: WhatsappIdentityService;
  let usersService: jest.Mocked<UsersService>;
  let whatsappLinkService: jest.Mocked<WhatsappLinkService>;

  beforeEach(async () => {
    usersService = {
      findByWhatsappNumber: jest.fn(),
      linkWhatsapp: jest.fn(),
    } as any;
    whatsappLinkService = {
      redeemCode: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsappIdentityService,
        { provide: UsersService, useValue: usersService },
        { provide: WhatsappLinkService, useValue: whatsappLinkService },
      ],
    }).compile();

    service = module.get(WhatsappIdentityService);
  });

  describe("resolve", () => {
    it("returns the user linked to the phone number", async () => {
      const user = { id: "user-1" } as any;
      usersService.findByWhatsappNumber.mockResolvedValue(user);

      const result = await service.resolve("2348012345678");

      expect(result).toBe(user);
      expect(usersService.findByWhatsappNumber).toHaveBeenCalledWith(
        "2348012345678"
      );
    });

    it("returns null for an unrecognized number", async () => {
      usersService.findByWhatsappNumber.mockResolvedValue(null);
      const result = await service.resolve("2348012345678");
      expect(result).toBeNull();
    });
  });

  describe("linkWithCode", () => {
    it("links the resolved user once the code is redeemed", async () => {
      const linkedUser = { id: "user-1", name: "Ada" } as any;
      whatsappLinkService.redeemCode.mockResolvedValue("user-1");
      usersService.linkWhatsapp.mockResolvedValue(linkedUser);

      const result = await service.linkWithCode("123456", "2348012345678");

      expect(whatsappLinkService.redeemCode).toHaveBeenCalledWith(
        "123456",
        "2348012345678"
      );
      expect(usersService.linkWhatsapp).toHaveBeenCalledWith(
        "user-1",
        "2348012345678"
      );
      expect(result).toBe(linkedUser);
    });

    it("returns null without touching UsersService when the code is wrong/expired/rate-limited", async () => {
      whatsappLinkService.redeemCode.mockResolvedValue(null);

      const result = await service.linkWithCode("000000", "2348012345678");

      expect(result).toBeNull();
      expect(usersService.linkWhatsapp).not.toHaveBeenCalled();
    });

    it("propagates a conflict if the number already belongs to a different account", async () => {
      whatsappLinkService.redeemCode.mockResolvedValue("user-1");
      usersService.linkWhatsapp.mockRejectedValue(
        new ConflictException(
          "This WhatsApp number is already linked to a different account."
        )
      );

      await expect(
        service.linkWithCode("123456", "2348012345678")
      ).rejects.toThrow(ConflictException);
    });
  });
});
