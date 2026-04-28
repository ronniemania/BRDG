import { Express, Request, Response } from 'express';
import { AuthRequest } from '../config/authMiddleware';
import repository from '../database/repository';

export function setupDashboardRoutes(app: Express) {
  /**
   * GET /api/dashboard/holistic
   * Aggregates key metrics across all brands accessible to the calling user.
   * Returns both an aggregate summary and a per-brand breakdown.
   *
   * Date filtering
   * ─────────────
   * Accepts the same date params as every other route: ?range=7d or
   * ?start_date=&end_date=. These are applied to time-series metrics
   * (orders, revenue, returns) so the holistic view stays in sync with
   * the date-range picker. Point-in-time metrics (low stock, pending
   * orders, customer count) are always current-state — not date-filtered.
   */
  app.get('/api/dashboard/holistic', async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId!;
      const brands = await repository.findAccessibleBrands(userId);

      if (!brands.length) {
        return res.json({ aggregate: null, byBrand: [] });
      }

      // Build date filters for time-series queries.
      // Inventory / pending orders / customer counts are current-state — not filtered.
      const dateFilters = req.query as Record<string, string>;

      const byBrand = await Promise.all(
        brands.map(async (brand) => {
          const [orders, customers, inventory, returns, breachCount] = await Promise.all([
            repository.findOrdersByBrand(brand.id, dateFilters),
            repository.findCustomersByBrand(brand.id),
            repository.findInventoryByBrand(brand.id),
            repository.findReturnsByBrand(brand.id, dateFilters),
            repository.prisma.breachLog.count({ where: { brandId: brand.id } }),
          ]);

          const revenue = orders.reduce((s, o) => s + o.amount, 0);
          const pendingOrders = orders.filter(o => o.status === 'pending').length;
          const lowStock = inventory.filter(i => i.stockLevel <= i.reorderPoint).length;
          const pendingReturns = returns.filter(r => r.status === 'requested' || r.status === 'pending').length;

          return {
            brandId: brand.id,
            brandName: brand.name,
            revenue,
            orders: orders.length,
            pendingOrders,
            customers: customers.length,
            returns: returns.length,
            pendingReturns,
            lowStock,
            slaBreaches: breachCount,
            inventoryValue: inventory.reduce((s, i) => s + i.salePrice * i.stockLevel, 0),
          };
        }),
      );

      const aggregate = {
        totalRevenue: byBrand.reduce((s, b) => s + b.revenue, 0),
        totalOrders: byBrand.reduce((s, b) => s + b.orders, 0),
        totalPendingOrders: byBrand.reduce((s, b) => s + b.pendingOrders, 0),
        totalCustomers: byBrand.reduce((s, b) => s + b.customers, 0),
        totalReturns: byBrand.reduce((s, b) => s + b.returns, 0),
        totalPendingReturns: byBrand.reduce((s, b) => s + b.pendingReturns, 0),
        totalLowStock: byBrand.reduce((s, b) => s + b.lowStock, 0),
        totalSLABreaches: byBrand.reduce((s, b) => s + b.slaBreaches, 0),
        totalInventoryValue: byBrand.reduce((s, b) => s + b.inventoryValue, 0),
        brandsCount: brands.length,
        lastUpdated: new Date().toISOString(),
      };

      res.json({ aggregate, byBrand });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });
}
