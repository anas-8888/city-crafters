import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Job } from 'bull';
import { DataSource } from 'typeorm';
import {
  TransactionStatus,
  TransferJobPayload,
  TRANSFER_JOB,
  TRANSFER_QUEUE,
} from '@app/common';
import { Wallet } from '@app/common/entities/wallet.entity';
import { Transaction } from '@app/common/entities/transaction.entity';

@Processor(TRANSFER_QUEUE)
export class TransferProcessor {
  private readonly logger = new Logger(TransferProcessor.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  @Process(TRANSFER_JOB)
  async handleTransfer(job: Job<TransferJobPayload>): Promise<void> {
    const { transactionId, fromUserId, toUserId, amount } = job.data;
    this.logger.log({ message: 'Processing transfer job', transactionId, attempt: job.attemptsMade + 1 });

    // Idempotency guard: if this transaction was already completed/failed, skip re-processing.
    // This handles the case where a worker crash triggers a retry after partial execution.
    const txRepo = this.dataSource.getRepository(Transaction);
    const existingTx = await txRepo.findOne({ where: { id: transactionId } });

    if (!existingTx) {
      this.logger.error({ message: 'Transaction record not found', transactionId });
      throw new Error(`Transaction ${transactionId} not found`);
    }

    if (existingTx.status !== TransactionStatus.PENDING) {
      this.logger.warn({ message: 'Transaction already settled, skipping', transactionId, status: existingTx.status });
      return; // idempotent – do nothing
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction('READ COMMITTED');

    try {
      /**
       * Acquire row-level locks on BOTH wallets using SELECT … FOR UPDATE.
       *
       * We always lock in a deterministic order (alphabetical userId) to prevent
       * deadlocks when two concurrent transfers involve the same pair of users in
       * opposite directions (classic "dining philosophers" deadlock scenario).
       */
      const [firstId, secondId] = [fromUserId, toUserId].sort();

      const walletRepo = queryRunner.manager.getRepository(Wallet);

      const firstWallet = await walletRepo
        .createQueryBuilder('wallet')
        .setLock('pessimistic_write')
        .where('wallet.userId = :userId', { userId: firstId })
        .getOne();

      const secondWallet = await walletRepo
        .createQueryBuilder('wallet')
        .setLock('pessimistic_write')
        .where('wallet.userId = :userId', { userId: secondId })
        .getOne();

      if (!firstWallet || !secondWallet) {
        throw new Error('One or both wallets not found during transfer processing');
      }

      // Identify sender/receiver from the locked wallets
      const senderWallet = firstId === fromUserId ? firstWallet : secondWallet;
      const receiverWallet = firstId === fromUserId ? secondWallet : firstWallet;

      const senderBalance = parseFloat(senderWallet.balance);

      // Authoritative balance check (inside the lock – prevents race conditions)
      if (senderBalance < amount) {
        throw new InsufficientFundsError(
          `Insufficient funds: balance ${senderBalance}, required ${amount}`,
        );
      }

      // Update balances
      senderWallet.balance = (senderBalance - amount).toFixed(2);
      receiverWallet.balance = (parseFloat(receiverWallet.balance) + amount).toFixed(2);

      await queryRunner.manager.save(Wallet, [senderWallet, receiverWallet]);

      // Mark transaction completed
      existingTx.status = TransactionStatus.COMPLETED;
      await queryRunner.manager.save(Transaction, existingTx);

      await queryRunner.commitTransaction();
      this.logger.log({ message: 'Transfer completed', transactionId });
    } catch (err) {
      await queryRunner.rollbackTransaction();

      const isPermanent = err instanceof InsufficientFundsError;
      const errorMessage = err instanceof Error ? err.message : String(err);

      this.logger.error({ message: 'Transfer failed', transactionId, error: errorMessage, permanent: isPermanent });

      if (isPermanent) {
        // Mark as failed immediately – no point retrying insufficient funds
        await txRepo.update(transactionId, {
          status: TransactionStatus.FAILED,
          failureReason: errorMessage,
        });
        return; // returning without re-throwing prevents BullMQ from retrying
      }

      // For transient errors (DB outage, deadlock, etc.) let BullMQ retry
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}

/** Sentinel error class so the processor can distinguish permanent failures from transient ones. */
class InsufficientFundsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsufficientFundsError';
  }
}
