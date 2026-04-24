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

export function setupInventoryRoutes(app: Express) {
  // List inventory items
  app.get('/api/inventory', async (req: Request, res: Response) => {
    try {
      const brandId = await getBrandId(req);
      const items = await repository.findInventoryByBrand(brandId, {
        category: req.query.category as string,
        status: req.query.status as string,
        shopifyStatus: req.query.shopifyStatus as string,
      });

      // Rolling 30-day sales velocity for Days of Cover
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const recentOrders = await repository.findOrdersByBrand(brandId, {
        start_date: thirtyDaysAgo,
      }).catch(() => [] as any[]);

      const totalRevenue30d = recentOrders.reduce((s: number, o: any) => s + (o.amount ?? 0), 0);
      const avgSalePrice = items.length
        ? items.reduce((s, i) => s + (i.salePrice ?? 0), 0) / items.length
        : 0;
      const estimatedDailyItemsSold = avgSalePrice > 0 ? totalRevenue30d / avgSalePrice / 30 : 0;
      const sellableSkuCount = items.filter(i => (i as any).binType !== 'damaged' && (i as any).binType !== 'expired').length;
      const avgDailySalesPerSku = sellableSkuCount > 0 ? estimatedDailyItemsSold / sellableSkuCount : 0;

      // Annotate each item with daysOfCover and dynamicRop
      const LEAD_TIME_DAYS = 7;
      const SAFETY_BUFFER = 2;
      const annotatedItems = items.map(i => {
        const daily = avgDailySalesPerSku > 0 ? avgDailySalesPerSku : i.reorderPoint / 14;
        const daysOfCover = i.stockLevel > 0 ? Math.round(i.stockLevel / daily) : 0;
        const dynamicRop = Math.round(daily * LEAD_TIME_DAYS + daily * SAFETY_BUFFER);
        const belowRop = i.stockLevel < (dynamicRop || i.reorderPoint);
        return { ...i, daysOfCover, dynamicRop, belowRop, avgDailySales: Math.round(daily * 10) / 10 };
      });

      const totalValue = items.reduce((s, i) => s + (i.salePrice ?? 0) * (i.stockLevel ?? 0), 0);
      const totalCostValue = items.reduce((s, i) => s + (i.costPrice ?? 0) * (i.stockLevel ?? 0), 0);
      const lowStock = items.filter(i => i.stockLevel <= i.reorderPoint && i.stockLevel > 0).length;
      const outOfStock = items.filter(i => i.stockLevel === 0).length;

      res.json({
        items: annotatedItems,
        total: items.length,
        totalValue: Math.round(totalValue),
        totalCostValue: Math.round(totalCostValue),
        lowStock,
        outOfStock,
        avgDailySalesPerSku: Math.round(avgDailySalesPerSku * 10) / 10,
        categories: [...new Set(items.map(i => i.category))],
      });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // Warehouses - must be before /:id to avoid route conflict
  app.get('/api/inventory/warehouses', async (req: Request, res: Response) => {
    try {
      const brandId = await getBrandId(req);
      const warehouses = await repository.findWarehousesByBrand(brandId);
      res.json({ warehouses });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // Get single item
  app.get('/api/inventory/:id', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId as string;
      const item = await repository.prisma.inventoryItem.findUnique({ where: { id: req.params.id } });
      if (!item) throw new NotFoundError('Item not found');
      if (!await repository.canAccessBrand(item.brandId, userId)) throw new ForbiddenError();
      res.json({ item });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // Create item
  app.post('/api/inventory', async (req: Request, res: Response) => {
    try {
      const brandId = await getBrandId(req);
      const { sku, name, stockLevel, reorderPoint, category, costPrice, salePrice, maxStock } = req.body;
      if (!sku || !name) throw new ValidationError('sku and name are required');

      const item = await repository.createInventoryItem({
        brandId, sku, name,
        stockLevel: stockLevel ?? 0,
        reorderPoint: reorderPoint ?? 10,
        reorderLevel: reorderPoint ?? 10,
        category: category || 'General',
        costPrice: costPrice ?? 0,
        salePrice: salePrice ?? 0,
        maxStock: maxStock ?? 100,
        status: (stockLevel ?? 0) === 0 ? 'out_of_stock'
          : (stockLevel ?? 0) <= (reorderPoint ?? 10) ? 'low_stock' : 'in_stock',
      });
      res.status(201).json({ item });
    } catch (err: any) {
      res.status(err.status || 400).json({ message: err.message });
    }
  });

  // Update item
  app.patch('/api/inventory/:id', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId as string;
      const existing = await repository.prisma.inventoryItem.findUnique({ where: { id: req.params.id } });
      if (!existing) throw new NotFoundError('Item not found');
      if (!await repository.canAccessBrand(existing.brandId, userId)) throw new ForbiddenError();

      const { stockLevel, salePrice, costPrice, reorderPoint, status, trackedOnDashboard } = req.body;
      const computedStatus = stockLevel != null
        ? stockLevel === 0 ? 'out_of_stock'
          : stockLevel <= (reorderPoint ?? 10) ? 'low_stock' : 'in_stock'
        : status;

      const item = await repository.updateInventoryItem(req.params.id, {
        stockLevel,
        salePrice,
        costPrice,
        reorderPoint,
        status: computedStatus,
        ...(trackedOnDashboard !== undefined ? { trackedOnDashboard } : {}),
      });
      res.json({ item });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // Delete item
  app.delete('/api/inventory/:id', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId as string;
      const existing = await repository.prisma.inventoryItem.findUnique({ where: { id: req.params.id } });
      if (!existing) throw new NotFoundError('Item not found');
      if (!await repository.canAccessBrand(existing.brandId, userId)) throw new ForbiddenError();
      await repository.deleteInventoryItem(req.params.id);
      res.json({ message: 'Item deleted' });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });
}
