import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Errand } from '../../errands/entities/errand.entity';

@Entity('ratings')
@Index(['toUserId', 'createdAt'])
@Index(['errandId'])
export class Rating {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  errandId: string;

  @Column()
  fromUserId: string;

  @Column()
  toUserId: string;

  @Column('int')
  rating: number; // 1-5

  @Column('text', { nullable: true })
  review?: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Errand, (errand) => errand.ratings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'errandId' })
  errand: Errand;

  @ManyToOne(() => User, (user) => user.ratingsGiven)
  @JoinColumn({ name: 'fromUserId' })
  fromUser: User;

  @ManyToOne(() => User, (user) => user.ratingsReceived)
  @JoinColumn({ name: 'toUserId' })
  toUser: User;
}



