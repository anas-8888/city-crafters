import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('wallets')
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // unique: true creates a UNIQUE KEY in MySQL which is already an index — no need for @Index()
  @Column({ name: 'user_id', unique: true })
  userId: string;

  /**
   * Stored as DECIMAL(18,2) to avoid floating-point rounding errors.
   * TypeORM returns DECIMAL columns as strings; we parse in the service layer.
   */
  @Column({ type: 'decimal', precision: 18, scale: 2, default: '0.00' })
  balance: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
