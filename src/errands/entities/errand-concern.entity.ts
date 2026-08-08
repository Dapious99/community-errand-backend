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
import { Errand } from "./errand.entity";

export enum ErrandConcernStatus {
  OPEN = "open",
  ACKNOWLEDGED = "acknowledged",
  RESOLVED = "resolved",
  REOPENED = "reopened",
}

export enum ErrandConcernReopenedBy {
  SYSTEM = "system",
  ADMIN = "admin",
  RUNNER = "runner",
}

@Entity("errand_concerns")
@Index(["errandId", "status"])
export class ErrandConcern {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  errandId: string;

  @ManyToOne(() => Errand, (errand) => errand.concerns)
  @JoinColumn({ name: "errandId" })
  errand: Errand;

  @Column()
  raisedByUserId: string;

  @Column("text")
  reason: string;

  @Column({
    type: "enum",
    enum: ErrandConcernStatus,
    default: ErrandConcernStatus.OPEN,
  })
  status: ErrandConcernStatus;

  @Column("text", { nullable: true })
  runnerReply?: string;

  @Column({ type: "timestamp", nullable: true })
  acknowledgedAt?: Date;

  @Column({ type: "timestamp", nullable: true })
  resolvedAt?: Date;

  @Column({ type: "timestamp", nullable: true })
  reopenedAt?: Date;

  @Column({ type: "enum", enum: ErrandConcernReopenedBy, nullable: true })
  reopenedBy?: ErrandConcernReopenedBy;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
