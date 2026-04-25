/**
 * Pipeline orchestrator — extract → persist raw → transform → load.
 *
 * Two entry points:
 *
 *   runPipeline(connector, opts)
 *       The full polling flow: ask the connector to extract since the
 *       last watermark, persist each event, transform, load, advance
 *       the watermark on success.
 *
 *   ingestEvent(connector, rawEvent, opts)
 *       Webhook flow: a single event arrives from outside, persist it,
 *       transform, load, return the result. No watermark involved.
 *
 * Both wrap a try/finally so the etl_runs row always closes, and both
 * record per-item failures in etl_dead_letters without aborting the
 * batch — a single bad order should not stop a 250-order sync.
 */

import type { PrismaClient } from '@prisma/client';
import { log } from '../utils/logger';
import type { Connector, ETLContext, RunReport } from './types';
import { openRun, closeRun } from './audit';
import { getWatermark, setWatermark } from './watermarks';
import { recordDeadLetter } from './deadletter';
import { persistRaw, markProcessed } from './rawStore';

const DEFAULT_WATERMARK_KEY = 'cursor';

export interface RunPipelineOpts {
  prisma: PrismaClient;
  brandId?: string;
  /** Stop fetching after this many items (defense in depth). */
  maxItems?: number;
  /** Override the watermark key when a connector has multiple cursors. */
  watermarkKey?: string;
  /** Set true to ignore the stored watermark for this run (full backfill). */
  fullRefresh?: boolean;
}

export async function runPipeline<P, C>(
  connector: Connector<P, C>,
  opts: RunPipelineOpts,
): Promise<RunReport> {
  const { prisma, brandId, maxItems, fullRefresh } = opts;
  const watermarkKey = opts.watermarkKey ?? `${connector.topic}.${DEFAULT_WATERMARK_KEY}`;
  const startedAt = Date.now();
  const errors: string[] = [];
  let extracted = 0, transformed = 0, loaded = 0, failed = 0;

  const runId = await openRun(prisma, {
    source: connector.source,
    brandId,
    metadata: { topic: connector.topic, watermarkKey, fullRefresh: !!fullRefresh },
  });

  const ctx: ETLContext = { prisma, source: connector.source, brandId, runId, maxItems };

  let advanceWatermarkTo: Record<string, unknown> | undefined;
  let aborted = false;

  try {
    const wm = fullRefresh ? undefined : await getWatermark(prisma, connector.source, brandId, watermarkKey);

    // ── EXTRACT ───────────────────────────────────────────────────────────
    let extractResult;
    try {
      extractResult = await connector.extract(ctx, wm);
    } catch (err: any) {
      errors.push(`extract: ${err?.message ?? err}`);
      aborted = true;
      // Record an extract-stage dead letter so the operator can see what
      // window was attempted.
      await recordDeadLetter(prisma, {
        source: connector.source,
        brandId,
        stage: 'extract',
        payload: { watermark: wm, topic: connector.topic },
        error: String(err?.message ?? err),
      });
      throw err;
    }

    extracted = extractResult.events.length;
    advanceWatermarkTo = extractResult.nextWatermark;
    if (extractResult.errors?.length) errors.push(...extractResult.errors);

    // ── PER-EVENT: persist raw → transform → load ────────────────────────
    for (const evt of extractResult.events) {
      const persisted = await persistRaw(prisma, { ...evt, source: connector.source, topic: connector.topic });
      try {
        const rows = await connector.transform(persisted, ctx);
        transformed += rows.length;
        for (const row of rows) {
          try {
            await connector.load(row, ctx);
            loaded += 1;
          } catch (loadErr: any) {
            failed += 1;
            errors.push(`load: ${loadErr?.message ?? loadErr}`);
            await recordDeadLetter(prisma, {
              source: connector.source, brandId,
              rawEventId: persisted.id,
              stage: 'load', payload: row,
              error: String(loadErr?.message ?? loadErr),
            });
          }
        }
        await markProcessed(prisma, persisted.id, failed === 0);
      } catch (txErr: any) {
        failed += 1;
        errors.push(`transform: ${txErr?.message ?? txErr}`);
        await recordDeadLetter(prisma, {
          source: connector.source, brandId,
          rawEventId: persisted.id,
          stage: 'transform', payload: persisted.payload,
          error: String(txErr?.message ?? txErr),
        });
        await markProcessed(prisma, persisted.id, false, String(txErr?.message ?? txErr));
      }
    }
  } catch (err: any) {
    // Already recorded above; just make sure aborted is set.
    aborted = true;
  } finally {
    const fullySucceeded = !aborted && failed === 0;
    const status: RunReport['status'] = aborted ? 'failed' : (failed > 0 ? 'partial' : 'ok');

    // Advance watermark only on a clean run.
    if (fullySucceeded && advanceWatermarkTo) {
      await setWatermark(prisma, connector.source, brandId, watermarkKey, advanceWatermarkTo);
    }

    await closeRun(prisma, runId, startedAt, {
      status, extracted, transformed, loaded, failed,
      error: errors.slice(0, 5).join(' | ') || undefined,
    });

    if (status !== 'ok') {
      log.warn('etl run completed with issues', {
        component: 'etl', source: connector.source, topic: connector.topic,
        brandId, status, extracted, transformed, loaded, failed,
        sampleErrors: errors.slice(0, 3),
      });
    } else {
      log.info('etl run ok', {
        component: 'etl', source: connector.source, topic: connector.topic,
        brandId, extracted, loaded, durationMs: Date.now() - startedAt,
      });
    }
  }

  return {
    runId, source: connector.source, topic: connector.topic, brandId,
    status: aborted ? 'failed' : (failed > 0 ? 'partial' : 'ok'),
    extracted, transformed, loaded, failed,
    durationMs: Date.now() - startedAt,
    errors,
  };
}

/**
 * Single-event ingest path (webhooks, manual replay).
 *
 * Persists the raw payload first, then runs transform + load. No
 * watermark, no extract — the caller already has the payload.
 */
export async function ingestEvent<P, C>(
  connector: Connector<P, C>,
  rawEvent: { topic?: string; brandId?: string; externalId?: string; payload: P },
  opts: { prisma: PrismaClient },
): Promise<RunReport> {
  const startedAt = Date.now();
  const errors: string[] = [];
  let transformed = 0, loaded = 0, failed = 0;

  const runId = await openRun(opts.prisma, {
    source: connector.source,
    brandId: rawEvent.brandId,
    metadata: { topic: rawEvent.topic ?? connector.topic, mode: 'webhook' },
  });

  const ctx: ETLContext = {
    prisma: opts.prisma, source: connector.source, brandId: rawEvent.brandId, runId,
  };

  const persisted = await persistRaw(opts.prisma, {
    source: connector.source,
    topic: rawEvent.topic ?? connector.topic,
    brandId: rawEvent.brandId,
    externalId: rawEvent.externalId,
    payload: rawEvent.payload,
  });

  try {
    const rows = await connector.transform(persisted, ctx);
    transformed = rows.length;
    for (const row of rows) {
      try {
        await connector.load(row, ctx);
        loaded += 1;
      } catch (loadErr: any) {
        failed += 1;
        errors.push(`load: ${loadErr?.message ?? loadErr}`);
        await recordDeadLetter(opts.prisma, {
          source: connector.source, brandId: rawEvent.brandId,
          rawEventId: persisted.id,
          stage: 'load', payload: row,
          error: String(loadErr?.message ?? loadErr),
        });
      }
    }
    await markProcessed(opts.prisma, persisted.id, failed === 0);
  } catch (txErr: any) {
    failed += 1;
    errors.push(`transform: ${txErr?.message ?? txErr}`);
    await recordDeadLetter(opts.prisma, {
      source: connector.source, brandId: rawEvent.brandId,
      rawEventId: persisted.id,
      stage: 'transform', payload: rawEvent.payload,
      error: String(txErr?.message ?? txErr),
    });
    await markProcessed(opts.prisma, persisted.id, false, String(txErr?.message ?? txErr));
  } finally {
    const status: RunReport['status'] = failed > 0 ? 'partial' : 'ok';
    await closeRun(opts.prisma, runId, startedAt, {
      status, extracted: 1, transformed, loaded, failed,
      error: errors.slice(0, 5).join(' | ') || undefined,
    });
  }

  return {
    runId, source: connector.source, topic: rawEvent.topic ?? connector.topic,
    brandId: rawEvent.brandId,
    status: failed > 0 ? 'partial' : 'ok',
    extracted: 1, transformed, loaded, failed,
    durationMs: Date.now() - startedAt,
    errors,
  };
}
