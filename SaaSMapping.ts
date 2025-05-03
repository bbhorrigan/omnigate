import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { User } from './User';

@Entity()
export class SaaSMapping {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  saasType: string;

  @Column('jsonb')
  credentials: Record<string, any>;

  @ManyToOne(() => User, (user) => user.saasMappings)
  user: User;
}
