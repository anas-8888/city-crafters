import { NestFactory } from '@nestjs/core';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { WorkerAppModule } from './worker-app.module';

async function bootstrap() {
  const app = await NestFactory.create(WorkerAppModule, { bufferLogs: true });
  app.useLogger(app.get(WINSTON_MODULE_NEST_PROVIDER));

  // Worker does not expose HTTP – it only processes queue jobs.
  // We still call listen() to keep the process alive.
  await app.listen(0);
  console.log('Worker service started');
}

bootstrap();
