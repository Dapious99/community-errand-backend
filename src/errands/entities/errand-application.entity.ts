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
import { User } from "../../users/entities/user.entity";

export enum ErrandApplicationStatus {
  PENDING = "pending",
  ACCEPTED = "accepted",
  DECLINED = "declined",
}

@Entity("errand_applications")
@Index(["errandId", "runnerId"], { unique: true })
export class ErrandApplication {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  errandId: string;

  @Column()
  runnerId: string;

  @Column({
    type: "enum",
    enum: ErrandApplicationStatus,
    default: ErrandApplicationStatus.PENDING,
  })
  status: ErrandApplicationStatus;

  @Column("text", { nullable: true })
  message?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Errand, { onDelete: "CASCADE" })
  @JoinColumn({ name: "errandId" })
  errand: Errand;

  @ManyToOne(() => User)
  @JoinColumn({ name: "runnerId" })
  runner: User;
}
