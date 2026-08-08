import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { KycFlow } from "./kyc.flow";
import { KycService } from "../../kyc/kyc.service";
import { WhatsappService } from "../whatsapp.service";
import { KYCStatus } from "../../users/entities/kyc.entity";

const PHONE = "2348012345678";
const user = { id: "user-1", email: "ada@example.com" } as any;

describe("KycFlow", () => {
  let flow: KycFlow;
  let kycService: jest.Mocked<KycService>;
  let whatsappService: jest.Mocked<WhatsappService>;

  beforeEach(async () => {
    kycService = {
      getKyc: jest.fn(),
      submitBankDetails: jest.fn(),
      confirmBankChange: jest.fn(),
      resendBankChangeCode: jest.fn(),
    } as any;
    whatsappService = {
      sendText: jest.fn(),
      sendList: jest.fn(),
      sendButtons: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KycFlow,
        { provide: KycService, useValue: kycService },
        { provide: WhatsappService, useValue: whatsappService },
      ],
    }).compile();

    flow = module.get(KycFlow);
  });

  it("start sends the submenu and enters the kyc flow", async () => {
    const session = await flow.start(user, PHONE);
    expect(whatsappService.sendList).toHaveBeenCalled();
    expect(session).toEqual({ flow: "kyc" });
  });

  describe("kyc_status", () => {
    it("reports no submission when none exists", async () => {
      kycService.getKyc.mockRejectedValue(new NotFoundException());

      await flow.handle(user, {}, PHONE, { id: "kyc_status" });

      expect(whatsappService.sendText).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining("No identity verification submitted yet")
      );
    });

    it("shows the current status and rejection reason", async () => {
      kycService.getKyc.mockResolvedValue({
        status: KYCStatus.REJECTED,
        rejectionReason: "Blurry photo",
      } as any);

      await flow.handle(user, {}, PHONE, { id: "kyc_status" });

      expect(whatsappService.sendText).toHaveBeenCalledWith(
        PHONE,
        expect.stringContaining("Blurry photo")
      );
    });

    it("propagates an unexpected error instead of swallowing it", async () => {
      kycService.getKyc.mockRejectedValue(new Error("db down"));

      await expect(
        flow.handle(user, {}, PHONE, { id: "kyc_status" })
      ).rejects.toThrow("db down");
    });
  });

  describe("bank details submission", () => {
    it("kyc_bank prompts for the account number", async () => {
      const session = await flow.handle(user, {}, PHONE, { id: "kyc_bank" });
      expect(session).toEqual({ flow: "kyc", step: "bank_account_number" });
    });

    it("rejects an invalid account number", async () => {
      const session = await flow.handle(
        user,
        { flow: "kyc", step: "bank_account_number" },
        PHONE,
        { text: "abc" }
      );
      expect(session.step).toBe("bank_account_number");
    });

    it("collects account number, bank name, and account name across steps", async () => {
      let session = await flow.handle(
        user,
        { flow: "kyc", step: "bank_account_number" },
        PHONE,
        { text: "0123456789" }
      );
      expect(session).toEqual({
        flow: "kyc",
        step: "bank_name",
        data: { bankAccountNumber: "0123456789" },
      });

      session = await flow.handle(user, session, PHONE, { text: "Access Bank" });
      expect(session).toEqual({
        flow: "kyc",
        step: "bank_account_name",
        data: { bankAccountNumber: "0123456789", bankName: "Access Bank" },
      });
    });

    it("saves bank details directly when no confirmation is required", async () => {
      kycService.submitBankDetails.mockResolvedValue({ id: "kyc-1" } as any);

      const session = await flow.handle(
        user,
        {
          flow: "kyc",
          step: "bank_account_name",
          data: { bankAccountNumber: "0123456789", bankName: "Access Bank" },
        },
        PHONE,
        { text: "Ada Lovelace" }
      );

      expect(kycService.submitBankDetails).toHaveBeenCalledWith(user.id, {
        bankAccountNumber: "0123456789",
        bankName: "Access Bank",
        bankAccountName: "Ada Lovelace",
      });
      expect(session).toEqual({ flow: "kyc" });
    });

    it("moves to code confirmation when a change requires it", async () => {
      kycService.submitBankDetails.mockResolvedValue({
        requiresConfirmation: true,
        message: "A confirmation code has been emailed to you.",
      });

      const session = await flow.handle(
        user,
        {
          flow: "kyc",
          step: "bank_account_name",
          data: { bankAccountNumber: "0123456789", bankName: "Access Bank" },
        },
        PHONE,
        { text: "Ada Lovelace" }
      );

      expect(session).toEqual({ flow: "kyc", step: "bank_confirm_code" });
      expect(whatsappService.sendButtons).toHaveBeenCalled();
    });

    it("confirms the change with a valid code", async () => {
      kycService.confirmBankChange.mockResolvedValue({ id: "kyc-1" } as any);

      const session = await flow.handle(
        user,
        { flow: "kyc", step: "bank_confirm_code" },
        PHONE,
        { text: "123456" }
      );

      expect(kycService.confirmBankChange).toHaveBeenCalledWith(
        user.id,
        "123456"
      );
      expect(session).toEqual({ flow: "kyc" });
    });

    it("resends the confirmation code on request", async () => {
      const session = await flow.handle(
        user,
        { flow: "kyc", step: "bank_confirm_code" },
        PHONE,
        { id: "kyc_resend_bank_code" }
      );

      expect(kycService.resendBankChangeCode).toHaveBeenCalledWith(user.id);
      expect(session).toEqual({ flow: "kyc", step: "bank_confirm_code" });
    });
  });

  it("kyc_back exits to the main menu", async () => {
    const session = await flow.handle(user, {}, PHONE, { id: "kyc_back" });
    expect(session).toBeNull();
  });
});
