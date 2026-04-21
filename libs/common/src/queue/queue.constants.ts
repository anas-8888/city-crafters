export const TRANSFER_QUEUE = 'transfer-queue';

export const TRANSFER_JOB = 'process-transfer';

export interface TransferJobPayload {
  transactionId: string;
  fromUserId: string;
  toUserId: string;
  amount: number;
}
