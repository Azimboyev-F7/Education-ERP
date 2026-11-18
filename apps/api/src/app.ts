import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { ApiExceptionFilter } from './common/api-exception.filter.js';
import { mountDocs } from './docs/docs.js';

/** Builds the HTTP application. Shared by the server entrypoint and the integration tests. */
export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: process.env.NODE_ENV === 'test' ? ['error'] : ['log', 'warn', 'error'],
  });
  app.use(cookieParser());
  // Both front-ends reach the API through their own /api rewrite, so no CORS is opened here.
  app.set('trust proxy', 1);
  app.useGlobalFilters(new ApiExceptionFilter());
  mountDocs(app);
  app.enableShutdownHooks();
  return app;
}
