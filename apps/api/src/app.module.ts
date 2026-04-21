import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import { Wallet, Transaction } from '@app/common';
import { WalletModule } from './wallet/wallet.module';
import { TransferModule } from './transfer/transfer.module';
import { TransactionModule } from './transaction/transaction.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    // Load .env file first so all other modules can access env vars
    ConfigModule.forRoot({ isGlobal: true }),

    // Structured JSON logging via Winston
    WinstonModule.forRoot({
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json(),
          ),
        }),
      ],
    }),

    // TypeORM with MySQL – synchronize:true is acceptable for dev; use migrations in prod
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        type: 'mysql',
        host: cfg.get('DB_HOST', 'localhost'),
        port: cfg.get<number>('DB_PORT', 3306),
        username: cfg.get('DB_USER', 'root'),
        password: cfg.get('DB_PASSWORD', 'root'),
        database: cfg.get('DB_NAME', 'wallet_db'),
        entities: [Wallet, Transaction],
        // DB_SYNCHRONIZE controls table creation; defaults to true so Docker works out of the box
        synchronize: cfg.get('DB_SYNCHRONIZE', 'true') === 'true',
      }),
    }),

    // BullMQ backed by Redis
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        redis: {
          host: cfg.get('REDIS_HOST', 'localhost'),
          port: cfg.get<number>('REDIS_PORT', 6379),
        },
      }),
    }),

    WalletModule,
    TransferModule,
    TransactionModule,
    HealthModule,
  ],
})
export class AppModule {}
