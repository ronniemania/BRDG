import { Express, Request, Response } from 'express';
import repository from '../database/repository';
import { ValidationError, NotFoundError, ForbiddenError } from '../utils/errors';

async function getBrandId(req: Request): Promise<string> {
  const brandId = req.query.brandId as string;
  if (!brandId) throw new ValidationError('brandId is required');
  const brand = await repository.findBrandById(brandId);
  if (!brand) throw new NotFoundError('Brand not found');
  const userId = (req as any).userId;
  if (!await repository.canAccessBrand(brand.id, userId)) throw new ForbiddenError();
  return brand.id;
}

function getRangeFilter(req: Request): { start_date?: string; end_date?: string } {
  const range = req.query.range as string;
  const start_date = req.query.start_date as string;
  const end_date = req.query.end_date as string;

  // If explicit dates provided, use them
  if (start_date || end_date) {
    return { start_date, end_date };
  }

  // If range preset provided, convert to date range
  if (range) {
    const end = new Date();
    const start = new Date();
    const match = range.match(/^(\d+)([dhm])$/);
    if (match) {
      const [, num, unit] = match;
      const n = parseInt(num);
      if (unit === 'd') start.setDate(start.getDate() - n);
      else if (unit === 'h') start.setHours(start.getHours() - n);
      else if (unit === 'm') start.setMonth(start.getMonth() - n);
      return {
        start_date: start.toISOString(),
        end_date: end.toISOString(),
      };
    }
  }

  return {};
}

export function setupInsightsRoutes(app: Express) {
  // KPI summary
  app.get('/api/insights/kpis', async (req: Request, res: Response) => {
    try {
      const brandId = await getBrandId(req);
      const filters = getRangeFilter(req);

      const [orders, customers, inventory, returns, fulfillmentOrders] = await Promise.all([
        repository.findOrdersByBrand(brandId, filters),
        repository.findCustomersByBrand(brandId, {}),  // all customers for lifetime metrics; newCustomers computed below by createdAt
        repository.findInventoryByBrand(brandId, { trackedOnDashboard: true }),
        repository.findReturnsByBrand(brandId, filters),
        repository.findFulfillmentByBrand(brandId, filters).catch(() => [] as any[]),
      ]);

      // ── Sales ───────────────────────────────────────────────────────────────
      const totalRevenue    = orders.reduce((s, o) => s + o.amount, 0);
      const returnValue     = returns.reduce((s, r) => s + (r.amount ?? 0), 0);
      const netRevenue      = Math.max(0, totalRevenue - returnValue);
      const avgOrderValue   = orders.length ? totalRevenue / orders.length : 0;
      const delivered       = orders.filter(o => o.status === 'delivered');
      const pending         = orders.filter(o => o.status === 'pending');
      const cancelled       = orders.filter(o => o.status === 'cancelled');
      const cancellationRate  = orders.length ? (cancelled.length / orders.length) * 100 : 0;
      const deliveredRevenue  = delivered.reduce((s, o) => s + o.amount, 0);
      const highValueOrders   = orders.filter(o => o.amount >= 5000).length;

      // ── Operations ──────────────────────────────────────────────────────────
      const fulfilmentRate   = orders.length ? (delivered.length / orders.length) * 100 : 0;
      const dispatched       = orders.filter(o => o.hoursToDispatch != null);
      const avgDispatch      = dispatched.length
        ? dispatched.reduce((s, o) => s + o.hoursToDispatch!, 0) / dispatched.length
        : 0;
      const onTime             = dispatched.filter(o => (o.hoursToDispatch ?? 0) <= 24);
      const onTimeDispatchRate = dispatched.length ? (onTime.length / dispatched.length) * 100 : 0;
      const slaBreachCount     = dispatched.filter(o => (o.hoursToDispatch ?? 0) > 24).length;

      // ── Customers ───────────────────────────────────────────────────────────
      const repeatCustomers       = customers.filter(c => c.totalOrders > 1).length;
      const highValueCustomers    = customers.filter(c => c.totalOrders >= 5).length;
      const repeatRate            = customers.length ? (repeatCustomers / customers.length) * 100 : 0;
      const avgOrdersPerCustomer  = customers.length ? orders.length / customers.length : 0;
      const avgRevenuePerCustomer = customers.length ? totalRevenue / customers.length : 0;
      const avgLifetimeValue      = customers.length
        ? customers.reduce((s, c) => s + (c.totalSpent ?? 0), 0) / customers.length
        : 0;
      // New customers created within the selected date range (filter in-memory)
      const rangeStart = filters.start_date ? new Date(filters.start_date) : null;
      const rangeEnd   = filters.end_date   ? new Date(filters.end_date)   : null;
      const newCustomers = customers.filter(c => {
        if (!rangeStart) return false;
        const created = new Date((c as any).createdAt);
        return created >= rangeStart && (!rangeEnd || created <= rangeEnd);
      }).length;

      // ── Inventory ───────────────────────────────────────────────────────────
      const lowStockItems       = inventory.filter(i => i.stockLevel > 0 && i.stockLevel <= i.reorderPoint);
      const outOfStockItems     = inventory.filter(i => i.stockLevel === 0);
      const inStockItems        = inventory.filter(i => i.stockLevel > i.reorderPoint);
      const sellableSkus        = inventory.filter(i => (i as any).binType !== 'damaged' && (i as any).binType !== 'expired').length;
      const damagedSkus         = inventory.filter(i => (i as any).binType === 'damaged').length;
      const expiredSkus         = inventory.filter(i => (i as any).binType === 'expired').length;
      const totalInventoryValue = inventory.reduce((s, i) => s + (i.costPrice ?? 0) * (i.stockLevel ?? 0), 0);
      const inventoryRetailValue = inventory.reduce((s, i) => s + (i.salePrice ?? 0) * (i.stockLevel ?? 0), 0);
      const stockoutRate        = inventory.length ? (outOfStockItems.length / inventory.length) * 100 : 0;

      // ── Returns ─────────────────────────────────────────────────────────────
      const returnRate        = orders.length ? (returns.length / orders.length) * 100 : 0;
      const pendingReturns    = returns.filter(r => r.status === 'pending' || r.status === 'requested').length;
      const resolvedReturns   = returns.filter(r => ['resolved', 'completed', 'closed'].includes(r.status)).length;
      const returnResolutionRate = returns.length ? (resolvedReturns / returns.length) * 100 : 0;
      const avgReturnValue    = returns.length ? returnValue / returns.length : 0;

      // ── Fulfillment pipeline ─────────────────────────────────────────────────
      const fulfillmentTotal      = fulfillmentOrders.length;
      const fulfillmentCompleted  = fulfillmentOrders.filter((f: any) => f.status === 'completed').length;
      const fulfillmentInProgress = fulfillmentOrders.filter((f: any) => f.status === 'in_progress').length;
      const fulfillmentPending    = fulfillmentOrders.filter((f: any) => f.status === 'pending').length;
      const fulfillmentBreachCount = fulfillmentOrders.filter((f: any) => f.status === 'breach').length;
      const fulfillmentCompletionRate = fulfillmentTotal
        ? (fulfillmentCompleted / fulfillmentTotal) * 100
        : 0;
      const fulfillmentSlaBreachRate = fulfillmentTotal
        ? (fulfillmentBreachCount / fulfillmentTotal) * 100
        : 0;
      // Average end-to-end pipeline time (trigger → courier) in minutes
      const completedWithTimes = fulfillmentOrders.filter(
        (f: any) => f.orderTriggerAt && f.connectedToCourierAt
      );
      const avgFulfillmentMins = completedWithTimes.length
        ? completedWithTimes.reduce((s: number, f: any) => {
            const start = new Date(f.orderTriggerAt).getTime();
            const end   = new Date(f.connectedToCourierAt).getTime();
            return s + (end - start) / 60000;
          }, 0) / completedWithTimes.length
        : 0;

      res.json({
        kpis: {
          // Sales
          totalRevenue:           Math.round(totalRevenue),
          netRevenue:             Math.round(netRevenue),
          deliveredRevenue:       Math.round(deliveredRevenue),
          totalOrders:            orders.length,
          avgOrderValue:          Math.round(avgOrderValue),
          highValueOrders,
          deliveredOrders:        delivered.length,
          pendingOrders:          pending.length,
          cancelledOrders:        cancelled.length,
          cancellationRate:       Math.round(cancellationRate * 10) / 10,
          // Operations
          fulfilmentRate:         Math.round(fulfilmentRate * 10) / 10,
          avgDispatchHours:       Math.round(avgDispatch * 10) / 10,
          onTimeDispatchRate:     Math.round(onTimeDispatchRate * 10) / 10,
          slaBreachCount,
          ordersDispatched:       dispatched.length,
          // Customers
          totalCustomers:         customers.length,
          newCustomers,
          repeatCustomers,
          highValueCustomers,
          repeatRate:             Math.round(repeatRate * 10) / 10,
          avgOrdersPerCustomer:   Math.round(avgOrdersPerCustomer * 10) / 10,
          avgRevenuePerCustomer:  Math.round(avgRevenuePerCustomer),
          avgLifetimeValue:       Math.round(avgLifetimeValue),
          // Inventory
          totalSkus:              inventory.length,
          inStockSkus:            inStockItems.length,
          totalInventoryValue:    Math.round(totalInventoryValue),
          inventoryRetailValue:   Math.round(inventoryRetailValue),
          lowStockCount:          lowStockItems.length,
          outOfStockCount:        outOfStockItems.length,
          stockoutRate:           Math.round(stockoutRate * 10) / 10,
          sellableSkus,
          damagedSkus,
          expiredSkus,
          // Returns
          totalReturns:           returns.length,
          returnRate:             Math.round(returnRate * 10) / 10,
          returnValue:            Math.round(returnValue),
          avgReturnValue:         Math.round(avgReturnValue),
          pendingReturns,
          resolvedReturns,
          returnResolutionRate:   Math.round(returnResolutionRate * 10) / 10,
          // Fulfillment
          fulfillmentTotal,
          fulfillmentCompleted,
          fulfillmentInProgress,
          fulfillmentPending,
          fulfillmentCompletionRate:  Math.round(fulfillmentCompletionRate * 10) / 10,
          fulfillmentBreachCount,
          fulfillmentSlaBreachRate:   Math.round(fulfillmentSlaBreachRate * 10) / 10,
          avgFulfillmentMins:         Math.round(avgFulfillmentMins),
        },
      });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // Trend data
  app.get('/api/insights/trends', async (req: Request, res: Response) => {
    try {
      const brandId = await getBrandId(req);
      const rangeFilter = getRangeFilter(req);
      const queryDays = parseInt(req.query.days as string) || 30;
      const filters = rangeFilter.start_date ? rangeFilter : {
        start_date: new Date(Date.now() - queryDays * 86400000).toISOString(),
        end_date: new Date().toISOString(),
      };

      const orders = await repository.findOrdersByBrand(brandId, filters);

      // Calculate actual days to display
      const startDate = new Date(filters.start_date!);
      const endDate = new Date(filters.end_date!);
      const days = Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000) + 1;

      // Group revenue by day
      const revenueByDay: Record<string, number> = {};
      const countByDay: Record<string, number> = {};
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(endDate);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().split('T')[0];
        revenueByDay[key] = 0;
        countByDay[key] = 0;
      }
      orders.forEach(o => {
        const key = new Date(o.orderDate).toISOString().split('T')[0];
        if (key in revenueByDay) {
          revenueByDay[key] += o.amount;
          countByDay[key] += 1;
        }
      });

      const revenueTrend = Object.entries(revenueByDay).map(([date, revenue]) => ({
        date,
        revenue: Math.round(revenue),
        orders: countByDay[date] || 0,
      }));

      res.json({ revenueTrend, days });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // Anomalies / alerts
  app.get('/api/insights/anomalies', async (req: Request, res: Response) => {
    try {
      const brandId = await getBrandId(req);
      const [inventory, orders] = await Promise.all([
        repository.findInventoryByBrand(brandId, { trackedOnDashboard: true }),
        repository.findOrdersByBrand(brandId, {
          start_date: new Date(Date.now() - 7 * 86400000).toISOString(),
        }),
      ]);

      const anomalies: any[] = [];

      const outOfStock = inventory.filter(i => i.stockLevel === 0);
      if (outOfStock.length > 0) {
        anomalies.push({
          type: 'inventory',
          severity: 'high',
          title: `${outOfStock.length} item(s) out of stock`,
          detail: outOfStock.slice(0, 3).map(i => i.name).join(', '),
        });
      }

      const lowStock = inventory.filter(i => i.stockLevel > 0 && i.stockLevel <= i.reorderPoint);
      if (lowStock.length > 0) {
        anomalies.push({
          type: 'inventory',
          severity: 'medium',
          title: `${lowStock.length} item(s) below reorder point`,
          detail: lowStock.slice(0, 3).map(i => i.name).join(', '),
        });
      }

      const slaBreaches = orders.filter(o => (o.hoursToDispatch ?? 0) > 24);
      if (slaBreaches.length > 0) {
        anomalies.push({
          type: 'sla',
          severity: 'high',
          title: `${slaBreaches.length} SLA breach(es) in last 7 days`,
          detail: 'Orders dispatched after 24h SLA window',
        });
      }

      res.json({ anomalies });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });
}
