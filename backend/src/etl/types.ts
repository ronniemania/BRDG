/**
 * ETL pipeline contracts.
 *
 * The pipeline is a strict three-stage flow:
 *
 *     extract  → RawEvent[]      (Connector)
 *     transform → Canonical[]    (pure function: payload → row)
 *     load      → write to DB    (idempotent upsert)
 *
 * Each stage is independently testable and independently failable. A
 * failure in transform/load is captured in etl_dead_letters with the
 * raw payload so it can be replayed without re-fetching from the source
 * API. The pipeline always reports a RunReport — never throws past its
 * boundary — so callers can decide whether a partial result is OK.
 */

import type { PrismaClient } from '@prisma/client';

/** Per-pipeline-run dependencies. Injected so connectors stay testable. */
export interface ETLContext {
  prisma: PrismaClient;
  source: string;          // "shopify" | "meta-ads" | "google-ads" | "freshdesk"
  brandId?: string;        // omitted for cross-brand pipelines
  runId: string;           // etl_runs row id, for cross-stage correlation
  /** Soft cap; connectors should stop pulling when reached. */
  maxItems?: number;
}

/** A normalized raw event before transform. Mirrors the raw_events row. */
export interface RawEvent<P = unknown> {
  /** Set when persisted. Connectors leave this undefined. */
  id?: string;
  source: string;
  topic: string;
  brandId?: string;
  externalId?: string;
  payload: P;
}

/** What a connector returns. */
export interface ExtractResult<P = unknown> {
  events: RawEvent<P>[];
  /** Watermark to advance ON SUCCESS. Connector decides what's relevant. */
  nextWatermark?: Record<string, unknown>;
  /** Connector-side errors that didn't yield an event (e.g. one of N pages 500'd). */
  errors?: string[];
}

/** Pure transform: raw payload → zero or more canonical rows. */
export type Transformer<P, C> = (raw: RawEvent<P>, ctx: ETLContext) => C[] | Promise<C[]>;

/** Loader: write a canonical row to the serving table idempotently. */
export type Loader<C> = (row: C, ctx: ETLContext) => Promise<void>;

/** Connector: stateless puller for a single (source, brand, topic). */
export interface Connector<P = unknown, C = unknown> {
  /** Stable identifier — used for watermarks and dead-letter rows. */
  source: string;
  /** Logical topic this connector handles ("orders", "campaigns", ...). */
  topic: string;
  /** Pull from the upstream API. Should be retryable + watermark-aware. */
  extract: (ctx: ETLContext, watermark?: Record<string, unknown>) => Promise<ExtractResult<P>>;
  /** Pure: payload → canonical rows. */
  transform: Transformer<P, C>;
  /** Idempotent write to the serving table. */
  load: Loader<C>;
}

/** What every pipeline run reports to its caller. */
export interface RunReport {
  runId: string;
  source: string;
  topic: string;
  brandId?: string;
  status: 'ok' | 'partial' | 'failed';
  extracted: number;
  transformed: number;
  loaded: number;
  failed: number;
  durationMs: number;
  errors: string[];
}
