import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type Tx = Prisma.TransactionClient;
export type EventPayload = Record<string, string | number | boolean | null>;
type Handler = (payload: EventPayload) => Promise<void>;

interface ClaimedEvent {
  id: string;
  type: string;
  payload: EventPayload;
  attempts: number;
}

const LEASE_SECONDS = 60;
const MAX_ATTEMPTS = 8;

/**
 * Transactional outbox on PostgreSQL.
 *
 * `publish` writes the event in the caller's transaction, so an event exists if and only if
 * the change it describes was committed. `drain` delivers events at least once: a claimed
 * event is leased for LEASE_SECONDS and becomes visible again if the worker dies mid-handler.
 * Handlers must therefore be idempotent.
 *
 * The interface (publish / on / drain) is what a Redis-backed queue would replace later.
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);
  private readonly handlers = new Map<string, Handler[]>();

  constructor(private readonly prisma: PrismaService) {}

  on(type: string, handler: Handler): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
  }

  async publish(tx: Tx, type: string, payload: EventPayload): Promise<void> {
    await tx.outboxEvent.create({ data: { type, payload } });
  }

  /** Delivers due events until none are left (or `limit` is reached). Returns how many succeeded. */
  async drain(limit = 100): Promise<number> {
    let delivered = 0;
    for (let i = 0; i < limit; i++) {
      const event = await this.claim();
      if (!event) break;
      if (await this.deliver(event)) delivered++;
    }
    return delivered;
  }

  /** Atomically leases the oldest due event; SKIP LOCKED lets several workers run side by side. */
  private async claim(): Promise<ClaimedEvent | null> {
    const rows = await this.prisma.$queryRaw<ClaimedEvent[]>`
      UPDATE "OutboxEvent"
         SET "attempts" = "attempts" + 1,
             "availableAt" = now() + make_interval(secs => ${LEASE_SECONDS})
       WHERE "id" = (
               SELECT "id" FROM "OutboxEvent"
                WHERE "processedAt" IS NULL AND "failedAt" IS NULL AND "availableAt" <= now()
                ORDER BY "createdAt"
                LIMIT 1
                FOR UPDATE SKIP LOCKED)
      RETURNING "id", "type", "payload", "attempts"`;
    return rows[0] ?? null;
  }

  private async deliver(event: ClaimedEvent): Promise<boolean> {
    try {
      for (const handler of this.handlers.get(event.type) ?? []) await handler(event.payload);
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date(), lastError: null },
      });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const exhausted = event.attempts >= MAX_ATTEMPTS;
      this.logger.error(`Event ${event.type} ${event.id} failed (attempt ${event.attempts}): ${message}`);
      await this.prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          lastError: message.slice(0, 2000),
          // Exponential backoff: 2s, 4s, 8s … capped at 10 minutes.
          availableAt: new Date(Date.now() + Math.min(2 ** event.attempts * 1000, 600_000)),
          failedAt: exhausted ? new Date() : null,
        },
      });
      return false;
    }
  }
}
