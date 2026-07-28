import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Referral, ReferralStatus } from "./entities/referral.entity";
import { User } from "../users/entities/user.entity";
import { isProUser } from "../users/utils/is-pro-user";
import { WalletService } from "../wallet/wallet.service";
import { WalletTransactionType } from "../wallet/entities/wallet-transaction.entity";
import { SettingsService } from "../settings/settings.service";

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    @InjectRepository(Referral)
    private referralsRepository: Repository<Referral>,
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private walletService: WalletService,
    private settingsService: SettingsService
  ) {}

  /**
   * Eligibility is decided once, right here, at referral-creation time (i.e.
   * when the referred user signs up) - not later at payout time. Referring
   * is Pro-only, so if the referrer isn't currently Pro when the new user
   * signs up with their code, the referral is recorded as void immediately
   * (visible in their stats, but never eligible to pay out). If they *are*
   * Pro right now, it's locked in as pending - the bonus pays out on the
   * referred user's first completed errand regardless of whether the
   * referrer's Pro subscription has since lapsed by then.
   */
  async createPending(
    referrerId: string,
    referredUserId: string
  ): Promise<Referral> {
    const referrer = await this.usersRepository.findOne({
      where: { id: referrerId },
    });
    const eligible = !!referrer && isProUser(referrer);

    const referral = this.referralsRepository.create({
      referrerId,
      referredUserId,
      status: eligible ? ReferralStatus.PENDING : ReferralStatus.VOID,
    });

    if (!eligible) {
      this.logger.log(
        `Referral from ${referrerId} recorded as VOID - referrer wasn't Pro at signup time`
      );
    }

    return this.referralsRepository.save(referral);
  }

  /**
   * Called once, when the referred user's first errand completes (requester
   * or runner side - whichever happens first; the caller is responsible for
   * only invoking this on that first completion). Eligibility was already
   * locked in at `createPending` time, so finding a PENDING row here is
   * enough to pay out - no Pro re-check at this point.
   */
  async completeIfPending(referredUserId: string): Promise<void> {
    const referral = await this.referralsRepository.findOne({
      where: { referredUserId, status: ReferralStatus.PENDING },
    });
    if (!referral) {
      return;
    }

    const bonusAmount = await this.settingsService.get<number>(
      "referral_bonus_ngn",
      500
    );

    await this.walletService.credit(
      referral.referrerId,
      bonusAmount,
      WalletTransactionType.REFERRAL_BONUS,
      { description: "Referral bonus", metadata: { referredUserId } }
    );

    referral.status = ReferralStatus.COMPLETED;
    referral.bonusAmount = bonusAmount;
    referral.completedAt = new Date();
    await this.referralsRepository.save(referral);
  }

  async getStats(userId: string): Promise<{
    referralCode: string;
    pending: number;
    completed: number;
    void: number;
  }> {
    const user = await this.usersRepository.findOne({ where: { id: userId } });
    const [pending, completed, voided] = await Promise.all([
      this.referralsRepository.count({
        where: { referrerId: userId, status: ReferralStatus.PENDING },
      }),
      this.referralsRepository.count({
        where: { referrerId: userId, status: ReferralStatus.COMPLETED },
      }),
      this.referralsRepository.count({
        where: { referrerId: userId, status: ReferralStatus.VOID },
      }),
    ]);

    return {
      referralCode: user?.referralCode ?? "",
      pending,
      completed,
      void: voided,
    };
  }
}
