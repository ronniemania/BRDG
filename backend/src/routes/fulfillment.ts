import { Express, Request, Response } from 'express';
import repository from '../database/repository';
import { AuthRequest } from '../config/authMiddleware';

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

function parsePositiveInt(value: unknown): number | undefined {
  if (value == null) return undefined;
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  const int = Math.floor(n);
  return int > 0 ? int : undefined;
}

export function setupFulfillmentRoutes(app: Express) {
  app.get('/api/fulfillment', async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { brandId, status, range, start_date, end_date } = req.query as Record<string, string>;
      if (!brandId) return res.status(400).json({ message: 'brandId required' });
      if (!await repository.canAccessBrand(brandId, userId)) return res.status(403).json({ message: 'Access denied' });

      const orders = await repository.findFulfillmentByBrand(brandId, { status, range, start_date, end_date });
      return res.json({ orders });
    } catch (err: unknown) {
      return res.status(500).json({ message: getErrorMessage(err) });
    }
  });

  app.get('/api/fulfillment/sla', async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { brandId } = req.query as Record<string, string>;
      if (!brandId) return res.status(400).json({ message: 'brandId required' });
      if (!await repository.canAccessBrand(brandId, userId)) return res.status(403).json({ message: 'Access denied' });

      const sla = await repository.getFulfillmentSLA(brandId);
      return res.json({ sla });
    } catch (err: unknown) {
      return res.status(500).json({ message: getErrorMessage(err) });
    }
  });

  app.post('/api/fulfillment/sla', async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { brandId, step1Mins, step2Mins, step3Mins, step4Mins, step5Mins } = req.body as Record<string, unknown>;
      if (!brandId || typeof brandId !== 'string') return res.status(400).json({ message: 'brandId required' });
      if (!await repository.canAccessBrand(brandId, userId)) return res.status(403).json({ message: 'Access denied' });

      const update = {
        ...(parsePositiveInt(step1Mins) != null && { step1Mins: parsePositiveInt(step1Mins) }),
        ...(parsePositiveInt(step2Mins) != null && { step2Mins: parsePositiveInt(step2Mins) }),
        ...(parsePositiveInt(step3Mins) != null && { step3Mins: parsePositiveInt(step3Mins) }),
        ...(parsePositiveInt(step4Mins) != null && { step4Mins: parsePositiveInt(step4Mins) }),
        ...(parsePositiveInt(step5Mins) != null && { step5Mins: parsePositiveInt(step5Mins) }),
      };

      const sla = await repository.upsertFulfillmentSLA(brandId, update);
      return res.json({ sla });
    } catch (err: unknown) {
      return res.status(500).json({ message: getErrorMessage(err) });
    }
  });

  app.get('/api/fulfillment/breach-stats', async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { brandId, days = '30' } = req.query as Record<string, string>;
      if (!brandId) return res.status(400).json({ message: 'brandId required' });
      if (!await repository.canAccessBrand(brandId, userId)) return res.status(403).json({ message: 'Access denied' });

      const parsedDays = Number.parseInt(days, 10);
      const safeDays = Number.isFinite(parsedDays) && parsedDays > 0 ? parsedDays : 30;
      const since = new Date(Date.now() - safeDays * 86400000);

      const logs = await repository.prisma.breachLog.findMany({
        where: { brandId, breachedAt: { gte: since } },
        orderBy: { breachedAt: 'asc' },
      });

      const stepMap: Record<string, { step: string; count: number; totalOverMins: number }> = {};
      for (const log of logs) {
        if (!stepMap[log.stepName]) stepMap[log.stepName] = { step: log.stepName, count: 0, totalOverMins: 0 };
        stepMap[log.stepName].count++;
        stepMap[log.stepName].totalOverMins += Math.max(0, log.elapsedMins - log.slaMins);
      }
      const topFailures = Object.values(stepMap)
        .map(s => ({ step: s.step, count: s.count, avgOverMins: Math.round(s.totalOverMins / s.count) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      const trendDays = Math.min(safeDays, 30);
      const trendMap: Record<string, number> = {};
      for (let i = trendDays - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        d.setHours(0, 0, 0, 0);
        trendMap[d.toISOString().slice(0, 10)] = 0;
      }
      for (const log of logs) {
        const key = log.breachedAt.toISOString().slice(0, 10);
        if (key in trendMap) trendMap[key]++;
      }
      const trend = Object.entries(trendMap).map(([date, count]) => ({ date, count }));

      return res.json({ topFailures, trend, total: logs.length });
    } catch (err: unknown) {
      return res.status(500).json({ message: getErrorMessage(err) });
    }
  });

  app.delete('/api/fulfillment/:id', async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId;
      if (!userId) return res.status(401).json({ message: 'Unauthorized' });

      const { brandId } = req.query as Record<string, string>;
      if (!brandId) return res.status(400).json({ message: 'brandId required' });
      if (!await repository.canAccessBrand(brandId, userId)) return res.status(403).json({ message: 'Access denied' });

      const record = await repository.prisma.fulfillmentOrder.findUnique({
        where: { id: req.params.id },
        select: { id: true, brandId: true },
      });
      if (!record || record.brandId !== brandId) {
        return res.status(404).json({ message: 'Fulfillment order not found' });
      }

      await repository.deleteFulfillmentOrder(req.params.id);
      return res.json({ ok: true });
    } catch (err: unknown) {
      return res.status(500).json({ message: getErrorMessage(err) });
    }
  });
}
