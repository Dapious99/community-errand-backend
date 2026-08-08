import { Test, TestingModule } from "@nestjs/testing";
import { ReferralsFlow } from "./referrals.flow";
import { ReferralsService } from "../../referrals/referrals.service";
import { WhatsappService } from "../whatsapp.service";

const PHONE = "2348012345678";
const user = { id: "user-1", email: "ada@example.com" } as any;

describe("ReferralsFlow", () => {
  let flow: ReferralsFlow;
  let referralsService: jest.Mocked<ReferralsService>;
  let whatsappService: jest.Mocked<WhatsappService>;

  beforeEach(async () => {
    referralsService = { getStats: jest.fn() } as any;
    whatsappService = { sendText: jest.fn() } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReferralsFlow,
        { provide: ReferralsService, useValue: referralsService },
        { provide: WhatsappService, useValue: whatsappService },
      ],
    }).compile();

    flow = module.get(ReferralsFlow);
  });

  it("start sends the referral code and stats", async () => {
    referralsService.getStats.mockResolvedValue({
      referralCode: "CELABCDE",
      pending: 2,
      completed: 5,
      void: 1,
    });

    const session = await flow.start(user, PHONE);

    expect(referralsService.getStats).toHaveBeenCalledWith(user.id);
    expect(whatsappService.sendText).toHaveBeenCalledWith(
      PHONE,
      expect.stringContaining("CELABCDE")
    );
    expect(session).toEqual({ flow: "referrals" });
  });

  it("any reply exits back to the main menu", async () => {
    const session = await flow.handle();
    expect(session).toBeNull();
  });
});
