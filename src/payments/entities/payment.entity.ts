import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Errand } from '../../errands/entities/errand.entity';
import { User } from '../../users/entities/user.entity';

export enum PaymentType {
  ESCROW = 'escrow',
  PAYOUT = 'payout',
  REFUND = 'refund',
}

export enum PaymentStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  SUCCESS = 'success',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

@Entity('payments')
@Index(['errandId', 'status'])
@Index(['userId', 'status'])
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  errandId: string;

  @Column()
  userId: string;

  @Column('decimal', { precision: 10, scale: 2 })
  amount: number;

  @Column({
    type: 'enum',
    enum: PaymentType,
  })
  type: PaymentType;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  @Column({ unique: true, nullable: true })
  paystackReference?: string;

  @Column({ nullable: true })
  paystackAuthorizationUrl?: string;

  @Column('text', { nullable: true })
  description?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Errand)
  @JoinColumn({ name: 'errandId' })
  errand: Errand;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;
}

