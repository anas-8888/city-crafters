import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, NotEquals, Min } from 'class-validator';

export class CreateTransferDto {
  @IsString()
  @IsNotEmpty()
  fromUserId: string;

  @IsString()
  @IsNotEmpty()
  toUserId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'amount must be greater than zero' })
  amount: number;

  /**
   * Optional client-supplied idempotency key (e.g. UUID v4).
   * If provided, duplicate requests with the same key are rejected rather than
   * re-processed, preventing double-spending on network retries.
   */
  @IsOptional()
  @IsUUID()
  idempotencyKey?: string;
}
