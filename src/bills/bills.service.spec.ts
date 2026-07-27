import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import { BillsService } from "./bills.service";
import { WalletService } from "../wallet/wallet.service";
import { VtpassService } from "./services/vtpass.service";
import {
  WalletTransactionStatus,
  WalletTransactionType,
} from "../wallet/entities/wallet-transaction.entity";
import { NetworkProvider } from "./enums/network-provider.enum";

describe("BillsService", () => {
  let service: BillsService;
  let walletService: jest.Mocked<WalletService>;
  let vtpassService: jest.Mocked<VtpassService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillsService,
        {
          provide: WalletService,
          useValue: {
            debit: jest.fn(),
            markTransactionStatus: jest.fn(),
            reverseTransaction: jest.fn(),
            getTransactions: jest.fn(),
          },
        },
        {
          provide: VtpassService,
          useValue: {
            generateRequestId: jest.fn().mockReturnValue("req-1"),
            purchase: jest.fn(),
            getDataVariations: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(BillsService);
    walletService = module.get(WalletService);
    vtpassService = module.get(VtpassService);
  });

  describe("purchaseAirtime", () => {
    it("debits the wallet, marks SUCCESS on a VTpass success code", async () => {
      walletService.debit.mockResolvedValue({
        id: "tx-1",
        walletId: "wallet-1",
      } as any);
      vtpassService.purchase.mockResolvedValue({
        code: "000",
        response_description: "successful",
        requestId: "req-1",
        content: {
          transactions: { status: "delivered", transactionId: "vt-1" },
        },
      } as any);

      await service.purchaseAirtime(
        "user-1",
        NetworkProvider.MTN,
        "08012345678",
        500
      );

      expect(walletService.debit).toHaveBeenCalledWith(
        "user-1",
        500,
        WalletTransactionType.BILL_PURCHASE,
        expect.objectContaining({ status: WalletTransactionStatus.PENDING })
      );
      expect(walletService.markTransactionStatus).toHaveBeenCalledWith(
        "tx-1",
        WalletTransactionStatus.SUCCESS,
        expect.objectContaining({
          metadata: expect.objectContaining({ vtpassTransactionId: "vt-1" }),
        })
      );
      expect(walletService.reverseTransaction).not.toHaveBeenCalled();
    });

    it("reverses the debit when VTpass returns a definite rejection code", async () => {
      walletService.debit.mockResolvedValue({ id: "tx-1" } as any);
      vtpassService.purchase.mockResolvedValue({
        code: "016",
        response_description: "Transaction failed",
        requestId: "req-1",
      } as any);

      await expect(
        service.purchaseAirtime(
          "user-1",
          NetworkProvider.MTN,
          "08012345678",
          500
        )
      ).rejects.toThrow(BadRequestException);

      expect(walletService.reverseTransaction).toHaveBeenCalledWith(
        "tx-1",
        "Transaction failed"
      );
    });

    it("leaves the transaction PENDING on a network/timeout error, without reversing", async () => {
      walletService.debit.mockResolvedValue({ id: "tx-1" } as any);
      const networkError: any = new Error("timeout of 30000ms exceeded");
      networkError.isAxiosError = true;
      vtpassService.purchase.mockRejectedValue(networkError);

      await service.purchaseAirtime(
        "user-1",
        NetworkProvider.MTN,
        "08012345678",
        500
      );

      expect(walletService.reverseTransaction).not.toHaveBeenCalled();
      expect(walletService.markTransactionStatus).toHaveBeenCalledWith(
        "tx-1",
        WalletTransactionStatus.PENDING
      );
    });
  });

  describe("purchaseData", () => {
    it("resolves the face-value amount from the variation code before debiting", async () => {
      vtpassService.getDataVariations.mockResolvedValue([
        {
          variation_code: "mtn-100mb-100",
          name: "100MB - N100",
          variation_amount: "100.00",
        },
      ] as any);
      walletService.debit.mockResolvedValue({ id: "tx-1" } as any);
      vtpassService.purchase.mockResolvedValue({
        code: "000",
        response_description: "successful",
        requestId: "req-1",
      } as any);

      await service.purchaseData(
        "user-1",
        NetworkProvider.MTN,
        "08012345678",
        "mtn-100mb-100"
      );

      expect(walletService.debit).toHaveBeenCalledWith(
        "user-1",
        100,
        WalletTransactionType.BILL_PURCHASE,
        expect.any(Object)
      );
    });

    it("throws when the variation code is unknown, without touching the wallet", async () => {
      vtpassService.getDataVariations.mockResolvedValue([]);

      await expect(
        service.purchaseData(
          "user-1",
          NetworkProvider.MTN,
          "08012345678",
          "bad-code"
        )
      ).rejects.toThrow(BadRequestException);
      expect(walletService.debit).not.toHaveBeenCalled();
    });
  });

  describe("getHistory", () => {
    it("proxies wallet transactions filtered to BILL_PURCHASE", async () => {
      walletService.getTransactions.mockResolvedValue([]);

      await service.getHistory("user-1");

      expect(walletService.getTransactions).toHaveBeenCalledWith("user-1", {
        type: WalletTransactionType.BILL_PURCHASE,
      });
    });
  });
});
