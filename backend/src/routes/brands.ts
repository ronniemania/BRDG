import { Express, Request, Response } from 'express';
import repository from '../database/repository';
import { ValidationError, NotFoundError, ForbiddenError } from '../utils/errors';

export function setupBrandsRoutes(app: Express) {
  // List brands for current user — includes owned AND member brands
  app.get('/api/brands', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const brands = await repository.findAccessibleBrands(userId);
      res.json({ brands });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // Create brand
  app.post('/api/brands', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const { name } = req.body;
      if (!name) throw new ValidationError('Brand name is required');
      const brand = await repository.createBrand({ name, ownerId: userId });
      res.status(201).json({ brand });
    } catch (err: any) {
      res.status(err.status || 400).json({ message: err.message });
    }
  });

  // Get single brand
  app.get('/api/brands/:brandId', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const brand = await repository.findBrandById(req.params.brandId);
      if (!brand) throw new NotFoundError('Brand not found');
      if (brand.ownerId !== userId) throw new ForbiddenError();
      res.json({ brand });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // Update brand
  app.patch('/api/brands/:brandId', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const brand = await repository.findBrandById(req.params.brandId);
      if (!brand) throw new NotFoundError('Brand not found');
      if (brand.ownerId !== userId) throw new ForbiddenError();
      const updated = await repository.updateBrand(req.params.brandId, req.body);
      res.json({ brand: updated });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // Update brand module features (owner only)
  app.patch('/api/brands/:brandId/features', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const brand = await repository.findBrandById(req.params.brandId);
      if (!brand) throw new NotFoundError('Brand not found');
      if (brand.ownerId !== userId) throw new ForbiddenError('Only the brand owner can manage modules');
      const { features } = req.body;
      if (!Array.isArray(features)) return res.status(400).json({ message: 'features must be an array of module IDs' });
      const updated = await repository.updateBrand(req.params.brandId, { features });
      res.json({ brand: updated });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // Delete brand
  app.delete('/api/brands/:brandId', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId;
      const brand = await repository.findBrandById(req.params.brandId);
      if (!brand) throw new NotFoundError('Brand not found');
      if (brand.ownerId !== userId) throw new ForbiddenError();
      await repository.deleteBrand(req.params.brandId);
      res.json({ message: 'Brand deleted' });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // ── Brand-scoped data endpoints ──────────────────────────────────────────

  async function assertBrandAccess(req: Request): Promise<string> {
    const userId = (req as any).userId;
    const brand = await repository.findBrandById(req.params.brandId);
    if (!brand) throw new NotFoundError('Brand not found');
    if (!await repository.canAccessBrand(brand.id, userId)) throw new ForbiddenError();
    return brand.id;
  }

  // Orders for brand
  app.get('/api/brands/:brandId/orders', async (req: Request, res: Response) => {
    try {
      const brandId = await assertBrandAccess(req);
      const orders = await repository.findOrdersByBrand(brandId, req.query as any);
      res.json({ orders, total: orders.length });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // Customers for brand
  app.get('/api/brands/:brandId/customers', async (req: Request, res: Response) => {
    try {
      const brandId = await assertBrandAccess(req);
      const customers = await repository.findCustomersByBrand(brandId, req.query as any);
      res.json({ customers, total: customers.length });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // Inventory for brand
  app.get('/api/brands/:brandId/inventory', async (req: Request, res: Response) => {
    try {
      const brandId = await assertBrandAccess(req);
      const items = await repository.findInventoryByBrand(brandId, req.query as any);
      res.json({ items, total: items.length });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // Returns for brand
  app.get('/api/brands/:brandId/returns', async (req: Request, res: Response) => {
    try {
      const brandId = await assertBrandAccess(req);
      const returns = await repository.findReturnsByBrand(brandId, req.query as any);
      res.json({ returns, total: returns.length });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });
}
