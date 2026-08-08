import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { KYC, KYCStatus } from "../users/entities/kyc.entity";
import { SubmitIdentityDto } from "./dto/submit-identity.dto";
import { SubmitBankDetailsDto } from "./dto/submit-bank-details.dto";
import { UsersService } from "../users/users.service";
import { OtpService } from "../otp/otp.service";
import { OtpPurpose } from "../otp/otp-purpose.enum";
import { DojahService } from "./services/dojah.service";

@Injectable()
export class KycService {
  constructor(
    @InjectRepository(KYC)
    private kycRepository: Repository<KYC>,
    private usersService: UsersService,
    private otpService: OtpService,
    private dojahService: DojahService
  ) {}

  /**
   * Identity fields only (nin/ninImageUrl/bvn/idCardUrl) - kept entirely
   * separate from bank details (see submitBankDetails) so a bank-detail
   * change can never piggyback through the identity form, and vice versa.
   * This is what drives the KYC `status` (pending/approved/rejected).
   */
  async submitIdentity(
    userId: string,
    dto: SubmitIdentityDto
  ): Promise<KYC> {
    const kyc = await this.kycRepository.findOne({ where: { userId } });

    // Only re-verify with Dojah when the nin/bvn value is actually new -
    // re-submitting unrelated fields (e.g. re-uploading an ID photo)
    // shouldn't refire a paid lookup for a value that was already checked.
    const ninChanged = !kyc || kyc.nin !== dto.nin;
    const bvnChanged = !!dto.bvn && (!kyc || kyc.bvn !== dto.bvn);

    const verification: Partial<KYC> = {};
    if (ninChanged) {
      const result = await this.dojahService.verifyNin(dto.nin);
      verification.ninVerificationData = result.data ?? { error: result.error };
      if (result.verified) verification.ninVerifiedAt = new Date();
    }
    if (bvnChanged && dto.bvn) {
      const result = await this.dojahService.verifyBvn(dto.bvn);
      verification.bvnVerificationData = result.data ?? { error: result.error };
      if (result.verified) verification.bvnVerifiedAt = new Date();
    }

    if (kyc) {
      Object.assign(kyc, dto, verification, {
        // A re-upload/edit to an already-approved identity (e.g. a fresh ID
        // photo) doesn't need to go back through review by itself.
        status:
          kyc.status === KYCStatus.APPROVED ? kyc.status : KYCStatus.PENDING,
      });
      return this.kycRepository.save(kyc);
    }

    const newKyc = this.kycRepository.create({
      ...verification,
      ...dto,
      userId,
      status: KYCStatus.PENDING,
    });
    return this.kycRepository.save(newKyc);
  }

  /**
   * Bank details only (bankAccountNumber/bankName) - never touches identity
   * fields or the KYC review status. Changing bank details on an already-
   * APPROVED identity requires an emailed OTP (see confirmBankChange);
   * otherwise it's just saved directly.
   */
  async submitBankDetails(
    userId: string,
    dto: SubmitBankDetailsDto
  ): Promise<KYC | { requiresConfirmation: true; message: string }> {
    const user = await this.usersService.findOne(userId);
    const kyc = await this.kycRepository.findOne({ where: { userId } });

    const isBankChange =
      !!kyc &&
      kyc.status === KYCStatus.APPROVED &&
      (dto.bankAccountNumber !== kyc.bankAccountNumber ||
        dto.bankName !== kyc.bankName ||
        dto.bankAccountName !== kyc.bankAccountName);

    if (isBankChange) {
      await this.otpService.request(
        OtpPurpose.BANK_CHANGE,
        userId,
        user.email,
        {
          pendingChanges: dto,
        }
      );

      return {
        requiresConfirmation: true,
        message:
          "A confirmation code has been emailed to you to approve this bank detail change.",
      };
    }

    if (kyc) {
      Object.assign(kyc, dto);
      return this.kycRepository.save(kyc);
    }

    const newKyc = this.kycRepository.create({
      ...dto,
      userId,
      status: KYCStatus.PENDING,
    });
    return this.kycRepository.save(newKyc);
  }

  /**
   * Requires a pending bank-change OTP to actually exist - unlike
   * `resendVerification`/`forgotPassword`, this is behind JWT auth already
   * (no email-enumeration concern), so it's fine to surface a direct error
   * rather than a generic response when there's nothing pending.
   */
  async resendBankChangeCode(userId: string): Promise<{ message: string }> {
    const user = await this.usersService.findOne(userId);
    await this.otpService.resend(OtpPurpose.BANK_CHANGE, userId, user.email);
    return { message: "A new confirmation code has been emailed to you." };
  }

  async confirmBankChange(userId: string, code: string): Promise<KYC> {
    const metadata = await this.otpService.verify(
      OtpPurpose.BANK_CHANGE,
      userId,
      code
    );
    const kyc = await this.getKyc(userId);

    Object.assign(kyc, metadata?.pendingChanges, { status: KYCStatus.PENDING });
    return this.kycRepository.save(kyc);
  }

  async getKyc(userId: string): Promise<KYC> {
    const kyc = await this.kycRepository.findOne({ where: { userId } });

    if (!kyc) {
      throw new NotFoundException("KYC submission not found");
    }

    return kyc;
  }

  async listKycByStatus(status?: KYCStatus): Promise<KYC[]> {
    return this.kycRepository.find({
      where: status ? { status } : {},
      relations: ["user"],
      order: { createdAt: "ASC" },
    });
  }

  async approveKyc(userId: string): Promise<KYC> {
    const kyc = await this.getKyc(userId);
    kyc.status = KYCStatus.APPROVED;
    kyc.verifiedAt = new Date();
    kyc.rejectionReason = undefined;
    return this.kycRepository.save(kyc);
  }

  async rejectKyc(userId: string, reason: string): Promise<KYC> {
    const kyc = await this.getKyc(userId);
    kyc.status = KYCStatus.REJECTED;
    kyc.rejectionReason = reason;
    return this.kycRepository.save(kyc);
  }
}
