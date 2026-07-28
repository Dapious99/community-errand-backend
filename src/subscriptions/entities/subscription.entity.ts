import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from "typeorm";
import { DecimalColumnTransformer } from "../../common/transformers/decimal.transformer";

export enum SubscriptionPlan {
  MONTHLY = "monthly",
  QUARTERLY = "quarterly",
  SEMI_ANNUAL = "semi_annual",
  ANNUAL = "annual",
}

export enum SubscriptionStatus {
  ACTIVE = "active",
  EXPIRED = "expired",
  CANCELLED = "cancelled",
}

@Entity("subscriptions")
@Index(["userId", "status"])
export class Subscription {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  userId: string;

  @Column({ type: "enum", enum: SubscriptionPlan })
  plan: SubscriptionPlan;

  @Column({
    type: "enum",
    enum: SubscriptionStatus,
    default: SubscriptionStatus.ACTIVE,
  })
  status: SubscriptionStatus;

  @Column({ type: "timestamp" })
  startedAt: Date;

  @Column({ type: "timestamp" })
  expiresAt: Date;

  @Column({ default: false })
  autoRenew: boolean;

  @Column("decimal", {
    precision: 12,
    scale: 2,
    transformer: new DecimalColumnTransformer(),
  })
  amountPaid: number;

  @Column({ nullable: true })
  walletTransactionId?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
