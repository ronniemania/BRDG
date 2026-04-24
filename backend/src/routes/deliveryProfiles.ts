import { Express, Request, Response } from 'express';
import { AuthRequest } from '../config/authMiddleware';
import repository from '../database/repository';
import { ValidationError, NotFoundError, ForbiddenError } from '../utils/errors';
import { sendDeliveryProfile } from '../services/deliveryProfileService';

export function setupDeliveryProfileRoutes(app: Express) {
  // ─── CRUD ─────────────────────────────────────────────────────────────────────

  /**
   * GET /api/delivery-profiles?brandId=
   */
  app.get('/api/delivery-profiles', async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId!;
      const brandId = req.query.brandId as string;
      if (!brandId) throw new ValidationError('brandId is required');
      if (!await repository.canAccessBrand(brandId, userId)) throw new ForbiddenError();

      const profiles = await repository.findDeliveryProfiles(brandId);
      res.json({ profiles });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  /**
   * POST /api/delivery-profiles
   */
  app.post('/api/delivery-profiles', async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId!;
      const {
        brandId, name, description, profileType,
        metrics, recipients, emailSubject, emailTemplate, schedule,
      } = req.body;
      if (!brandId || !name) throw new ValidationError('brandId and name are required');
      if (!await repository.canAccessBrand(brandId, userId)) throw new ForbiddenError();

      const profile = await repository.createDeliveryProfile({
        brandId,
        name,
        description: description ?? '',
        profileType: profileType ?? 'custom',
        metrics: Array.isArray(metrics) ? metrics : [],
        recipients: Array.isArray(recipients) ? recipients : [],
        emailSubject: emailSubject ?? 'Report',
        emailTemplate: emailTemplate ?? '',
        schedule: schedule ?? 'manual',
      });
      res.status(201).json({ profile });
    } catch (err: any) {
      res.status(err.status || 400).json({ message: err.message });
    }
  });

  /**
   * PATCH /api/delivery-profiles/:id
   */
  app.patch('/api/delivery-profiles/:id', async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId!;
      const existing = await repository.findDeliveryProfile(req.params.id);
      if (!existing) throw new NotFoundError('Delivery profile not found');
      if (!await repository.canAccessBrand(existing.brandId, userId)) throw new ForbiddenError();

      const {
        name, description, profileType,
        metrics, recipients, emailSubject, emailTemplate, schedule,
      } = req.body;

      const updated = await repository.updateDeliveryProfile(req.params.id, {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(profileType !== undefined && { profileType }),
        ...(metrics !== undefined && { metrics }),
        ...(recipients !== undefined && { recipients }),
        ...(emailSubject !== undefined && { emailSubject }),
        ...(emailTemplate !== undefined && { emailTemplate }),
        ...(schedule !== undefined && { schedule }),
      });
      res.json({ profile: updated });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  /**
   * DELETE /api/delivery-profiles/:id
   */
  app.delete('/api/delivery-profiles/:id', async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId!;
      const existing = await repository.findDeliveryProfile(req.params.id);
      if (!existing) throw new NotFoundError('Delivery profile not found');
      if (!await repository.canAccessBrand(existing.brandId, userId)) throw new ForbiddenError();

      await repository.deleteDeliveryProfile(req.params.id);
      res.json({ message: 'Delivery profile deleted' });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // ─── Send ─────────────────────────────────────────────────────────────────────

  /**
   * POST /api/delivery-profiles/:id/send
   * Fetches current brand metrics, renders the email template, and sends to all recipients.
   */
  app.post('/api/delivery-profiles/:id/send', async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId!;
      const existing = await repository.findDeliveryProfile(req.params.id);
      if (!existing) throw new NotFoundError('Delivery profile not found');
      if (!await repository.canAccessBrand(existing.brandId, userId)) throw new ForbiddenError();

      const result = await sendDeliveryProfile(req.params.id, userId);
      res.json(result);
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });
}
