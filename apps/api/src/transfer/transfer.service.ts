import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { v4 as uuidv4 } from 'uuid';
import { Transaction, TransactionStatus, Wallet, TRANSFER_JOB, TRANSFER_QUEUE, TransferJobPayload } from '@app/common';
import { CreateTransferDto } from './dto/create-transfer.dto';

@Injectable()
export class TransferService {
  private readonly logger = new Logger(TransferService.name);

  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,

    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,

    @InjectQueue(TRANSFER_QUEUE)
    private readonly transferQueue: Queue,
  ) {}

  async initiateTransfer(dto: CreateTransferDto) {
    const { fromUserId, toUserId, amount, idempotencyKey } = dto;

    // Basic business rule: sender ≠ receiver
    if (fromUserId === toUserId) {
      throw new BadRequestException('Sender and receiver must be different users');
    }

    // Idempotency: if a transaction with this key already exists, return it
    if (idempotencyKey) {
      const existing = await this.transactionRepo.findOne({ where: { idempotencyKey } });
      if (existing) {
        this.logger.warn({ message: 'Duplicate transfer request', idempotencyKey });
        return { status: existing.status, transactionId: existing.id };
      }
    }

    // Optimistic balance check (non-authoritative – the worker does the authoritative check with a lock)
    const senderWallet = await this.walletRepo.findOne({ where: { userId: fromUserId } });
    if (!senderWallet) {
      throw new NotFoundException(`Wallet not found for sender ${fromUserId}`);
    }

    const receiverWallet = await this.walletRepo.findOne({ where: { userId: toUserId } });
    if (!receiverWallet) {
      throw new NotFoundException(`Wallet not found for receiver ${toUserId}`);
    }

    if (parseFloat(senderWallet.balance) < amount) {
      throw new BadRequestException('Insufficient balance');
    }

    // Create a pending transaction record
    const transaction = this.transactionRepo.create({
      fromUserId,
      toUserId,
      amount: amount.toFixed(2),
      status: TransactionStatus.PENDING,
      idempotencyKey: idempotencyKey ?? null,
    });
    const saved = await this.transactionRepo.save(transaction);

    // Enqueue the job – use transactionId as the BullMQ job ID for deduplication
    const payload: TransferJobPayload = {
      transactionId: saved.id,
      fromUserId,
      toUserId,
      amount,
    };

    await this.transferQueue.add(TRANSFER_JOB, payload, {
      jobId: saved.id,          // deduplicates if enqueued twice
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: false,  // keep job records for auditing
      removeOnFail: false,
    });

    this.logger.log({ message: 'Transfer queued', transactionId: saved.id });

    return { status: 'processing', transactionId: saved.id };
  }
}
