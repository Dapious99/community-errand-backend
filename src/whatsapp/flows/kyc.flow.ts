import { Injectable, NotFoundException } from "@nestjs/common";
import { KycService } from "../../kyc/kyc.service";
import { User } from "../../users/entities/user.entity";
import { WhatsappService } from "../whatsapp.service";
import { WhatsappSession } from "../whatsapp-session.service";
import { WhatsappAction } from "./errands.flow";

const SUBMENU_ROWS = [
  { id: "kyc_status", title: "Check status" },
  {
    id: "kyc_bank",
    title: "Submit/update bank details",
    description: "Needed before you can withdraw",
  },
  { id: "kyc_back", title: "Back to main menu" },
];

/**
 * Identity & payout over WhatsApp - status is read-only here (submitting a
 * fresh NIN/ID photo still requires the app, since receiving an image over
 * WhatsApp needs a Graph-API media-download bridge this codebase doesn't
 * have yet). Bank details are pure text, so they're fully supported: a
 * change to already-APPROVED bank details still goes through the same
 * emailed-OTP confirmation as the app (KycService.submitBankDetails/
 * confirmBankChange) - this flow doesn't bypass that, it just relays it.
 */
@Injectable()
export class KycFlow {
  constructor(
    private kycService: KycService,
    private whatsappService: WhatsappService
  ) {}

  async start(user: User, phone: string): Promise<WhatsappSession> {
    await this.sendSubmenu(phone);
    return { flow: "kyc" };
  }

  async handle(
    user: User,
    session: WhatsappSession,
    phone: string,
    action: WhatsappAction
  ): Promise<WhatsappSession | null> {
    switch (session.step) {
      case undefined:
        return this.handleSubmenu(user, phone, action);
      case "bank_account_number":
        return this.handleBankAccountNumber(phone, action);
      case "bank_name":
        return this.handleBankName(phone, session, action);
      case "bank_account_name":
        return this.handleBankAccountName(user, phone, session, action);
      case "bank_confirm_code":
        return this.handleBankConfirmCode(user, phone, action);
      default:
        return this.start(user, phone);
    }
  }

  private async sendSubmenu(phone: string): Promise<void> {
    await this.whatsappService.sendList(
      phone,
      "Identity & payout - what would you like to do?",
      "Choose",
      [{ title: "Identity & payout", rows: SUBMENU_ROWS }]
    );
  }

  private async handleSubmenu(
    user: User,
    phone: string,
    action: WhatsappAction
  ): Promise<WhatsappSession | null> {
    switch (action.id) {
      case "kyc_status":
        await this.sendStatus(user, phone);
        return this.start(user, phone);
      case "kyc_bank":
        await this.whatsappService.sendText(
          phone,
          "Enter your bank account number:"
        );
        return { flow: "kyc", step: "bank_account_number" };
      case "kyc_back":
        return null;
      default:
        await this.sendSubmenu(phone);
        return { flow: "kyc" };
    }
  }

  private async sendStatus(user: User, phone: string): Promise<void> {
    const kyc = await this.kycService.getKyc(user.id).catch((error) => {
      if (error instanceof NotFoundException) return null;
      throw error;
    });

    if (!kyc) {
      await this.whatsappService.sendText(
        phone,
        "No identity verification submitted yet. You can submit your bank details here; NIN/ID photo verification is done in the app under Identity Verification."
      );
      return;
    }

    const lines = [
      `Status: ${kyc.status}`,
      kyc.status === "rejected" && kyc.rejectionReason
        ? `Reason: ${kyc.rejectionReason}`
        : null,
      kyc.bankAccountNumber
        ? `Bank on file: ${kyc.bankName} · ${kyc.bankAccountNumber.slice(-4).padStart(kyc.bankAccountNumber.length, "*")}`
        : "No bank details on file yet.",
    ].filter((line): line is string => !!line);
    await this.whatsappService.sendText(phone, lines.join("\n"));
  }

  private async handleBankAccountNumber(
    phone: string,
    action: WhatsappAction
  ): Promise<WhatsappSession> {
    const accountNumber = (action.text ?? "").trim();
    if (!/^\d{10}$/.test(accountNumber)) {
      await this.whatsappService.sendText(
        phone,
        "Enter a valid 10-digit account number."
      );
      return { flow: "kyc", step: "bank_account_number" };
    }
    await this.whatsappService.sendText(phone, "Enter your bank's name:");
    return {
      flow: "kyc",
      step: "bank_name",
      data: { bankAccountNumber: accountNumber },
    };
  }

  private async handleBankName(
    phone: string,
    session: WhatsappSession,
    action: WhatsappAction
  ): Promise<WhatsappSession> {
    const bankName = (action.text ?? "").trim();
    if (!bankName) {
      await this.whatsappService.sendText(phone, "Enter your bank's name:");
      return session;
    }
    await this.whatsappService.sendText(
      phone,
      "Enter the account name (as registered with the bank):"
    );
    return {
      flow: "kyc",
      step: "bank_account_name",
      data: { ...session.data, bankName },
    };
  }

  private async handleBankAccountName(
    user: User,
    phone: string,
    session: WhatsappSession,
    action: WhatsappAction
  ): Promise<WhatsappSession | null> {
    const bankAccountName = (action.text ?? "").trim();
    if (!bankAccountName) {
      await this.whatsappService.sendText(
        phone,
        "Enter the account name (as registered with the bank):"
      );
      return session;
    }

    const result = await this.kycService.submitBankDetails(user.id, {
      bankAccountNumber: session.data?.bankAccountNumber,
      bankName: session.data?.bankName,
      bankAccountName,
    });

    if ("requiresConfirmation" in result) {
      await this.whatsappService.sendText(
        phone,
        `${result.message} Reply with that code here to confirm.`
      );
      await this.whatsappService.sendButtons(phone, "Or:", [
        { id: "kyc_resend_bank_code", title: "Resend code" },
      ]);
      return { flow: "kyc", step: "bank_confirm_code" };
    }

    await this.whatsappService.sendText(
      phone,
      "Bank details saved."
    );
    return this.start(user, phone);
  }

  private async handleBankConfirmCode(
    user: User,
    phone: string,
    action: WhatsappAction
  ): Promise<WhatsappSession> {
    if (action.id === "kyc_resend_bank_code") {
      await this.kycService.resendBankChangeCode(user.id);
      await this.whatsappService.sendText(
        phone,
        "A new confirmation code has been emailed to you."
      );
      return { flow: "kyc", step: "bank_confirm_code" };
    }

    const code = (action.text ?? "").trim();
    if (!code) {
      await this.whatsappService.sendText(
        phone,
        "Reply with the confirmation code emailed to you."
      );
      return { flow: "kyc", step: "bank_confirm_code" };
    }

    // A wrong/expired code throws an HttpException that WhatsappRouterService
    // relays as-is and resets to the main menu, same as every other flow.
    await this.kycService.confirmBankChange(user.id, code);
    await this.whatsappService.sendText(
      phone,
      "Bank details confirmed and updated."
    );
    return this.start(user, phone);
  }
}
