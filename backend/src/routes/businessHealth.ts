import { Express, Request, Response } from 'express';
import { AuthRequest, requireRole } from '../config/authMiddleware';
import repository from '../database/repository';

function resolveHealthRange(filters: { start_date?: string; end_date?: string; range?: string }) {
  if (filters.start_date || filters.end_date) {
    return { start_date: filters.start_date, end_date: filters.end_date };
  }
  if (filters.range && filters.range !== 'all') {
    const match = filters.range.match(/^(\d+)([dhm])$/);
    if (match) {
      const end = new Date();
      const start = new Date();
      const n = parseInt(match[1]);
      if (match[2] === 'd') start.setDate(start.getDate() - n);
      else if (match[2] === 'h') start.setHours(start.getHours() - n);
      else if (match[2] === 'm') start.setMonth(start.getMonth() - n);
      return { start_date: start.toISOString(), end_date: end.toISOString() };
    }
  }
  return {};
}

export interface BusinessHealthData {
  totalRevenue: number;
  totalOrders: number;
  pendingOrders: number;
  lowStockItems: number;
  openTickets: number;
  pendingReturns: number;
  totalCustomers: number;
  brandsCount: number;
  lastUpdated: string;
}

async function getBusinessHealth(
  userId: string,
  filters: { start_date?: string; end_date?: string; range?: string } = {},
): Promise<BusinessHealthData> {
  const brands = await repository.findAccessibleBrands(userId);
  const brandIds = brands.map(b => b.id);

  if (brandIds.length === 0) {
    return {
      totalRevenue: 0,
      totalOrders: 0,
      pendingOrders: 0,
      lowStockItems: 0,
      openTickets: 0,
      pendingReturns: 0,
      totalCustomers: 0,
      brandsCount: 0,
      lastUpdated: new Date().toISOString(),
    };
  }

  // Resolve date range for order/return queries
  const dateFilters = resolveHealthRange(filters);

  // Aggregate across all brands in parallel
  const [ordersArr, inventoryArr, ticketsArr, returnsArr, customersArr] = await Promise.all([
    Promise.all(brandIds.map(id => repository.findOrdersByBrand(id, dateFilters))),
    Promise.all(brandIds.map(id => repository.findInventoryByBrand(id, { trackedOnDashboard: true }))),
    Promise.all(brandIds.map(id => repository.findTicketsByBrand(id))),
    Promise.all(brandIds.map(id => repository.findReturnsByBrand(id, dateFilters))),
    Promise.all(brandIds.map(id => repository.findCustomersByBrand(id))),
  ]);

  const orders = ordersArr.flat();
  const inventory = inventoryArr.flat();
  const tickets = ticketsArr.flat();
  const returns = returnsArr.flat();
  const customers = customersArr.flat();

  const totalRevenue = orders.reduce((sum, o) => sum + (o.amount ?? 0), 0);
  const pendingOrders = orders.filter(o => o.status === 'pending').length;
  const lowStockItems = inventory.filter(i => i.stockLevel <= i.reorderPoint).length;
  const openTickets = tickets.filter(t => t.status === 'open').length;
  const pendingReturns = returns.filter(r => r.status === 'requested').length;

  return {
    totalRevenue,
    totalOrders: orders.length,
    pendingOrders,
    lowStockItems,
    openTickets,
    pendingReturns,
    totalCustomers: customers.length,
    brandsCount: brands.length,
    lastUpdated: new Date().toISOString(),
  };
}

export function setupBusinessHealthRoutes(app: Express) {
  // GET /api/business-health — boss-only aggregate view (supports ?range=30d, ?start_date=, ?end_date=)
  app.get(
    '/api/business-health',
    requireRole('boss'),
    async (req: AuthRequest, res: Response) => {
      try {
        const filters = {
          range:      req.query.range as string | undefined,
          start_date: req.query.start_date as string | undefined,
          end_date:   req.query.end_date as string | undefined,
        };
        const health = await getBusinessHealth(req.userId!, filters);
        res.json(health);
      } catch (err: any) {
        res.status(err.status || 500).json({ message: err.message });
      }
    },
  );
}
