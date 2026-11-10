import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.use(cookieParser());
  // Both front-ends reach the API through their own /api rewrite, so no CORS is opened here.
  app.set('trust proxy', 1);
  app.enableShutdownHooks();
  await app.listen(Number(process.env.API_PORT ?? 4000));
}

void bootstrap();
