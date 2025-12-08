import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

@Entity('conversations')
export class Conversation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'participant1_id' })
  participant1: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'participant2_id' })
  participant2: User;

  @Column({ type: 'timestamp', nullable: true })
  lastMessageAt: Date | null;

  // Track which users deleted this conversation
  @Column('simple-array', { default: '', nullable: true })
  deletedBy: string[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}