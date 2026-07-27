import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { WalletService } from "../wallet/wallet.service";
import { VtpassService } from "./services/vtpass.service";
import {
  WalletTransactionStatus,
  WalletTransactionType,
} from "../wallet/entities/wallet-transaction.entity";
import { NetworkProvider } from "./enums/network-provider.enum";

const VTPASS_SUCCESS_CODE = "000";

@Injectable()
export class BillsService {
  private readonly logger = new Logger(BillsService.name);

  constructor(
    private walletService: WalletService,
    private vtpassService: VtpassService
  ) {}

  async purchaseAirtime(
    userId: string,
    network: NetworkProvider,
    phone: string,
    amount: number
  ) {
    const requestId = this.vtpassService.generateRequestId();

    const transaction = await this.walletService.debit(
      userId,
      amount,
      WalletTransactionType.BILL_PURCHASE,
      {
        status: WalletTransactionStatus.PENDING,
        reference: requestId,
        description: `Airtime purchase (${network}) for ${phone}`,
        metadata: { network, phone, kind: "airtime" },
      }
    );

    return this.settle(transaction.id, () =>
      this.vtpassService.purchase({
        requestId,
        serviceID: network,
        phone,
        amount,
      })
    );
  }

  async purchaseData(
    userId: string,
    network: NetworkProvider,
    phone: string,
    variationCode: string
  ) {
    const serviceId = `${network}-data`;
    const variations = await this.vtpassService.getDataVariations(serviceId);
    const variation = variations.find(
      (v) => v.variation_code === variationCode
    );
    if (!variation) {
      throw new BadRequestException(
        `Unknown data plan variation "${variationCode}" for ${network}`
      );
    }
    const amount = Number(variation.variation_amount);

    const requestId = this.vtpassService.generateRequestId();

    const transaction = await this.walletService.debit(
      userId,
      amount,
      WalletTransactionType.BILL_PURCHASE,
      {
        status: WalletTransactionStatus.PENDING,
        reference: requestId,
        description: `Data purchase (${variation.name}) for ${phone}`,
        metadata: { network, phone, variationCode, kind: "data" },
      }
    );

    return this.settle(transaction.id, () =>
      this.vtpassService.purchase({
        requestId,
        serviceID: serviceId,
        phone,
        variationCode,
        billersCode: phone,
      })
    );
  }

  /**
   * Calls VTpass and resolves the pending wallet debit.
   *
   * - A response we actually received with a non-success code is a definite
   *   rejection (VTpass answered, just declined) - reverse the debit.
   * - A pre-flight error (e.g. missing VTpass credentials) means the request
   *   was never sent - also safe to reverse.
   * - A genuine network/timeout error (VTpass never responded) is the only
   *   truly ambiguous case - VTpass may have processed the request
   *   server-side despite the failure surfacing here - so it's left PENDING
   *   for manual reconciliation via VTpass's `/requery` endpoint, rather than
   *   risking a double-spend by auto-reversing.
   */
  private async settle(
    transactionId: string,
    call: () => ReturnType<VtpassService["purchase"]>
  ) {
    let result: Awaited<ReturnType<VtpassService["purchase"]>>;
    try {
      result = await call();
    } catch (error: any) {
      if (error.isAxiosError && !error.response) {
        this.logger.warn(
          `VTpass purchase for wallet transaction ${transactionId} could not be confirmed, left PENDING for manual reconciliation: ${error.message}`
        );
        return this.walletService.markTransactionStatus(
          transactionId,
          WalletTransactionStatus.PENDING
        );
      }

      await this.walletService.reverseTransaction(transactionId, error.message);
      throw new BadRequestException(`Bill purchase failed: ${error.message}`);
    }

    if (result.code === VTPASS_SUCCESS_CODE) {
      return this.walletService.markTransactionStatus(
        transactionId,
        WalletTransactionStatus.SUCCESS,
        {
          metadata: {
            vtpassTransactionId: result.content?.transactions?.transactionId,
            vtpassStatus: result.content?.transactions?.status,
          },
        }
      );
    }

    await this.walletService.reverseTransaction(
      transactionId,
      result.response_description ||
        `VTpass rejected the request (code ${result.code})`
    );
    throw new BadRequestException(
      result.response_description || "Bill purchase failed"
    );
  }

  async listDataPlans(network: NetworkProvider) {
    return this.vtpassService.getDataVariations(`${network}-data`);
  }

  async getHistory(userId: string) {
    return this.walletService.getTransactions(userId, {
      type: WalletTransactionType.BILL_PURCHASE,
    });
  }
}
