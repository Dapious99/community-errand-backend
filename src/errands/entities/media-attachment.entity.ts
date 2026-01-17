import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Errand } from './errand.entity';

export enum MediaType {
  IMAGE = 'image',
  VIDEO = 'video',
  DOCUMENT = 'document',
}

@Entity('media_attachments')
export class MediaAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  errandId: string;

  @Column()
  url: string;

  @Column({ nullable: true })
  cloudinaryId?: string;

  @Column({
    type: 'enum',
    enum: MediaType,
    default: MediaType.IMAGE,
  })
  type: MediaType;

  @ManyToOne(() => Errand, (errand) => errand.mediaAttachments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'errandId' })
  errand: Errand;
}



