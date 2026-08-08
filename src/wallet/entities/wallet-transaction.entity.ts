import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import { Wallet } from "./wallet.entity";
import { DecimalColumnTransformer } from "../../common/transformers/decimal.transformer";

export enum WalletTransactionType {
  EARNING = "earning",
  WITHDRAWAL = "withdrawal",
  BILL_PURCHASE = "bill_purchase",
  REVERSAL = "reversal",
  DEPOSIT = "deposit",
  ERRAND_PAYMENT = "errand_payment",
  SUBSCRIPTION = "subscription",
  REFERRAL_BONUS = "referral_bonus",
  BOOST = "boost",
  BUSINESS_CREDIT_PURCHASE = "business_credit_purchase",
}

export enum WalletTransactionStatus {
  PENDING = "pending",
  PROCESSING = "processing",
  SUCCESS = "success",
  FAILED = "failed",
}

@Entity("wallet_transactions")
@Index(["userId", "type"])
export class WalletTransaction {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  walletId: string;

  @Column()
  @Index()
  userId: string;

  @Column({ type: "enum", enum: WalletTransactionType })
  type: WalletTransactionType;

  @Column("decimal", {
    precision: 12,
    scale: 2,
    transformer: new DecimalColumnTransformer(),
  })
  amount: number;

  @Column({
    type: "enum",
    enum: WalletTransactionStatus,
    default: WalletTransactionStatus.PENDING,
  })
  status: WalletTransactionStatus;

  @Column("decimal", {
    precision: 12,
    scale: 2,
    transformer: new DecimalColumnTransformer(),
  })
  balanceAfter: number;

  @Column({ nullable: true })
  errandId?: string;

  @Column({ nullable: true })
  @Index()
  reference?: string;

  @Column("text", { nullable: true })
  description?: string;

  @Column("jsonb", { nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Wallet)
  @JoinColumn({ name: "walletId" })
  wallet: Wallet;
}
