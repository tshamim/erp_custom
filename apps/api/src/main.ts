import './config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/db-exception.filter';
import { config } from './config';

export async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: config.webOrigin, credentials: true });
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();
  await app.listen(config.port);
  console.log(`ERP API listening on http://localhost:${config.port}`);
}

if (require.main === module) void bootstrap();
