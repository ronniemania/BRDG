/**
 * Shared Data routes — collaborative data feed and brand membership management.
 *
 * Shared Data Feed:
 *   GET    /api/shared-data                      List all data items for a brand (owner + members)
 *   PATCH  /api/shared-data/:id                  Update item status: pending | retained | archived
 *   DELETE /api/shared-data/:id                  Remove item from feed
 *   GET    /api/shared-data/pending-count         Count of pending items (for sidebar badge)
 *
 * Brand Members:
 *   GET    /api/brands/:brandId/members           List members of a brand
 *   POST   /api/brands/:brandId/members           Add member by email (owner only)
 *   DELETE /api/brands/:brandId/members/:userId   Remove member (owner only)
 */

import { Express, Request, Response } from 'express';
import repository from '../database/repository';
import { ValidationError, NotFoundError, ForbiddenError } from '../utils/errors';

export function setupSharedDataRoutes(app: Express) {
  // ── Pending count for sidebar badge ────────────────────────────────────────
  // Must be registered before /:id to avoid route conflict
  app.get('/api/shared-data/pending-count', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId as string;
      const { brandId } = req.query as { brandId?: string };
      if (!brandId) return res.json({ count: 0 });
      if (!await repository.canAccessBrand(brandId, userId)) return res.json({ count: 0 });
      const count = await repository.countPendingSharedData(brandId);
      res.json({ count });
    } catch {
      res.json({ count: 0 });
    }
  });

  // ── List shared data items ──────────────────────────────────────────────────
  app.get('/api/shared-data', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId as string;
      const { brandId, status } = req.query as { brandId?: string; status?: string };
      if (!brandId) throw new ValidationError('brandId is required');
      if (!await repository.canAccessBrand(brandId, userId)) throw new ForbiddenError();
      const items = await repository.findSharedDataItems(brandId, { status });
      const pendingCount = await repository.countPendingSharedData(brandId);
      res.json({ items, pendingCount });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // ── Update item status ──────────────────────────────────────────────────────
  app.patch('/api/shared-data/:id', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId as string;
      const { status } = req.body as { status?: string };
      const allowed = ['pending', 'retained', 'archived'];
      if (!status || !allowed.includes(status)) {
        throw new ValidationError(`status must be one of: ${allowed.join(', ')}`);
      }
      const item = await repository.prisma.sharedDataItem.findUnique({ where: { id: req.params.id } });
      if (!item) throw new NotFoundError('Item not found');
      if (!await repository.canAccessBrand(item.brandId, userId)) throw new ForbiddenError();
      const updated = await repository.updateSharedDataItem(req.params.id, { status });
      res.json({ item: updated });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // ── Delete item ─────────────────────────────────────────────────────────────
  app.delete('/api/shared-data/:id', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId as string;
      const item = await repository.prisma.sharedDataItem.findUnique({ where: { id: req.params.id } });
      if (!item) throw new NotFoundError('Item not found');
      if (!await repository.canAccessBrand(item.brandId, userId)) throw new ForbiddenError();
      await repository.deleteSharedDataItem(req.params.id);
      res.json({ message: 'Deleted' });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // ── List brand members ──────────────────────────────────────────────────────
  app.get('/api/brands/:brandId/members', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId as string;
      const { brandId } = req.params;
      if (!await repository.canAccessBrand(brandId, userId)) throw new ForbiddenError();
      const brand = await repository.findBrandById(brandId);
      const members = await repository.findBrandMembers(brandId);
      res.json({ brand, members });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // ── Add brand member by email (owner only) ──────────────────────────────────
  app.post('/api/brands/:brandId/members', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId as string;
      const { brandId } = req.params;
      const { email } = req.body as { email?: string };
      if (!email) throw new ValidationError('email is required');

      const brand = await repository.findBrandById(brandId);
      if (!brand || brand.ownerId !== userId) throw new ForbiddenError('Only the brand owner can add members');

      const targetUser = await repository.findUserByEmail(email);
      if (!targetUser) throw new NotFoundError(`No account found with email "${email}". They must sign up first.`);
      if (targetUser.id === userId) throw new ValidationError('You are already the brand owner');

      const existing = await repository.findBrandMember(brandId, targetUser.id);
      if (existing) throw new ValidationError('This user is already a member of this brand');

      const member = await repository.addBrandMember({ brandId, userId: targetUser.id });
      res.status(201).json({ member, user: { id: targetUser.id, email: targetUser.email, firstName: targetUser.firstName, lastName: targetUser.lastName } });
    } catch (err: any) {
      res.status(err.status || 400).json({ message: err.message });
    }
  });

  // ── Remove brand member (owner only) ───────────────────────────────────────
  app.delete('/api/brands/:brandId/members/:memberId', async (req: Request, res: Response) => {
    try {
      const userId = (req as any).userId as string;
      const { brandId, memberId } = req.params;
      const brand = await repository.findBrandById(brandId);
      if (!brand || brand.ownerId !== userId) throw new ForbiddenError('Only the brand owner can remove members');
      await repository.removeBrandMember(brandId, memberId);
      res.json({ message: 'Member removed' });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });
}
