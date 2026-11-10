import { createApp } from './app.js';

async function bootstrap(): Promise<void> {
  const app = await createApp();
  await app.listen(Number(process.env.API_PORT ?? 4000));
}

void bootstrap();
