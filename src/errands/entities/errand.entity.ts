import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Location } from './location.entity';
import { MediaAttachment } from './media-attachment.entity';
import { Message } from '../../messages/entities/message.entity';
import { Rating } from '../../ratings/entities/rating.entity';

export enum ErrandStatus {
  OPEN = 'open',
  ACCEPTED = 'accepted',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

export enum ErrandCategory {
  DELIVERY = 'delivery',
  BUY_FOR_ME = 'buy_for_me',
  QUEUE = 'queue',
  REPAIR = 'repair',
  CUSTOM = 'custom',
}

export enum UrgencyLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

@Entity('errands')
@Index(['status', 'createdAt'])
export class Errand {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  title: string;

  @Column('text')
  description: string;

  @Column({
    type: 'enum',
    enum: ErrandCategory,
  })
  category: ErrandCategory;

  @Column('decimal', { precision: 10, scale: 2 })
  price: number;

  @Column('decimal', { precision: 10, scale: 2, nullable: true })
  tip?: number;

  @Column({
    type: 'enum',
    enum: ErrandStatus,
    default: ErrandStatus.OPEN,
  })
  status: ErrandStatus;

  @Column({
    type: 'enum',
    enum: UrgencyLevel,
    default: UrgencyLevel.MEDIUM,
  })
  urgency: UrgencyLevel;

  @Column({ nullable: true })
  runnerId?: string;

  @Column({ nullable: true })
  etaMinutes?: number;

  @Column({ type: 'timestamp', nullable: true })
  timeWindowStart?: Date;

  @Column({ type: 'timestamp', nullable: true })
  timeWindowEnd?: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt?: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @ManyToOne(() => User, (user) => user.errandsPosted)
  @JoinColumn({ name: 'requesterId' })
  requester: User;

  @Column()
  requesterId: string;

  @ManyToOne(() => User, (user) => user.errandsAccepted, { nullable: true })
  @JoinColumn({ name: 'runnerId' })
  runner?: User;

  @OneToMany(() => Location, (location) => location.errand, { cascade: true })
  locations: Location[];

  @OneToMany(() => MediaAttachment, (media) => media.errand, { cascade: true })
  mediaAttachments: MediaAttachment[];

  @OneToMany(() => Message, (message) => message.errand)
  messages: Message[];

  @OneToMany(() => Rating, (rating) => rating.errand)
  ratings: Rating[];
}

