import { Entity, PrimaryColumn, Column, UpdateDateColumn } from "typeorm";

@Entity("platform_settings")
export class PlatformSetting {
  @PrimaryColumn()
  key: string;

  @Column("text")
  value: string;

  @Column({ nullable: true })
  description?: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
