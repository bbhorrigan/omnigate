import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { SaaSMapping } from './SaaSMapping';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', unique: true })
  email!: string;

  @Column({ type: 'varchar', nullable: true })
  githubId?: string;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt!: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt!: Date;

  @OneToMany(() => SaaSMapping, mapping => mapping.user, { cascade: true })
  saasMappings!: SaaSMapping[];
}
