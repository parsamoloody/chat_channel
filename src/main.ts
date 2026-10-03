import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app/app.module';
import { GlobalHttpExceptionFilter } from './shared/presentation/http-exception.filter';
import { getEnvConfig } from './shared/infrastructure/config/env.config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const config = getEnvConfig();

  const app = await NestFactory.create(AppModule, {
    logger: config.NODE_ENV === 'test' ? false : ['log', 'warn', 'error', 'debug'],
  });

  app.useGlobalFilters(new GlobalHttpExceptionFilter());
  app.enableShutdownHooks();

  const port = config.PORT;
  await app.listen(port);
  logger.log(`Hidden Chat Bot Modular Monolith running on port ${port} (env: ${config.NODE_ENV})`);
}

bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
