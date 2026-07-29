import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  OneToOne,
  Index,
} from "typeorm";
import { Exclude } from "class-transformer";
import { Errand } from "../../errands/entities/errand.entity";
import { KYC } from "./kyc.entity";
import { Rating } from "../../ratings/entities/rating.entity";
import { Message } from "../../messages/entities/message.entity";
import { DecimalColumnTransformer } from "../../common/transformers/decimal.transformer";

export enum UserRole {
  REQUESTER = "requester",
  RUNNER = "runner",
  BOTH = "both",
}

@Entity("users")
export class User {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ unique: true })
  @Index()
  email: string;

  @Column({ unique: true, nullable: true })
  @Index()
  phone?: string;

  @Column({ unique: true, nullable: true })
  @Index()
  username?: string;

  @Column()
  name: string;

  @Column()
  @Exclude()
  passwordHash: string;

  @Column({
    type: "enum",
    enum: UserRole,
    default: UserRole.BOTH,
  })
  role: UserRole;

  // Set the first (and only) time a user changes `role` away from its
  // register-time default - see UsersService.update, which rejects further
  // changes once this is set.
  @Column({ type: "timestamp", nullable: true })
  roleChangedAt?: Date;

  @Column({ default: false })
  verified: boolean;

  @Column("decimal", {
    precision: 3,
    scale: 2,
    default: 0,
    transformer: new DecimalColumnTransformer(),
  })
  ratingAvg: number;

  @Column({ nullable: true })
  avatarUrl?: string;

  @Column("decimal", {
    precision: 10,
    scale: 8,
    nullable: true,
    transformer: new DecimalColumnTransformer(),
  })
  lastLatitude?: number;

  @Column("decimal", {
    precision: 11,
    scale: 8,
    nullable: true,
    transformer: new DecimalColumnTransformer(),
  })
  lastLongitude?: number;

  @Column({ type: "timestamp", nullable: true })
  lastLocationAt?: Date;

  @Column({ type: "timestamp", nullable: true })
  proExpiresAt?: Date;

  @Column({ unique: true })
  @Index()
  referralCode: string;

  @Column({ nullable: true })
  referredByUserId?: string;

  // Additional profile detail, all optional - collected via profile edit,
  // not at signup.
  @Column({ type: "date", nullable: true })
  dateOfBirth?: string;

  @Column({ nullable: true })
  gender?: string;

  @Column({ nullable: true })
  maritalStatus?: string;

  @Column({ nullable: true })
  religion?: string;

  @Column({ nullable: true })
  address?: string;

  @Column({ nullable: true })
  state?: string;

  @Column({ nullable: true })
  city?: string;

  @Column({ nullable: true })
  occupation?: string;

  @Column({ nullable: true })
  employer?: string;

  @Column({ nullable: true })
  emergencyContactName?: string;

  @Column({ nullable: true })
  emergencyContactPhone?: string;

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
