import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from "typeorm";
import { User } from "../../users/entities/user.entity";
import { DecimalColumnTransformer } from "../../common/transformers/decimal.transformer";

@Entity("wallets")
export class Wallet {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  userId: string;

  @Column("decimal", {
    precision: 12,
    scale: 2,
    default: 0,
    transformer: new DecimalColumnTransformer(),
  })
  balance: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToOne(() => User)
  @JoinColumn({ name: "userId" })
  user: User;
}
