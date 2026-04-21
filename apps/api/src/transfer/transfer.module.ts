import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { Transaction, Wallet, TRANSFER_QUEUE } from '@app/common';
import { TransferController } from './transfer.controller';
import { TransferService } from './transfer.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Wallet, Transaction]),
    BullModule.registerQueue({ name: TRANSFER_QUEUE }),
  ],
  controllers: [TransferController],
  providers: [TransferService],
})
export class TransferModule {}
