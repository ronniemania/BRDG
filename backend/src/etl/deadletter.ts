/**
 * Dead-letter store — captures payloads that failed at transform/load
 * so they can be inspected and replayed without re-fetching from source.
 *
 * Writes here are best-effort — a dead-letter write failing must NOT
 * cascade into pipeline failure. The original raw_event still exists
 * and the run is marked partial/failed in etl_runs, so the operator
 * has multiple ways to spot the problem.
 */

import type { PrismaClient } from '@prisma/client';
import { log } from '../utils/logger';

export interface DeadLetterEntry {
  source: string;
  brandId?: string;
  rawEventId?: string;
  stage: 'extract' | 'transform' | 'load';
  payload: unknown;
  error: string;
}

export async function recordDeadLetter(
  prisma: PrismaClient,
  entry: DeadLetterEntry,
): Promise<void> {
  try {
    await prisma.etlDeadLetter.create({
      data: {
        source: entry.source,
        brandId: entry.brandId,
        rawEventId: entry.rawEventId,
        stage: entry.stage,
        payload: (entry.payload ?? null) as any,
        error: String(entry.error).slice(0, 4000),
      },
    });
  } catch (err: any) {
    log.warn('etl deadletter write failed', {
      component: 'etl', source: entry.source, stage: entry.stage, err: err?.message,
    });
  }
}
