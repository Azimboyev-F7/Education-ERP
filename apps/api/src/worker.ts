/**
 * Standalone outbox worker: same modules as the API, no HTTP server.
 * Run this as a separate process and start the API with OUTBOX_POLL_MS=0
 * once event handling should scale independently of request handling.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule);
  app.enableShutdownHooks();
}

void bootstrap();
