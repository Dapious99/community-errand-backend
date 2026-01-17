import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  OneToOne,
  Index,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Errand } from '../../errands/entities/errand.entity';
import { KYC } from './kyc.entity';
import { Rating } from '../../ratings/entities/rating.entity';
import { Message } from '../../messages/entities/message.entity';

export enum UserRole {
  REQUESTER = 'requester',
  RUNNER = 'runner',
  BOTH = 'both',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @Index()
  email: string;

  @Column({ unique: true, nullable: true })
  @Index()
  phone?: string;

  @Column()
  name: string;

  @Column()
  @Exclude()
  passwordHash: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.REQUESTER,
  })
  role: UserRole;

  @Column({ default: false })
  verified: boolean;

  @Column('decimal', { precision: 3, scale: 2, default: 0 })
  ratingAvg: number;

  @Column({ nullable: true })
  avatarUrl?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  // Relations
  @OneToMany(() => Errand, (errand) => errand.requester)
  errandsPosted: Errand[];

  @OneToMany(() => Errand, (errand) => errand.runner)
  errandsAccepted: Errand[];

  @OneToOne(() => KYC, (kyc) => kyc.user)
  kyc?: KYC;

  @OneToMany(() => Rating, (rating) => rating.fromUser)
  ratingsGiven: Rating[];

  @OneToMany(() => Rating, (rating) => rating.toUser)
  ratingsReceived: Rating[];

  @OneToMany(() => Message, (message) => message.fromUser)
  messages: Message[];
}



