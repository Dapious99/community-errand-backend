import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum KYCStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('kyc')
export class KYC {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ nullable: true })
  bvn?: string;

  @Column({ nullable: true })
  idCardUrl?: string;

  @Column({ nullable: true })
  bankAccountNumber?: string;

  @Column({ nullable: true })
  bankName?: string;

  @Column({
    type: 'enum',
    enum: KYCStatus,
    default: KYCStatus.PENDING,
  })
  status: KYCStatus;

  @Column({ nullable: true })
  verifiedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToOne(() => User, (user) => user.kyc)
  @JoinColumn({ name: 'userId' })
  user: User;
}



