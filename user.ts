import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { SaaSMapping } from './SaaSMapping';

@Entity()
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ nullable: true })
  githubId?: string;

  @OneToMany(() => SaaSMapping, (mapping) => mapping.user)
  saasMappings: SaaSMapping[];
}
