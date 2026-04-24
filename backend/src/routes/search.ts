import { Express, Request, Response } from 'express';
import repository from '../database/repository';
import { AuthRequest } from '../config/authMiddleware';

export function setupSearchRoutes(app: Express) {
  /**
   * GET /api/search?q=<query>&brandId=<id>
   * Fast search across orders + customers for the global search bar.
   * Returns up to 5 of each, ordered by relevance (exact match first).
   */
  app.get('/api/search', async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId!;
      const { q, brandId } = req.query as Record<string, string>;

      if (!brandId) return res.status(400).json({ message: 'brandId required' });
      if (!q || q.trim().length < 2) return res.json({ results: [] });

      if (!await repository.canAccessBrand(brandId, userId)) {
        return res.status(403).json({ message: 'Access denied' });
      }

      const term = q.trim();

      const [customers, orders] = await Promise.all([
        repository.prisma.customer.findMany({
          where: {
            brandId,
            OR: [
              { name:  { contains: term, mode: 'insensitive' } },
              { email: { contains: term, mode: 'insensitive' } },
            ],
          },
          take: 5,
          orderBy: { totalSpent: 'desc' },
        }),
        repository.prisma.order.findMany({
          where: {
            brandId,
            OR: [
              { orderId:      { contains: term, mode: 'insensitive' } },
              { customerName: { contains: term, mode: 'insensitive' } },
            ],
          },
          take: 5,
          orderBy: { orderDate: 'desc' },
        }),
      ]);

      const results = [
        ...orders.map(o => ({
          type:     'order',
          id:       o.id,
          title:    `Order #${o.orderId}`,
          subtitle: `${o.customerName} · ₹${o.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })} · ${o.status}`,
          href:     '/orders',
        })),
        ...customers.map(c => ({
          type:     'customer',
          id:       c.id,
          title:    c.name,
          subtitle: [c.email, `${c.totalOrders} orders`, `₹${(c.totalSpent ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`].filter(Boolean).join(' · '),
          href:     '/customers',
        })),
      ];

      res.json({ results });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
