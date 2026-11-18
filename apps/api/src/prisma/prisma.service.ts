import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set');
    // The pool defaults to 10. Prisma's local dev database drops connections when many are open at
    // once, so set DB_POOL_MAX=2 when developing against it. Real PostgreSQL needs no setting.
    const max = Number(process.env.DB_POOL_MAX) || undefined;
    super({ adapter: new PrismaPg({ connectionString, ...(max ? { max } : {}) }) });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
