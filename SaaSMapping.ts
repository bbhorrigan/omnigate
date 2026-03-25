import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';
import { User } from './user';

@Entity({ name: 'saas_mappings' })
@Unique(['userId', 'saasType'])
export class SaaSMapping {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 100, nullable: false })
  saasType!: string;

  @Column({ type: 'jsonb', nullable: false })
  credentials!: Record<string, any>;

  @Column()
  userId!: string;

  @ManyToOne(() => User, (user: User) => user.saasMappings, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @CreateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;
}
