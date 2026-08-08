import { Test, TestingModule } from "@nestjs/testing";
import { ErrandsFlow } from "./errands.flow";
import { ErrandsService } from "../../errands/errands.service";
import { WhatsappService } from "../whatsapp.service";
import { ErrandCategory, ErrandStatus } from "../../errands/entities/errand.entity";
import { LocationType } from "../../errands/entities/location.entity";
import { UserRole } from "../../users/entities/user.entity";

const PHONE = "2348012345678";
const user = { id: "user-1", email: "ada@example.com", role: UserRole.BOTH } as any;

function makeErrand(overrides: Partial<any> = {}) {
  return {
    id: "errand-1",
    title: "Pick up documents",
    description: "Pick up a signed contract from the front desk",
    category: ErrandCategory.DELIVERY,
    price: 2000,
    status: ErrandStatus.OPEN,
    requesterId: "other-user",
    runnerId: undefined,
    locations: [{ type: LocationType.PICKUP, label: "Ikeja mall" }],
    ...overrides,
  };
}

describe("ErrandsFlow", () => {
  let flow: ErrandsFlow;
  let errandsService: jest.Mocked<ErrandsService>;
  let whatsappService: jest.Mocked<WhatsappService>;

  beforeEach(async () => {
    errandsService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findOne: jest.fn(),
      findMyErrands: jest.fn(),
      acceptErrand: jest.fn(),
      cancel: jest.fn(),
      updateStatus: jest.fn(),
    } as any;
    whatsappService = {
      sendText: jest.fn(),
      sendList: jest.fn(),
      sendButtons: jest.fn(),
      sendLinkButton: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ErrandsFlow,
        { provide: ErrandsService, useValue: errandsService },
        { provide: WhatsappService, useValue: whatsappService },
      ],
    }).compile();

    flow = module.get(ErrandsFlow);
  });

  describe("start / submenu", () => {
    it("sends the submenu and enters the errands flow", async () => {
      const session = await flow.start(user, PHONE);
      expect(whatsappService.sendList).toHaveBeenCalled();
      expect(session).toEqual({ flow: "errands" });
    });

    it("err_post starts the post flow with the category picker", async () => {
      const session = await flow.handle(user, {}, PHONE, { id: "err_post" });
      expect(whatsappService.sendList).toHaveBeenCalled();
      expect(session).toEqual({
        flow: "errands",
        step: "post_category",
        data: {},
      });
    });

    it("err_browse shows open errands", async () => {
      errandsService.findAll.mockResolvedValue({
        data: [makeErrand()],
        total: 1,
        page: 1,
        limit: 10,
      });

      const session = await flow.handle(user, {}, PHONE, { id: "err_browse" });

      expect(errandsService.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ status: ErrandStatus.OPEN }),
        user.id
      );
      expect(whatsappService.sendList).toHaveBeenCalled();
      expect(session).toEqual({ flow: "errands", step: "browse_list" });
    });

    it("err_browse with no open errands drops back to the submenu", async () => {
      errandsService.findAll.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 10,
      });

      const session = await flow.handle(user, {}, PHONE, { id: "err_browse" });

      expect(whatsappService.sendText).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining("No open errands")
      );
      expect(session).toEqual({ flow: "errands" });
    });

    it("err_back exits to the main menu", async () => {
      const session = await flow.handle(user, {}, PHONE, { id: "err_back" });
      expect(session).toBeNull();
    });
  });

  describe("post flow", () => {
    it("rejects an unrecognized category and re-prompts", async () => {
      const session = await flow.handle(
        user,
        { flow: "errands", step: "post_category", data: {} },
        PHONE,
        { id: "not_a_category" }
      );
      expect(session.step).toBe("post_category");
    });

    it("walks through category -> title -> description -> price -> location -> summary", async () => {
      let session = await flow.handle(
        user,
        { flow: "errands", step: "post_category", data: {} },
        PHONE,
        { id: ErrandCategory.DELIVERY }
      );
      expect(session).toEqual({
        flow: "errands",
        step: "post_title",
        data: { category: ErrandCategory.DELIVERY },
      });

      session = await flow.handle(user, session, PHONE, {
        text: "Pick up my package",
      });
      expect(session.step).toBe("post_description");

      session = await flow.handle(user, session, PHONE, {
        text: "It's at the front desk of the estate",
      });
      expect(session.step).toBe("post_price");

      session = await flow.handle(user, session, PHONE, { text: "2500" });
      expect(session.step).toBe("post_location");
      expect(session.data.price).toBe(2500);

      session = await flow.handle(user, session, PHONE, {
        text: "Shoprite, Lekki",
      });
      expect(session.step).toBe("post_confirm");
      expect(whatsappService.sendButtons).toHaveBeenCalled();
    });

    it("rejects a title that's too short", async () => {
      const session = await flow.handle(
        user,
        { flow: "errands", step: "post_title", data: {} },
        PHONE,
        { text: "hi" }
      );
      expect(session.step).toBe("post_title");
    });

    it("rejects an invalid price", async () => {
      const session = await flow.handle(
        user,
        { flow: "errands", step: "post_price", data: {} },
        PHONE,
        { text: "not a number" }
      );
      expect(session.step).toBe("post_price");
    });

    it("confirming creates the errand and returns to the submenu", async () => {
      errandsService.create.mockResolvedValue(makeErrand() as any);

      const session = await flow.handle(
        user,
        {
          flow: "errands",
          step: "post_confirm",
          data: {
            category: ErrandCategory.DELIVERY,
            title: "Pick up my package",
            description: "It's at the front desk",
            price: 2500,
            pickupLabel: "Shoprite, Lekki",
          },
        },
        PHONE,
        { id: "err_confirm_post" }
      );

      expect(errandsService.create).toHaveBeenCalledWith(
        {
          title: "Pick up my package",
          description: "It's at the front desk",
          category: ErrandCategory.DELIVERY,
          price: 2500,
          locations: [{ type: LocationType.PICKUP, label: "Shoprite, Lekki" }],
        },
        user.id,
        user.email
      );
      expect(whatsappService.sendText).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining("posted")
      );
      expect(session).toEqual({ flow: "errands" });
    });

    it("cancelling the draft discards it without calling create", async () => {
      const session = await flow.handle(
        user,
        { flow: "errands", step: "post_confirm", data: { title: "x" } },
        PHONE,
        { id: "err_cancel_post" }
      );
      expect(errandsService.create).not.toHaveBeenCalled();
      expect(session).toEqual({ flow: "errands" });
    });
  });

  describe("browse detail", () => {
    it("shows Accept for an open errand belonging to someone else", async () => {
      errandsService.findOne.mockResolvedValue(makeErrand() as any);

      const session = await flow.handle(
        user,
        { flow: "errands", step: "browse_list", data: {} },
        PHONE,
        { id: "errand-1" }
      );

      expect(whatsappService.sendButtons).toHaveBeenCalledWith(
        PHONE,
        expect.any(String),
        expect.arrayContaining([expect.objectContaining({ id: "err_accept" })])
      );
      expect(session).toEqual({
        flow: "errands",
        step: "browse_detail",
        data: { selectedErrandId: "errand-1" },
      });
    });

    it("hides Accept for the viewer's own errand", async () => {
      errandsService.findOne.mockResolvedValue(
        makeErrand({ requesterId: user.id }) as any
      );

      await flow.handle(
        user,
        { flow: "errands", step: "browse_list", data: {} },
        PHONE,
        { id: "errand-1" }
      );

      const [, , buttons] = whatsappService.sendButtons.mock.calls[0];
      expect(buttons).not.toEqual(
        expect.arrayContaining([expect.objectContaining({ id: "err_accept" })])
      );
    });

    it("accepting calls acceptErrand with the resolved role and returns to the submenu", async () => {
      errandsService.acceptErrand.mockResolvedValue(makeErrand() as any);
      errandsService.findAll.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 10,
      });

      const session = await flow.handle(
        user,
        {
          flow: "errands",
          step: "browse_detail",
          data: { selectedErrandId: "errand-1" },
        },
        PHONE,
        { id: "err_accept" }
      );

      expect(errandsService.acceptErrand).toHaveBeenCalledWith(
        "errand-1",
        user.id,
        user.role
      );
      expect(session).toEqual({ flow: "errands" });
    });
  });

  describe("my errands", () => {
    it("offers 'Mark in progress' for an accepted errand", async () => {
      errandsService.findMyErrands.mockResolvedValue([
        makeErrand({ status: ErrandStatus.ACCEPTED, runnerId: user.id }),
      ] as any);
      errandsService.findOne.mockResolvedValue(
        makeErrand({ status: ErrandStatus.ACCEPTED, runnerId: user.id }) as any
      );

      const listSession = await flow.handle(
        user,
        { flow: "errands", step: undefined, data: {} },
        PHONE,
        { id: "err_my" }
      );
      expect(listSession.step).toBe("my_list");

      await flow.handle(user, listSession, PHONE, { id: "errand-1" });

      const [, , buttons] = whatsappService.sendButtons.mock.calls.at(-1)!;
      expect(buttons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "err_in_progress" }),
        ])
      );
    });

    it("marking completed calls updateStatus(COMPLETED) and re-renders the list", async () => {
      errandsService.updateStatus.mockResolvedValue(makeErrand() as any);
      errandsService.findMyErrands.mockResolvedValue([]);

      const session = await flow.handle(
        user,
        {
          flow: "errands",
          step: "my_detail",
          data: { selectedErrandId: "errand-1" },
        },
        PHONE,
        { id: "err_complete" }
      );

      expect(errandsService.updateStatus).toHaveBeenCalledWith(
        "errand-1",
        { status: ErrandStatus.COMPLETED },
        user.id
      );
      expect(session).toEqual({ flow: "errands" });
    });

    it("cancelling calls cancel() and re-renders the list", async () => {
      errandsService.findMyErrands.mockResolvedValue([]);

      await flow.handle(
        user,
        {
          flow: "errands",
          step: "my_detail",
          data: { selectedErrandId: "errand-1" },
        },
        PHONE,
        { id: "err_cancel" }
      );

      expect(errandsService.cancel).toHaveBeenCalledWith("errand-1", user.id);
    });
  });
});
