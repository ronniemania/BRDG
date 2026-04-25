/**
 * ETL observability + replay endpoints (admin only).
 *
 * These endpoints expose the new etl_runs / etl_dead_letters tables to
 * the operator so they can spot a stalled connector or replay a bad
 * batch without re-fetching from the source API.
 *
 * Routes (all admin-gated):
 *
 *   GET  /api/etl/runs?source=&brandId=&limit=
 *       Recent pipeline runs, newest first.
 *
 *   GET  /api/etl/deadletter?source=&limit=
 *       Items captured at transform/load time. Each row contains the
 *       original payload so the operator can inspect or replay.
 *
 *   POST /api/etl/deadletter/:id/replay
 *       Re-runs the connector's transform+load on the stored payload.
 *       Marks the dead-letter row as replayed on success.
 *
 *   GET  /api/etl/health
 *       Quick rollup: per-source, last run time + status. Lightweight
 *       enough to call from a status board.
 *
 * The endpoints fail closed: they require admin role and never expose
 * encrypted credentials (the raw payloads are external API responses,
 * which are non-sensitive by construction — but the operator should
 * still treat them with care).
 */

import { Express, Request, Response } from 'express';
import { AuthRequest } from '../config/authMiddleware';
import repository from '../database/repository';
import { ForbiddenError } from '../utils/errors';
import { log } from '../utils/logger';
import { ADMIN_EMAILS } from '../config/constants';
import { ingestEvent } from '../etl/pipeline';
import { makeShopifyOrderWebhookConnector } from '../etl/connectors/shopify';

async function requireAdmin(req: Request) {
  const userId = (req as AuthRequest).userId!;
  const user = await repository.findUserById(userId);
  if (!user) throw new ForbiddenError();
  const isRoleAdmin = user.role === 'admin' || user.role === 'boss';
  const isEmailAdmin = ADMIN_EMAILS.includes((user.email || '').toLowerCase());
  if (!isRoleAdmin && !isEmailAdmin) throw new ForbiddenError();
}

export function setupEtlRoutes(app: Express) {
  // Recent runs ────────────────────────────────────────────────────────────
  app.get('/api/etl/runs', async (req: Request, res: Response) => {
    try {
      await requireAdmin(req);
      const source = (req.query.source as string) || undefined;
      const brandId = (req.query.brandId as string) || undefined;
      const limit = Math.min(200, parseInt((req.query.limit as string) || '50', 10) || 50);
      const rows = await repository.prisma.etlRun.findMany({
        where: { ...(source ? { source } : {}), ...(brandId ? { brandId } : {}) },
        orderBy: { startedAt: 'desc' },
        take: limit,
      });
      res.json({ runs: rows });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // Health rollup — last run per source ────────────────────────────────────
  app.get('/api/etl/health', async (req: Request, res: Response) => {
    try {
      await requireAdmin(req);
      // Group-by isn't directly available with raw selects, so we pull
      // the last 200 runs and reduce in memory. That's plenty for a
      // dashboard at our scale.
      const recent = await repository.prisma.etlRun.findMany({
        orderBy: { startedAt: 'desc' },
        take: 200,
      });
      const bySource = new Map<string, typeof recent[number]>();
      for (const r of recent) {
        if (!bySource.has(r.source)) bySource.set(r.source, r);
      }
      res.json({
        sources: Array.from(bySource.values()).map(r => ({
          source: r.source,
          lastRunAt: r.startedAt,
          status: r.status,
          extracted: r.extracted,
          loaded: r.loaded,
          failed: r.failed,
          durationMs: r.durationMs,
          error: r.error,
        })),
      });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // Dead-letter list ───────────────────────────────────────────────────────
  app.get('/api/etl/deadletter', async (req: Request, res: Response) => {
    try {
      await requireAdmin(req);
      const source = (req.query.source as string) || undefined;
      const limit = Math.min(200, parseInt((req.query.limit as string) || '50', 10) || 50);
      const rows = await repository.prisma.etlDeadLetter.findMany({
        where: { ...(source ? { source } : {}), replayedAt: null },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
      res.json({ items: rows });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // Replay a single dead-letter row ────────────────────────────────────────
  app.post('/api/etl/deadletter/:id/replay', async (req: Request, res: Response) => {
    try {
      await requireAdmin(req);
      const row = await repository.prisma.etlDeadLetter.findUnique({
        where: { id: req.params.id },
      });
      if (!row) return res.status(404).json({ message: 'Not found' });
      if (row.replayedAt) return res.status(409).json({ message: 'Already replayed' });

      // We currently support replay for shopify orders. Other sources can
      // be added by widening the switch — they just need a connector
      // factory that exposes transform + load without re-fetching from
      // the upstream API.
      let report;
      switch (row.source) {
        case 'shopify': {
          if (!row.brandId) {
            return res.status(400).json({ message: 'No brandId on dead-letter row — cannot replay' });
          }
          const connector = makeShopifyOrderWebhookConnector(row.brandId);
          report = await ingestEvent(connector, {
            topic: 'orders/replay',
            brandId: row.brandId,
            payload: row.payload as any,
          }, { prisma: repository.prisma });
          break;
        }
        default:
          return res.status(400).json({ message: `Replay not supported for source=${row.source}` });
      }

      await repository.prisma.etlDeadLetter.update({
        where: { id: row.id },
        data: { replayedAt: new Date(), attempts: { increment: 1 } },
      });
      log.info('etl deadletter replayed', {
        component: 'etl', source: row.source, id: row.id, status: report.status,
      });
      res.json({ replayed: true, report });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });
}
