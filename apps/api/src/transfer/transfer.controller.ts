import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { TransferService } from './transfer.service';
import { CreateTransferDto } from './dto/create-transfer.dto';

@Controller('transfer')
export class TransferController {
  constructor(private readonly transferService: TransferService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  initiateTransfer(@Body() dto: CreateTransferDto) {
    return this.transferService.initiateTransfer(dto);
  }
}
