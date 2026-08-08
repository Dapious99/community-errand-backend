import { Test, TestingModule } from "@nestjs/testing";
import { BillsFlow } from "./bills.flow";
import { BillsService } from "../../bills/bills.service";
import { WhatsappService } from "../whatsapp.service";
import { NetworkProvider } from "../../bills/enums/network-provider.enum";
import { WalletTransactionStatus, WalletTransactionType } from "../../wallet/entities/wallet-transaction.entity";

const PHONE = "2348012345678";
const user = { id: "user-1" } as any;

const VARIATIONS = [
  { variation_code: "mtn-100mb", name: "100MB - 30 days", variation_amount: "100.00" },
  { variation_code: "mtn-1gb", name: "1GB - 30 days", variation_amount: "500.00" },
];

describe("BillsFlow", () => {
  let flow: BillsFlow;
  let billsService: jest.Mocked<BillsService>;
  let whatsappService: jest.Mocked<WhatsappService>;

  beforeEach(async () => {
    billsService = {
      purchaseAirtime: jest.fn(),
      purchaseData: jest.fn(),
      listDataPlans: jest.fn(),
      getHistory: jest.fn(),
    } as any;
    whatsappService = {
      sendText: jest.fn(),
      sendList: jest.fn(),
      sendButtons: jest.fn(),
      sendLinkButton: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillsFlow,
        { provide: BillsService, useValue: billsService },
        { provide: WhatsappService, useValue: whatsappService },
      ],
    }).compile();

    flow = module.get(BillsFlow);
  });

  it("start sends the submenu and enters the bills flow", async () => {
    const session = await flow.start(user, PHONE);
    expect(whatsappService.sendList).toHaveBeenCalled();
    expect(session).toEqual({ flow: "bills" });
  });

  it("bill_back exits to the main menu", async () => {
    const session = await flow.handle(user, {}, PHONE, { id: "bill_back" });
    expect(session).toBeNull();
  });

  describe("airtime", () => {
    it("bill_airtime starts the network picker", async () => {
      const session = await flow.handle(user, {}, PHONE, {
        id: "bill_airtime",
      });
      expect(session).toEqual({
        flow: "bills",
        step: "airtime_network",
        data: {},
      });
    });

    it("rejects an unrecognized network", async () => {
      const session = await flow.handle(
        user,
        { flow: "bills", step: "airtime_network", data: {} },
        PHONE,
        { id: "not_a_network" }
      );
      expect(session.step).toBe("airtime_network");
    });

    it("normalizes a locally-typed Nigerian number and walks to confirmation", async () => {
      let session = await flow.handle(
        user,
        { flow: "bills", step: "airtime_network", data: {} },
        PHONE,
        { id: NetworkProvider.MTN }
      );
      expect(session.step).toBe("airtime_phone");

      session = await flow.handle(user, session, PHONE, {
        text: "08012345678",
      });
      expect(session.step).toBe("airtime_amount");
      expect(session.data.billPhone).toBe("2348012345678");

      session = await flow.handle(user, session, PHONE, { text: "500" });
      expect(session.step).toBe("airtime_confirm");
      expect(session.data.amount).toBe(500);
      expect(whatsappService.sendButtons).toHaveBeenCalled();
    });

    it("rejects an amount outside the allowed range", async () => {
      const session = await flow.handle(
        user,
        { flow: "bills", step: "airtime_amount", data: {} },
        PHONE,
        { text: "1" }
      );
      expect(session.step).toBe("airtime_amount");
      expect(billsService.purchaseAirtime).not.toHaveBeenCalled();
    });

    it("confirming purchases the airtime", async () => {
      billsService.purchaseAirtime.mockResolvedValue({} as any);

      const session = await flow.handle(
        user,
        {
          flow: "bills",
          step: "airtime_confirm",
          data: {
            network: NetworkProvider.MTN,
            billPhone: "2348012345678",
            amount: 500,
          },
        },
        PHONE,
        { id: "bill_confirm" }
      );

      expect(billsService.purchaseAirtime).toHaveBeenCalledWith(
        user.id,
        NetworkProvider.MTN,
        "2348012345678",
        500
      );
      expect(session).toEqual({ flow: "bills" });
    });

    it("cancelling does not purchase anything", async () => {
      await flow.handle(
        user,
        {
          flow: "bills",
          step: "airtime_confirm",
          data: { network: NetworkProvider.MTN, billPhone: "234801", amount: 500 },
        },
        PHONE,
        { id: "bill_cancel" }
      );
      expect(billsService.purchaseAirtime).not.toHaveBeenCalled();
    });
  });

  describe("data", () => {
    it("bill_data lists variations for the chosen network", async () => {
      billsService.listDataPlans.mockResolvedValue(VARIATIONS as any);

      let session = await flow.handle(user, {}, PHONE, { id: "bill_data" });
      expect(session.step).toBe("data_network");

      session = await flow.handle(user, session, PHONE, {
        id: NetworkProvider.MTN,
      });

      expect(billsService.listDataPlans).toHaveBeenCalledWith(
        NetworkProvider.MTN
      );
      expect(session.step).toBe("data_plan");
      expect(session.data.variations).toEqual(VARIATIONS);
    });

    it("no plans available drops back to the submenu", async () => {
      billsService.listDataPlans.mockResolvedValue([]);

      const session = await flow.handle(
        user,
        { flow: "bills", step: "data_network", data: {} },
        PHONE,
        { id: NetworkProvider.MTN }
      );

      expect(whatsappService.sendText).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining("No data plans")
      );
      expect(session).toEqual({ flow: "bills" });
    });

    it("picking a plan then a phone number reaches confirmation", async () => {
      let session = await flow.handle(
        user,
        {
          flow: "bills",
          step: "data_plan",
          data: { network: NetworkProvider.MTN, variations: VARIATIONS },
        },
        PHONE,
        { id: "mtn-1gb" }
      );
      expect(session.step).toBe("data_phone");
      expect(session.data.variationCode).toBe("mtn-1gb");

      session = await flow.handle(user, session, PHONE, {
        text: "08012345678",
      });
      expect(session.step).toBe("data_confirm");
      expect(session.data.billPhone).toBe("2348012345678");
    });

    it("confirming purchases the data bundle", async () => {
      billsService.purchaseData.mockResolvedValue({} as any);

      const session = await flow.handle(
        user,
        {
          flow: "bills",
          step: "data_confirm",
          data: {
            network: NetworkProvider.MTN,
            variationCode: "mtn-1gb",
            billPhone: "2348012345678",
          },
        },
        PHONE,
        { id: "bill_confirm" }
      );

      expect(billsService.purchaseData).toHaveBeenCalledWith(
        user.id,
        NetworkProvider.MTN,
        "2348012345678",
        "mtn-1gb"
      );
      expect(session).toEqual({ flow: "bills" });
    });
  });

  describe("history", () => {
    it("reports no purchases when there are none", async () => {
      billsService.getHistory.mockResolvedValue([]);

      await flow.handle(user, {}, PHONE, { id: "bill_history" });

      expect(whatsappService.sendText).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining("No airtime/data purchases")
      );
    });

    it("lists recent purchases", async () => {
      billsService.getHistory.mockResolvedValue([
        {
          type: WalletTransactionType.BILL_PURCHASE,
          amount: 500,
          status: WalletTransactionStatus.SUCCESS,
          description: "Airtime purchase (mtn) for 2348012345678",
          createdAt: new Date("2026-01-01"),
        },
      ] as any);

      await flow.handle(user, {}, PHONE, { id: "bill_history" });

      expect(whatsappService.sendText).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining("500")
      );
    });
  });
});
