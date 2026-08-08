import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from "typeorm";
import { User } from "./user.entity";

export enum KYCStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
}

@Entity("kyc")
export class KYC {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column({ nullable: true })
  bvn?: string;

  @Column({ nullable: true })
  nin?: string;

  @Column({ nullable: true })
  ninImageUrl?: string;

  @Column({ nullable: true })
  idCardUrl?: string;

  @Column({ nullable: true })
  bankAccountNumber?: string;

  @Column({ nullable: true })
  bankName?: string;

  // The name on the bank account itself, as registered with the bank - not
  // necessarily the same as the user's platform display name. Used as the
  // transfer recipient's registered name at withdrawal time (see
  // PaymentsService.initiateWithdrawal), so a mismatch is caught by the
  // bank rather than silently sending to the wrong name.
  @Column({ nullable: true })
  bankAccountName?: string;

  @Column({ nullable: true })
  paystackRecipientCode?: string;

  // Set once Dojah confirms a match for the submitted nin/bvn - this is only
  // an automated signal for the admin reviewer, it does not by itself
  // approve the KYC (see `status`/`approveKyc`/`rejectKyc`).
  @Column({ type: "timestamp", nullable: true })
  ninVerifiedAt?: Date;

  @Column({ type: "timestamp", nullable: true })
  bvnVerifiedAt?: Date;

  @Column("jsonb", { nullable: true })
  ninVerificationData?: Record<string, any>;

  @Column("jsonb", { nullable: true })
  bvnVerificationData?: Record<string, any>;

  @Column({
    type: "enum",
    enum: KYCStatus,
    default: KYCStatus.PENDING,
  })
  status: KYCStatus;

  @Column({ nullable: true })
  verifiedAt?: Date;

  @Column("text", { nullable: true })
  rejectionReason?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToOne(() => User, (user) => user.kyc)
  @JoinColumn({ name: "userId" })
  user: User;
}
