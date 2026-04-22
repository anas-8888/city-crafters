import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Transaction, TransactionStatus, TRANSFER_JOB, TRANSFER_QUEUE, TransferJobPayload } from '@app/common';

@Injectable()
export class TransferRequeueService {
  private readonly logger = new Logger(TransferRequeueService.name);

  constructor(
    @InjectRepository(Transaction)
    private readonly transactionRepo: Repository<Transaction>,

    @InjectQueue(TRANSFER_QUEUE)
    private readonly transferQueue: Queue,
  ) {}

  /**
   * يعمل كل 5 دقائق ويبحث عن transactions بـ status=pending
   * أُنشئت منذ أكثر من 5 دقائق ولم تُعالَج — يعني الـ Job ضاع (Redis انقطع مثلاً).
   * يُعيد إضافتها للـ Queue بنفس jobId لتفادي التكرار.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async requeueStuckTransactions(): Promise<void> {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const stuck = await this.transactionRepo.find({
      where: {
        status: TransactionStatus.PENDING,
        createdAt: LessThan(fiveMinutesAgo),
      },
    });

    if (stuck.length === 0) return;

    this.logger.warn({ message: 'Found stuck transactions, re-queuing', count: stuck.length });

    for (const tx of stuck) {
      const payload: TransferJobPayload = {
        transactionId: tx.id,
        fromUserId: tx.fromUserId,
        toUserId: tx.toUserId,
        amount: parseFloat(tx.amount),
      };

      // jobId = transactionId يمنع التكرار لو الـ Job موجودة فعلاً
      await this.transferQueue.add(TRANSFER_JOB, payload, {
        jobId: tx.id,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: false,
        removeOnFail: false,
      });

      this.logger.log({ message: 'Re-queued stuck transaction', transactionId: tx.id });
    }
  }
}
