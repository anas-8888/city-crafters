import { IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreateTransferDto {
  @IsString()
  @IsNotEmpty()
  fromUserId: string;

  @IsString()
  @IsNotEmpty()
  toUserId: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'amount must be greater than zero' })
  @Max(1_000_000, { message: 'amount must not exceed 1,000,000' })
  amount: number;

  @IsOptional()
  @IsUUID()
  idempotencyKey?: string;
}
