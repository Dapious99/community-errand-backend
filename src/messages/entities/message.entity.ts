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

@Entity('messages')
@Index(['errandId', 'createdAt'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  errandId: string;

  @Column()
  fromUserId: string;

  @Column('text')
  text: string;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Errand, (errand) => errand.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'errandId' })
  errand: Errand;

  @ManyToOne(() => User, (user) => user.messages)
  @JoinColumn({ name: 'fromUserId' })
  fromUser: User;
}

