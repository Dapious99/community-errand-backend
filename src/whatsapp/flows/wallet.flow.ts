import { Injectable } from "@nestjs/common";
import * as crypto from "crypto";
import { WalletService } from "../../wallet/wallet.service";
import { WalletTransactionStatus } from "../../wallet/entities/wallet-transaction.entity";
import { PaymentsService } from "../../payments/payments.service";
import { User } from "../../users/entities/user.entity";
import { WhatsappService } from "../whatsapp.service";
import { WhatsappSession } from "../whatsapp-session.service";
import { WhatsappAction } from "./errands.flow";

const SUBMENU_ROWS = [
  { id: "wal_balance", title: "Check balance" },
  { id: "wal_history", title: "Transaction history" },
  { id: "wal_deposit", title: "Deposit", description: "Top up your wallet" },
  {
    id: "wal_withdraw",
    title: "Withdraw",
    description: "Send your full balance to your bank",
  },
  { id: "wal_back", title: "Back to main menu" },
];

const MIN_DEPOSIT = 100;
const MAX_TRANSACTIONS_SHOWN = 10;

/**
 * Wallet & payments over WhatsApp: balance, history, deposit (hands off to
 * Paystack's own hosted checkout link - this bot never touches card data),
 * and withdrawal. Withdrawal always requires a fresh confirmation code sent
 * in-chat before calling PaymentsService.initiateWithdrawal, regardless of
 * how recent the session is - it moves real money and sweeps the entire
 * balance, so it gets deliberately more friction than a single tap. That
 * code is delivered over the same channel it confirms, so it's a
 * fat-finger/distracted-tap guard rather than true second-factor - a
 * takeover of the WhatsApp account itself isn't defended against here.
 */
@Injectable()
export class WalletFlow {
  constructor(
    private walletService: WalletService,
    private paymentsService: PaymentsService,
    private whatsappService: WhatsappService
  ) {}

  async start(user: User, phone: string): Promise<WhatsappSession> {
    await this.sendSubmenu(phone);
    return { flow: "wallet" };
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
      case "deposit_amount":
        return this.handleDepositAmount(user, phone, session, action);
      case "withdraw_confirm":
        return this.handleWithdrawConfirm(user, phone, session, action);
      default:
        return this.start(user, phone);
    }
  }

  private async sendSubmenu(phone: string): Promise<void> {
    await this.whatsappService.sendList(
      phone,
      "Wallet & payments - what would you like to do?",
      "Choose",
      [{ title: "Wallet", rows: SUBMENU_ROWS }]
    );
  }

  private async handleSubmenu(
    user: User,
    phone: string,
    action: WhatsappAction
  ): Promise<WhatsappSession | null> {
    switch (action.id) {
      case "wal_balance": {
        const balance = await this.walletService.getBalance(user.id);
        await this.whatsappService.sendText(
          phone,
          `Your wallet balance: ₦${balance}`
        );
        return this.start(user, phone);
      }
      case "wal_history": {
        const transactions = await this.walletService.getTransactions(
          user.id
        );
        if (transactions.length === 0) {
          await this.whatsappService.sendText(
            phone,
            "No transactions yet."
          );
          return this.start(user, phone);
        }
        const shown = transactions.slice(0, MAX_TRANSACTIONS_SHOWN);
        const lines = shown.map(
          (tx) =>
            `${tx.createdAt.toDateString()} · ${tx.type} · ₦${tx.amount} (${tx.status})`
        );
        await this.whatsappService.sendText(
          phone,
          [
            `Recent transactions${transactions.length > MAX_TRANSACTIONS_SHOWN ? ` (last ${MAX_TRANSACTIONS_SHOWN})` : ""}:`,
            ...lines,
          ].join("\n")
        );
        return this.start(user, phone);
      }
      case "wal_deposit":
        await this.whatsappService.sendText(
          phone,
          `How much would you like to deposit? (minimum ₦${MIN_DEPOSIT}, numbers only, e.g. 5000)`
        );
        return { flow: "wallet", step: "deposit_amount" };
      case "wal_withdraw":
        return this.startWithdrawConfirm(user, phone);
      case "wal_back":
        return null;
      default:
        await this.sendSubmenu(phone);
        return { flow: "wallet" };
    }
  }

  private async handleDepositAmount(
    user: User,
    phone: string,
    session: WhatsappSession,
    action: WhatsappAction
  ): Promise<WhatsappSession> {
    const amount = Number((action.text ?? "").replace(/[^\d.]/g, ""));
    if (!amount || amount < MIN_DEPOSIT) {
      await this.whatsappService.sendText(
        phone,
        `Enter a valid amount to deposit (minimum ₦${MIN_DEPOSIT}).`
      );
      return session;
    }

    const { authorizationUrl } = await this.paymentsService.initializeDeposit(
      user.id,
      user.email,
      amount
    );
    await this.whatsappService.sendLinkButton(
      phone,
      `Tap below to complete your ₦${amount} deposit securely via Paystack.`,
      authorizationUrl,
      "Pay now"
    );
    await this.whatsappService.sendText(
      phone,
      "Once payment goes through, your balance updates automatically - check back with 'Check balance'."
    );
    return this.start(user, phone);
  }

  private async startWithdrawConfirm(
    user: User,
    phone: string
  ): Promise<WhatsappSession> {
    const balance = await this.walletService.getBalance(user.id);
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");

    await this.whatsappService.sendText(
      phone,
      `You're about to withdraw your full wallet balance (₦${balance}) to the bank account on file. Reply with this code to confirm:\n\n*${code}*`
    );
    await this.whatsappService.sendButtons(phone, "Or:", [
      { id: "wal_cancel_withdraw", title: "Cancel" },
    ]);

    return { flow: "wallet", step: "withdraw_confirm", data: { code } };
  }

  private async handleWithdrawConfirm(
    user: User,
    phone: string,
    session: WhatsappSession,
    action: WhatsappAction
  ): Promise<WhatsappSession> {
    if (action.id === "wal_cancel_withdraw") {
      await this.whatsappService.sendText(phone, "Withdrawal cancelled.");
      return this.start(user, phone);
    }

    const typedCode = (action.text ?? "").trim();
    if (!typedCode || typedCode !== session.data?.code) {
      await this.whatsappService.sendText(
        phone,
        "That code didn't match - choose Withdraw again from the wallet menu to retry."
      );
      return this.start(user, phone);
    }

    // Any failure (below minimum, missing/unapproved KYC, transfer setup
    // failure) is an HttpException that WhatsappRouterService relays as-is.
    const result = await this.paymentsService.initiateWithdrawal(user.id);
    const statusText =
      result.status === WalletTransactionStatus.PROCESSING
        ? "is being processed"
        : "has been queued for manual review";
    await this.whatsappService.sendText(
      phone,
      `Withdrawal ${statusText}. Net amount: ₦${result.netAmount} (fee: ₦${result.feeAmount}).`
    );
    return this.start(user, phone);
  }
}
