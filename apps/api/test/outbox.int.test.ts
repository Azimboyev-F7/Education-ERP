import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetDb, startApp, type TestApp } from './harness.js';

describe('outbox', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await startApp();
    await resetDb(t.prisma);
  });

  afterAll(async () => {
    await t.close();
  });

  it('does not deliver an event whose transaction rolled back', async () => {
    const seen: unknown[] = [];
    t.outbox.on('test.rollback', async (payload) => void seen.push(payload));

    await expect(
      t.prisma.$transaction(async (tx) => {
        await t.outbox.publish(tx, 'test.rollback', { n: 1 });
        throw new Error('change failed');
      }),
    ).rejects.toThrow('change failed');

    expect(await t.outbox.drain()).toBe(0);
    expect(seen).toEqual([]);
  });

  it('retries a failing handler with backoff and delivers once it succeeds', async () => {
    let calls = 0;
    t.outbox.on('test.flaky', async () => {
      calls++;
      if (calls === 1) throw new Error('temporary');
    });
    await t.prisma.$transaction((tx) => t.outbox.publish(tx, 'test.flaky', { n: 2 }));

    expect(await t.outbox.drain()).toBe(0);
    const failed = await t.prisma.outboxEvent.findFirstOrThrow({ where: { type: 'test.flaky' } });
    expect(failed).toMatchObject({ attempts: 1, lastError: 'temporary', processedAt: null, failedAt: null });
    expect(failed.availableAt.getTime()).toBeGreaterThan(Date.now());

    // Not due yet, so another drain leaves it alone.
    expect(await t.outbox.drain()).toBe(0);
    expect(calls).toBe(1);

    await t.prisma.outboxEvent.update({ where: { id: failed.id }, data: { availableAt: new Date(0) } });
    expect(await t.outbox.drain()).toBe(1);
    const delivered = await t.prisma.outboxEvent.findUniqueOrThrow({ where: { id: failed.id } });
    expect(delivered.processedAt).not.toBeNull();
    expect(delivered).toMatchObject({ attempts: 2, lastError: null });
  });

  it('parks an event as failed after the maximum number of attempts', async () => {
    t.outbox.on('test.poison', async () => {
      throw new Error('always');
    });
    await t.prisma.$transaction((tx) => t.outbox.publish(tx, 'test.poison', { n: 3 }));
    const event = await t.prisma.outboxEvent.findFirstOrThrow({ where: { type: 'test.poison' } });
    await t.prisma.outboxEvent.update({ where: { id: event.id }, data: { attempts: 7 } });

    await t.outbox.drain();
    const parked = await t.prisma.outboxEvent.findUniqueOrThrow({ where: { id: event.id } });
    expect(parked.failedAt).not.toBeNull();
    expect(parked.processedAt).toBeNull();

    await t.prisma.outboxEvent.update({ where: { id: event.id }, data: { availableAt: new Date(0) } });
    expect(await t.outbox.drain()).toBe(0); // failed events are not retried
  });
});
