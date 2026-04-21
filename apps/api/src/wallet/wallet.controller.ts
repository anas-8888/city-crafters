import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { CreateWalletDto } from './dto/create-wallet.dto';

@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateWalletDto) {
    return this.walletService.create(dto);
  }

  @Get(':userId')
  getBalance(@Param('userId') userId: string) {
    return this.walletService.findByUserId(userId);
  }
}
