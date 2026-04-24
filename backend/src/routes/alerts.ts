import { Express, Request, Response } from 'express';
import { AuthRequest } from '../config/authMiddleware';
import repository from '../database/repository';

export function setupAlertsRoutes(app: Express) {
  // GET /api/alerts?brandId=&unreadOnly=true
  app.get('/api/alerts', async (req: AuthRequest, res: Response) => {
    try {
      const { brandId, unreadOnly } = req.query as Record<string, string>;
      if (!brandId) return res.status(400).json({ message: 'brandId is required' });

      // Verify brand belongs to requesting user
      const brand = await repository.findBrandById(brandId);
      if (!brand || !await repository.canAccessBrand(brand.id, req.userId!)) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const alerts = await repository.findAlertsByBrand(brandId, {
        unreadOnly: unreadOnly === 'true',
      });

      const unreadCount = await repository.countUnreadAlerts(brandId);

      res.json({ alerts, unreadCount });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // GET /api/alerts/unread-count?brandId=
  app.get('/api/alerts/unread-count', async (req: AuthRequest, res: Response) => {
    try {
      const { brandId } = req.query as Record<string, string>;
      if (!brandId) return res.status(400).json({ message: 'brandId is required' });

      const brand = await repository.findBrandById(brandId);
      if (!brand || !await repository.canAccessBrand(brand.id, req.userId!)) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const count = await repository.countUnreadAlerts(brandId);
      res.json({ count });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // PATCH /api/alerts/:id/read
  app.patch('/api/alerts/:id/read', async (req: AuthRequest, res: Response) => {
    try {
      const alert = await repository.prisma.alert.findUnique({ where: { id: req.params.id } });
      if (!alert) return res.status(404).json({ message: 'Alert not found' });

      const brand = await repository.findBrandById(alert.brandId);
      if (!brand || !await repository.canAccessBrand(brand.id, req.userId!)) {
        return res.status(403).json({ message: 'Access denied' });
      }

      await repository.markAlertRead(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // POST /api/alerts/mark-all-read?brandId=
  app.post('/api/alerts/mark-all-read', async (req: AuthRequest, res: Response) => {
    try {
      const { brandId } = req.body as { brandId: string };
      if (!brandId) return res.status(400).json({ message: 'brandId is required' });

      const brand = await repository.findBrandById(brandId);
      if (!brand || !await repository.canAccessBrand(brand.id, req.userId!)) {
        return res.status(403).json({ message: 'Access denied' });
      }

      await repository.markAllAlertsRead(brandId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
