import { Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { OutboxService } from './outbox.service.js';

/**
 * Polls the outbox. Runs inside the API process by default; set OUTBOX_POLL_MS=0 to turn it off
 * (integration tests drain explicitly, and a dedicated worker process can take over in production).
 */
@Injectable()
export class OutboxWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxWorker.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;

  constructor(private readonly outbox: OutboxService) {}

  onApplicationBootstrap(): void {
    const pollMs = Number(process.env.OUTBOX_POLL_MS ?? 1000);
    if (pollMs > 0) this.schedule(pollMs);
  }

  onApplicationShutdown(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private schedule(pollMs: number): void {
    this.timer = setTimeout(() => void this.tick(pollMs), pollMs);
  }

  private async tick(pollMs: number): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      await this.outbox.drain();
    } catch (error) {
      this.logger.error(`Outbox poll failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
      if (!this.stopped) this.schedule(pollMs);
    }
  }
}
