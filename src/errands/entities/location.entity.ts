import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Errand } from './errand.entity';

export enum LocationType {
  PICKUP = 'pickup',
  DROPOFF = 'dropoff',
}

@Entity('locations')
export class Location {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  errandId: string;

  @Column({
    type: 'enum',
    enum: LocationType,
  })
  type: LocationType;

  @Column()
  label: string;

  @Column('decimal', { precision: 10, scale: 8, nullable: true })
  latitude?: number;

  @Column('decimal', { precision: 11, scale: 8, nullable: true })
  longitude?: number;

  @ManyToOne(() => Errand, (errand) => errand.locations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'errandId' })
  errand: Errand;
}

