import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";
import { DecimalColumnTransformer } from "../../common/transformers/decimal.transformer";

export enum ReferralStatus {
  PENDING = "pending",
  COMPLETED = "completed",
  VOID = "void",
}

@Entity("referrals")
@Index(["referrerId", "status"])
export class Referral {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  referrerId: string;

  @Column({ unique: true })
  referredUserId: string;

  @Column({
    type: "enum",
    enum: ReferralStatus,
    default: ReferralStatus.PENDING,
  })
  status: ReferralStatus;

  @Column("decimal", {
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: new DecimalColumnTransformer(),
  })
  bonusAmount?: number;

  @Column({ type: "timestamp", nullable: true })
  completedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;
}
