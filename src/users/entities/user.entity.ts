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

  // WhatsApp channel identity - deliberately separate from `phone`, which has
  // no verification flag and may not be the same number a user chats from
  // (shared/family devices are common). Set once via the link-code flow in
  // WhatsappIdentityService.
  @Column({ unique: true, nullable: true })
  @Index()
  whatsappNumber?: string;

  @Column({ type: "timestamp", nullable: true })
  whatsappVerifiedAt?: Date;

  @Column()
  name: string;

  // Drives which currency/payment gateway a user sees - collected at signup.
  // Nullable because existing accounts predate this field (backfilled to
  // "Nigeria" - the only market this platform has ever operated in so far).
  @Column({ nullable: true })
  country?: string;

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

  // Consecutive errand-completion failures as a runner (unresolved concern
  // timeout, self-release, or missed timed-errand deadline). Reset to 0 by
  // any successful completion; hitting 3 triggers an escalating pick-up ban
  // (72h, then 7 days, then permanent) and resets back to 0 - see
  // UsersService.recordErrandFailure/resetErrandFailures.
  @Column({ default: 0 })
  consecutiveErrandFailures: number;

  // Typed `| null` (not just optional) because clearing this column requires
  // assigning `null` before `.save()` - TypeORM silently omits `undefined`
  // properties from the generated UPDATE instead of nulling them out.
  @Column({ type: "timestamp", nullable: true })
  runnerBannedUntil?: Date | null;

  // How many times a 3-strike ban has already been issued - determines the
  // next ban's length (0 -> 72h, 1 -> 7 days, 2+ -> permanent).
  @Column({ default: 0 })
  banEscalationLevel: number;

  // Set once escalation reaches its final tier. Unlike `runnerBannedUntil`,
  // this never expires on its own - only an admin can clear it (see
  // UsersService.liftPermanentBan).
  @Column({ default: false })
  permanentlyBannedFromPicking: boolean;

  // Mirror of the four fields above, but for repeated errand cancellations
  // as a requester (see ErrandsService.cancel/assertRequesterEligible) -
  // same 3-strike, 72h/7-day/permanent escalation, just gating "post"
  // instead of "pick". Reset to 0 by any of the requester's own posted
  // errands completing successfully.
  @Column({ default: 0 })
  consecutivePostingFailures: number;

  @Column({ type: "timestamp", nullable: true })
  requesterBannedUntil?: Date | null;

  @Column({ default: 0 })
  postingBanEscalationLevel: number;

  @Column({ default: false })
  permanentlyBannedFromPosting: boolean;

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

  @Column({ default: true })
  notifyNewErrandsNearby: boolean;

  @Column({ default: true })
  notifyBoostedErrandAlerts: boolean;

  @Column({ default: true })
  notifyNewMessages: boolean;

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
