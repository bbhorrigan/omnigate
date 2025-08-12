import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { User } from './user';

@Entity({ name: 'saas_mappings' })
export class SaaSMapping {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 100, nullable: false })
  saasType!: string;

  @Column({ type: 'jsonb', nullable: false })
  credentials!: Record<string, any>;

  @ManyToOne(() => User, (user: User) => user.saasMappings, {
    onDelete: 'CASCADE', // Remove mappings if user is deleted
  })
  user!: User;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;
}
