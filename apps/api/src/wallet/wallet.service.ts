import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Wallet } from '@app/common';
import { CreateWalletDto } from './dto/create-wallet.dto';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepo: Repository<Wallet>,
  ) {}

  async create(dto: CreateWalletDto): Promise<Wallet> {
    const existing = await this.walletRepo.findOne({
      where: { userId: dto.userId },
    });

    if (existing) {
      throw new ConflictException(`Wallet already exists for user ${dto.userId}`);
    }

    const wallet = this.walletRepo.create({ userId: dto.userId, balance: '0.00' });
    const saved = await this.walletRepo.save(wallet);
    this.logger.log({ message: 'Wallet created', userId: dto.userId, walletId: saved.id });
    return saved;
  }

  async findByUserId(userId: string): Promise<Wallet> {
    const wallet = await this.walletRepo.findOne({ where: { userId } });
    if (!wallet) {
      throw new NotFoundException(`Wallet not found for user ${userId}`);
    }
    return wallet;
  }
}
