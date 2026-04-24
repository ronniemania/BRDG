import { Express, Request, Response } from 'express';
import repository from '../database/repository';
import { AuthRequest } from '../config/authMiddleware';
import { ValidationError, NotFoundError, ForbiddenError } from '../utils/errors';

function getErrorStatus(err: unknown): number {
  return typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status?: unknown }).status === 'number'
    ? (err as { status: number }).status
    : 500;
}

function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

function parsePositiveNumber(value: unknown): number | null {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function requireUserId(req: Request): string {
  const userId = (req as AuthRequest).userId;
  if (!userId) throw new ForbiddenError('Unauthorized');
  return userId;
}

async function getBrandId(req: Request): Promise<string> {
  const brandId = (req.query.brandId as string) || req.params.brandId;
  if (!brandId) throw new ValidationError('brandId is required');

  const brand = await repository.findBrandById(brandId);
  if (!brand) throw new NotFoundError('Brand not found');

  const userId = requireUserId(req);
  if (!await repository.canAccessBrand(brand.id, userId)) throw new ForbiddenError();
  return brand.id;
}

export function setupEcommerceRoutes(app: Express) {
  app.get('/api/ecommerce/orders', async (req: Request, res: Response) => {
    try {
      const brandId = await getBrandId(req);
      const orders = await repository.findOrdersByBrand(brandId, req.query as Record<string, string>);
      const totalRevenue = orders.reduce((sum, order) => sum + order.amount, 0);
      const byStatus = orders.reduce<Record<string, number>>((acc, order) => {
        acc[order.status] = (acc[order.status] || 0) + 1;
        return acc;
      }, {});
      return res.json({ orders, total: orders.length, totalRevenue, byStatus });
    } catch (err: unknown) {
      return res.status(getErrorStatus(err)).json({ message: getErrorMessage(err) });
    }
  });

  app.get('/api/ecommerce/orders/:id', async (req: Request, res: Response) => {
    try {
      const userId = requireUserId(req);
      const order = await repository.prisma.order.findUnique({ where: { id: req.params.id } });
      if (!order) throw new NotFoundError('Order not found');
      if (!await repository.canAccessBrand(order.brandId, userId)) throw new ForbiddenError();
      return res.json({ order });
    } catch (err: unknown) {
      return res.status(getErrorStatus(err)).json({ message: getErrorMessage(err) });
    }
  });

  app.post('/api/ecommerce/orders', async (req: Request, res: Response) => {
    try {
      const brandId = await getBrandId(req);
      const { orderId, customerName, amount, status, orderDate } = req.body as Record<string, unknown>;
      const safeAmount = parsePositiveNumber(amount);
      const safeOrderDate = parseDate(orderDate) ?? new Date();

      if (!orderId || !customerName || safeAmount == null) {
        throw new ValidationError('orderId, customerName, amount are required');
      }

      const order = await repository.createOrder({
        brandId,
        orderId: String(orderId),
        customerName: String(customerName),
        amount: safeAmount,
        status: typeof status === 'string' && status ? status : 'pending',
        orderDate: safeOrderDate,
      });
      return res.status(201).json({ order });
    } catch (err: unknown) {
      const status = getErrorStatus(err);
      return res.status(status === 500 ? 400 : status).json({ message: getErrorMessage(err) });
    }
  });

  app.patch('/api/ecommerce/orders/:id', async (req: Request, res: Response) => {
    try {
      const userId = requireUserId(req);
      const existing = await repository.prisma.order.findUnique({ where: { id: req.params.id } });
      if (!existing) throw new NotFoundError('Order not found');
      if (!await repository.canAccessBrand(existing.brandId, userId)) throw new ForbiddenError();

      const { status, dispatchDate, hoursToDispatch } = req.body as Record<string, unknown>;
      const safeDispatchDate = parseDate(dispatchDate);
      const safeHours = parsePositiveNumber(hoursToDispatch);

      const order = await repository.updateOrder(req.params.id, {
        ...(typeof status === 'string' && { status }),
        ...(safeDispatchDate && { dispatchDate: safeDispatchDate }),
        ...(safeHours != null && { hoursToDispatch: safeHours }),
      });
      return res.json({ order });
    } catch (err: unknown) {
      return res.status(getErrorStatus(err)).json({ message: getErrorMessage(err) });
    }
  });

  app.get('/api/ecommerce/customers', async (req: Request, res: Response) => {
    try {
      const brandId = await getBrandId(req);
      const customers = await repository.findCustomersByBrand(brandId, req.query as Record<string, string>);
      const totalSpent = customers.reduce((sum, customer) => sum + customer.totalSpent, 0);
      const repeatCount = customers.filter(customer => customer.totalOrders > 1).length;
      return res.json({ customers, total: customers.length, totalSpent, repeatCount });
    } catch (err: unknown) {
      return res.status(getErrorStatus(err)).json({ message: getErrorMessage(err) });
    }
  });

  app.get('/api/ecommerce/customers/:id', async (req: Request, res: Response) => {
    try {
      const userId = requireUserId(req);
      const customer = await repository.prisma.customer.findUnique({ where: { id: req.params.id } });
      if (!customer) throw new NotFoundError('Customer not found');
      if (!await repository.canAccessBrand(customer.brandId, userId)) throw new ForbiddenError();
      return res.json({ customer });
    } catch (err: unknown) {
      return res.status(getErrorStatus(err)).json({ message: getErrorMessage(err) });
    }
  });

  app.get('/api/ecommerce/returns', async (req: Request, res: Response) => {
    try {
      const brandId = await getBrandId(req);
      const returns = await repository.findReturnsByBrand(brandId, req.query as Record<string, string>);
      const totalValue = returns.reduce((sum, item) => sum + item.amount, 0);
      const byReason = returns.reduce<Record<string, number>>((acc, item) => {
        const key = item.reason || 'Other';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});
      return res.json({ returns, total: returns.length, totalValue, byReason });
    } catch (err: unknown) {
      return res.status(getErrorStatus(err)).json({ message: getErrorMessage(err) });
    }
  });

  app.post('/api/ecommerce/returns', async (req: Request, res: Response) => {
    try {
      const brandId = await getBrandId(req);
      const { orderId, customerName, amount, reason, channel, sku } = req.body as Record<string, unknown>;
      const safeAmount = parsePositiveNumber(amount) ?? 0;
      if (!orderId || !customerName) throw new ValidationError('orderId and customerName are required');

      const ret = await repository.createReturn({
        brandId,
        orderId: String(orderId),
        customerName: String(customerName),
        amount: safeAmount,
        reason: typeof reason === 'string' ? reason : '',
        channel: typeof channel === 'string' ? channel : '',
        sku: typeof sku === 'string' ? sku : '',
      });
      return res.status(201).json({ return: ret });
    } catch (err: unknown) {
      const status = getErrorStatus(err);
      return res.status(status === 500 ? 400 : status).json({ message: getErrorMessage(err) });
    }
  });

  app.patch('/api/ecommerce/returns/:id', async (req: Request, res: Response) => {
    try {
      const userId = requireUserId(req);
      const existing = await repository.prisma.return.findUnique({ where: { id: req.params.id } });
      if (!existing) throw new NotFoundError('Return not found');
      if (!await repository.canAccessBrand(existing.brandId, userId)) throw new ForbiddenError();

      const { status, returnAction } = req.body as Record<string, unknown>;
      const statusText = typeof status === 'string' ? status : undefined;
      const updated = await repository.updateReturn(req.params.id, {
        ...(statusText && { status: statusText }),
        ...(typeof returnAction === 'string' && { returnAction }),
        resolvedAt: statusText && ['resolved', 'refunded', 'exchanged'].includes(statusText) ? new Date() : undefined,
      });
      return res.json({ return: updated });
    } catch (err: unknown) {
      return res.status(getErrorStatus(err)).json({ message: getErrorMessage(err) });
    }
  });

  app.get('/api/ecommerce/shopify-stores', async (req: Request, res: Response) => {
    try {
      const brandId = await getBrandId(req);
      const stores = await repository.findShopifyStoresByBrand(brandId);
      return res.json({ stores });
    } catch (err: unknown) {
      return res.status(getErrorStatus(err)).json({ message: getErrorMessage(err) });
    }
  });

  app.get('/api/ecommerce/tickets', async (req: Request, res: Response) => {
    try {
      const brandId = await getBrandId(req);
      const tickets = await repository.findTicketsByBrand(brandId, req.query as Record<string, string>);
      const openCount = tickets.filter(ticket => ticket.status === 'open').length;
      const resolvedCount = tickets.filter(ticket => ticket.status === 'resolved').length;
      const responded = tickets.filter(ticket => ticket.responseTimeHours != null);
      const totalResponse = responded.reduce((sum, ticket) => sum + (ticket.responseTimeHours ?? 0), 0);
      const avgResponse = responded.length ? totalResponse / responded.length : 0;
      return res.json({ tickets, total: tickets.length, openCount, resolvedCount, avgResponseHours: Math.round(avgResponse * 10) / 10 });
    } catch (err: unknown) {
      return res.status(getErrorStatus(err)).json({ message: getErrorMessage(err) });
    }
  });

  app.post('/api/ecommerce/shopify-stores', async (req: Request, res: Response) => {
    try {
      const brandId = await getBrandId(req);
      const { shopName, apiKey, apiPassword } = req.body as Record<string, unknown>;
      if (!shopName || !apiKey || !apiPassword) {
        throw new ValidationError('shopName, apiKey, apiPassword are required');
      }
      const store = await repository.createShopifyStore({
        brandId,
        shopName: String(shopName),
        apiKey: String(apiKey),
        apiPassword: String(apiPassword),
      });
      return res.status(201).json({ store });
    } catch (err: unknown) {
      const status = getErrorStatus(err);
      return res.status(status === 500 ? 400 : status).json({ message: getErrorMessage(err) });
    }
  });
}
