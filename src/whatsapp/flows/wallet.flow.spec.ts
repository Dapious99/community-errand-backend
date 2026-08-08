import { Test, TestingModule } from "@nestjs/testing";
import { WalletFlow } from "./wallet.flow";
import { WalletService } from "../../wallet/wallet.service";
import { PaymentsService } from "../../payments/payments.service";
import { WhatsappService } from "../whatsapp.service";
import { WalletTransactionStatus, WalletTransactionType } from "../../wallet/entities/wallet-transaction.entity";

const PHONE = "2348012345678";
const user = { id: "user-1", email: "ada@example.com" } as any;

describe("WalletFlow", () => {
  let flow: WalletFlow;
  let walletService: jest.Mocked<WalletService>;
  let paymentsService: jest.Mocked<PaymentsService>;
  let whatsappService: jest.Mocked<WhatsappService>;

  beforeEach(async () => {
    walletService = {
      getBalance: jest.fn(),
      getTransactions: jest.fn(),
    } as any;
    paymentsService = {
      initializeDeposit: jest.fn(),
      initiateWithdrawal: jest.fn(),
    } as any;
    whatsappService = {
      sendText: jest.fn(),
      sendList: jest.fn(),
      sendButtons: jest.fn(),
      sendLinkButton: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletFlow,
        { provide: WalletService, useValue: walletService },
        { provide: PaymentsService, useValue: paymentsService },
        { provide: WhatsappService, useValue: whatsappService },
      ],
    }).compile();

    flow = module.get(WalletFlow);
  });

  it("start sends the submenu and enters the wallet flow", async () => {
    const session = await flow.start(user, PHONE);
    expect(whatsappService.sendList).toHaveBeenCalled();
    expect(session).toEqual({ flow: "wallet" });
  });

  it("wal_balance reports the current balance", async () => {
    walletService.getBalance.mockResolvedValue(15000);

    await flow.handle(user, {}, PHONE, { id: "wal_balance" });

    expect(walletService.getBalance).toHaveBeenCalledWith(user.id);
    expect(whatsappService.sendText).toHaveBeenCalledWith(
      PHONE,
      expect.stringContaining("15000")
    );
  });

  it("wal_history reports 'no transactions' when there are none", async () => {
    walletService.getTransactions.mockResolvedValue([]);

    await flow.handle(user, {}, PHONE, { id: "wal_history" });

    expect(whatsappService.sendText).toHaveBeenCalledWith(
      PHONE,
      expect.stringContaining("No transactions")
    );
  });

  it("wal_history lists recent transactions", async () => {
    walletService.getTransactions.mockResolvedValue([
      {
        type: WalletTransactionType.DEPOSIT,
        amount: 5000,
        status: WalletTransactionStatus.SUCCESS,
        createdAt: new Date("2026-01-01"),
      },
    ] as any);

    await flow.handle(user, {}, PHONE, { id: "wal_history" });

    expect(whatsappService.sendText).toHaveBeenCalledWith(
      PHONE,
      expect.stringContaining("5000")
    );
  });

  it("wal_deposit prompts for an amount", async () => {
    const session = await flow.handle(user, {}, PHONE, { id: "wal_deposit" });
    expect(session).toEqual({ flow: "wallet", step: "deposit_amount" });
  });

  it("rejects a deposit amount below the minimum", async () => {
    const session = await flow.handle(
      user,
      { flow: "wallet", step: "deposit_amount" },
      PHONE,
      { text: "10" }
    );
    expect(session.step).toBe("deposit_amount");
    expect(paymentsService.initializeDeposit).not.toHaveBeenCalled();
  });

  it("a valid deposit amount initializes a deposit and sends the checkout link", async () => {
    paymentsService.initializeDeposit.mockResolvedValue({
      authorizationUrl: "https://paystack.test/pay",
      reference: "ref-1",
    });

    const session = await flow.handle(
      user,
      { flow: "wallet", step: "deposit_amount" },
      PHONE,
      { text: "5000" }
    );

    expect(paymentsService.initializeDeposit).toHaveBeenCalledWith(
      user.id,
      user.email,
      5000
    );
    expect(whatsappService.sendLinkButton).toHaveBeenCalledWith(
      PHONE,
      expect.any(String),
      "https://paystack.test/pay",
      expect.any(String)
    );
    expect(session).toEqual({ flow: "wallet" });
  });

  it("wal_withdraw sends a confirmation code and stashes it in the session", async () => {
    walletService.getBalance.mockResolvedValue(20000);

    const session = await flow.handle(user, {}, PHONE, { id: "wal_withdraw" });

    expect(session.step).toBe("withdraw_confirm");
    expect(session.data?.code).toMatch(/^\d{6}$/);
    expect(paymentsService.initiateWithdrawal).not.toHaveBeenCalled();
  });

  it("cancelling the withdrawal confirmation does not call initiateWithdrawal", async () => {
    const session = await flow.handle(
      user,
      { flow: "wallet", step: "withdraw_confirm", data: { code: "123456" } },
      PHONE,
      { id: "wal_cancel_withdraw" }
    );
    expect(paymentsService.initiateWithdrawal).not.toHaveBeenCalled();
    expect(session).toEqual({ flow: "wallet" });
  });

  it("a mismatched confirmation code does not call initiateWithdrawal", async () => {
    await flow.handle(
      user,
      { flow: "wallet", step: "withdraw_confirm", data: { code: "123456" } },
      PHONE,
      { text: "000000" }
    );
    expect(paymentsService.initiateWithdrawal).not.toHaveBeenCalled();
  });

  it("a matching confirmation code calls initiateWithdrawal and reports the result", async () => {
    paymentsService.initiateWithdrawal.mockResolvedValue({
      transactionId: "tx-1",
      netAmount: 19000,
      feeAmount: 1000,
      status: WalletTransactionStatus.PROCESSING,
    });

    const session = await flow.handle(
      user,
      { flow: "wallet", step: "withdraw_confirm", data: { code: "123456" } },
      PHONE,
      { text: "123456" }
    );

    expect(paymentsService.initiateWithdrawal).toHaveBeenCalledWith(user.id);
    expect(whatsappService.sendText).toHaveBeenCalledWith(
      PHONE,
      expect.stringContaining("19000")
    );
    expect(session).toEqual({ flow: "wallet" });
  });
});
