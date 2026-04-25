/**
 * ETL run audit — opens a row in `etl_runs` at start, closes it at end.
 *
 * Audit failures must NEVER break the pipeline itself. Every write here is
 * try/caught and degrades to a logged warning. That way, if the migration
 * for the audit tables hasn't been applied yet, the pipeline still does
 * its real job.
 */

import type { PrismaClient } from '@prisma/client';
import { log } from '../utils/logger';

export interface OpenRunOpts {
  source: string;
  brandId?: string;
  metadata?: Record<string, unknown>;
}

export interface CloseRunStats {
  status: 'ok' | 'partial' | 'failed';
  extracted: number;
  transformed: number;
  loaded: number;
  failed: number;
  error?: string;
  metadataPatch?: Record<string, unknown>;
}

/**
 * Opens a new etl_runs row and returns its id.
 * Always returns a usable id — falls back to a generated string when the
 * audit table is unreachable.
 */
export async function openRun(prisma: PrismaClient, opts: OpenRunOpts): Promise<string> {
  const fallbackId = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const row = await prisma.etlRun.create({
      data: {
        source: opts.source,
        brandId: opts.brandId,
        status: 'running',
        metadata: opts.metadata as any ?? undefined,
      },
      select: { id: true },
    });
    return row.id;
  } catch (err: any) {
    log.warn('etl audit openRun failed; using in-memory id', {
      component: 'etl', source: opts.source, brandId: opts.brandId, err: err?.message,
    });
    return fallbackId;
  }
}

/** Closes the run row with final stats. Never throws. */
export async function closeRun(
  prisma: PrismaClient,
  runId: string,
  startedAt: number,
  stats: CloseRunStats,
): Promise<void> {
  if (runId.startsWith('mem-')) return; // openRun fell back; nothing to close
  const durationMs = Date.now() - startedAt;
  try {
    await prisma.etlRun.update({
      where: { id: runId },
      data: {
        finishedAt: new Date(),
        status: stats.status,
        extracted: stats.extracted,
        transformed: stats.transformed,
        loaded: stats.loaded,
        failed: stats.failed,
        durationMs,
        error: stats.error?.slice(0, 4000),
        metadata: stats.metadataPatch as any ?? undefined,
      },
    });
  } catch (err: any) {
    log.warn('etl audit closeRun failed', {
      component: 'etl', runId, err: err?.message,
    });
  }
}
