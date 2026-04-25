/**
 * Watermark store — per-source, per-brand cursors that let a connector
 * fetch only deltas since its last successful run.
 *
 * A watermark is opaque JSON owned by the connector that wrote it. The
 * pipeline only persists what the connector returns; it never inspects
 * the contents. That keeps the abstraction clean across very different
 * source APIs (Shopify cursors, Meta date ranges, Freshdesk page tokens).
 *
 * IMPORTANT: a watermark is advanced ONLY when the run finishes with
 * status === 'ok'. A 'partial' run replays the same window next time.
 * That's intentional — it costs a bit of duplicate fetching but every
 * loader is idempotent so the cost is just bandwidth, not correctness.
 */

import type { PrismaClient } from '@prisma/client';
import { log } from '../utils/logger';

export async function getWatermark(
  prisma: PrismaClient,
  source: string,
  brandId: string | undefined,
  key: string,
): Promise<Record<string, unknown> | undefined> {
  try {
    const row = await prisma.etlWatermark.findUnique({
      where: {
        source_brandId_key: { source, brandId: brandId ?? '', key },
      },
    });
    return (row?.value as Record<string, unknown>) ?? undefined;
  } catch (err: any) {
    log.warn('etl watermark read failed; treating as empty', {
      component: 'etl', source, brandId, key, err: err?.message,
    });
    return undefined;
  }
}

export async function setWatermark(
  prisma: PrismaClient,
  source: string,
  brandId: string | undefined,
  key: string,
  value: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.etlWatermark.upsert({
      where: { source_brandId_key: { source, brandId: brandId ?? '', key } },
      update: { value: value as any },
      create: { source, brandId: brandId ?? '', key, value: value as any },
    });
  } catch (err: any) {
    log.warn('etl watermark write failed', {
      component: 'etl', source, brandId, key, err: err?.message,
    });
  }
}
