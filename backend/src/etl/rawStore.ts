/**
 * Raw event store — every payload from every connector goes here first.
 *
 * Why? Because transforms have bugs, schemas change, and operators need
 * a way to replay without re-fetching from a billed external API. By
 * persisting raw payloads we get:
 *
 *   • idempotent re-processing (re-run transform/load against the row)
 *   • a forensic record when a number on the dashboard looks wrong
 *   • debounced ingestion (a webhook delivered twice → upsert by externalId)
 *
 * If the raw_events table is unavailable (e.g. migration not run), writes
 * degrade to noisy warnings and the pipeline continues with in-memory ids
 * — correctness of the serving tables is unaffected.
 */

import type { PrismaClient } from '@prisma/client';
import { log } from '../utils/logger';
import type { RawEvent } from './types';

export interface PersistedRawEvent<P = unknown> extends RawEvent<P> {
  id: string;
}

export async function persistRaw<P>(
  prisma: PrismaClient,
  event: RawEvent<P>,
): Promise<PersistedRawEvent<P>> {
  try {
    // If we already have a row for (source, externalId), prefer to update its
    // payload + reset status to pending — that's what makes webhooks safely
    // replayable.
    if (event.externalId) {
      const existing = await prisma.rawEvent.findFirst({
        where: { source: event.source, externalId: event.externalId },
        select: { id: true },
      });
      if (existing) {
        const updated = await prisma.rawEvent.update({
          where: { id: existing.id },
          data: {
            topic: event.topic,
            brandId: event.brandId,
            payload: (event.payload ?? null) as any,
            status: 'pending',
            attempts: { increment: 0 },
            lastError: null,
            receivedAt: new Date(),
          },
          select: { id: true },
        });
        return { ...event, id: updated.id };
      }
    }
    const row = await prisma.rawEvent.create({
      data: {
        source: event.source,
        topic: event.topic,
        brandId: event.brandId,
        externalId: event.externalId,
        payload: (event.payload ?? null) as any,
        status: 'pending',
      },
      select: { id: true },
    });
    return { ...event, id: row.id };
  } catch (err: any) {
    log.warn('etl raw_event persist failed; using in-memory id', {
      component: 'etl', source: event.source, topic: event.topic, err: err?.message,
    });
    return {
      ...event,
      id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    };
  }
}

export async function markProcessed(
  prisma: PrismaClient,
  rawEventId: string,
  ok: boolean,
  error?: string,
): Promise<void> {
  if (rawEventId.startsWith('mem-')) return;
  try {
    await prisma.rawEvent.update({
      where: { id: rawEventId },
      data: {
        status: ok ? 'processed' : 'failed',
        processedAt: new Date(),
        attempts: { increment: 1 },
        lastError: ok ? null : (error ?? '').slice(0, 4000),
      },
    });
  } catch (err: any) {
    log.warn('etl raw_event status update failed', {
      component: 'etl', rawEventId, err: err?.message,
    });
  }
}
