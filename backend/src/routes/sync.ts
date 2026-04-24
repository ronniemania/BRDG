import { Express, Request, Response } from 'express';
import { AuthRequest } from '../config/authMiddleware';
import repository from '../database/repository';
import { runSyncForBrands } from '../scheduler';

export function setupSyncRoutes(app: Express) {
  /**
   * POST /api/sync/all
   * Invalidates local data source cache for all of the calling user's brands,
   * then kicks off a full sync cycle (Drive + Shopify + alerts) in the background.
   * Returns immediately — sync runs async.
   */
  app.post('/api/sync/all', async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId!;

      const brands = await repository.findAccessibleBrands(userId);
      if (!brands.length) {
        return res.json({ triggered: false, message: 'No brands found' });
      }

      const brandIds = brands.map(b => b.id);

      // Cache invalidation: reset lastSync on every data source so the next sync
      // re-fetches everything from the external source, ignoring previous timestamps.
      await repository.prisma.dataSource.updateMany({
        where: { brandId: { in: brandIds } },
        data: { lastSync: null, syncStatus: 'pending' },
      });

      // Fire-and-forget — respond immediately so the UI isn't blocked.
      runSyncForBrands(brandIds).catch(err =>
        console.error('[Sync] Background global sync error:', err.message),
      );

      res.json({ triggered: true, brands: brandIds.length });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  /**
   * GET /api/sync/status
   * Returns the sync status of all data sources for the calling user's brands.
   */
  app.get('/api/sync/status', async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId!;
      const brands = await repository.findAccessibleBrands(userId);
      if (!brands.length) return res.json({ sources: [] });

      const brandIds = brands.map(b => b.id);
      const sources = await repository.prisma.dataSource.findMany({
        where: { brandId: { in: brandIds } },
        select: { id: true, brandId: true, name: true, type: true, syncStatus: true, lastSync: true, lastError: true },
        orderBy: { lastSync: 'desc' },
      });

      res.json({ sources });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });
}
