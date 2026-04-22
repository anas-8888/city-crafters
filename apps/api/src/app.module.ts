import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bull';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import { Wallet, Transaction } from '@app/common';
import { WalletModule } from './wallet/wallet.module';
import { TransferModule } from './transfer/transfer.module';
import { TransactionModule } from './transaction/transaction.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

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

    // Rate limiting: max 20 requests per minute per IP across all endpoints
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 20 }]),

    // Enables @Cron() decorators for scheduled tasks (e.g. requeue stuck transactions)
    ScheduleModule.forRoot(),

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
        synchronize: cfg.get('DB_SYNCHRONIZE', 'true') === 'true',
      }),
    }),

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
  providers: [
    // تطبيق الـ rate limit على جميع الـ endpoints تلقائياً
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
