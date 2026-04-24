import { Express, Request, Response } from 'express';
import { AuthRequest } from '../config/authMiddleware';
import repository from '../database/repository';
import { ValidationError, NotFoundError, ForbiddenError } from '../utils/errors';
import {
  sendDeliveryProfile,
  renderDeliveryProfilePreview,
  getMetricCatalog,
} from '../services/deliveryProfileService';
import { computeNextRunAt } from '../services/reportScheduler';
import { ADMIN_EMAILS } from '../config/constants';
import { rateLimit } from '../utils/rateLimit';

const sendLimiter    = rateLimit('profile-send',    { capacity: 5,  refillPerSec: 5 / 60 });   // 5 sends / min / user
const previewLimiter = rateLimit('profile-preview', { capacity: 20, refillPerSec: 20 / 60 });  // 20 previews / min / user

async function isAdminUser(userId: string): Promise<boolean> {
  const user = await repository.findUserById(userId);
  if (!user) return false;
  // Either the DB role is admin/boss, OR the email is in the seed admin list.
  if (user.role === 'admin' || user.role === 'boss') return true;
  return ADMIN_EMAILS.map(e => e.toLowerCase()).includes((user.email || '').toLowerCase());
}

export function setupDeliveryProfileRoutes(app: Express) {

  // ── Metric catalog (static reference for UI) ────────────────────────────────
  app.get('/api/delivery-profiles/metrics', (_req: Request, res: Response) => {
    res.json({ metrics: getMetricCatalog() });
  });

  // ── Shared templates (visible to all admins across brands) ──────────────────
  app.get('/api/delivery-profiles/shared', async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId!;
      if (!await isAdminUser(userId)) throw new ForbiddenError('Admin access required');
      const profiles = await repository.findSharedDeliveryProfiles();
      res.json({ profiles });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // ── Clone a profile into a target brand ─────────────────────────────────────
  app.post('/api/delivery-profiles/:id/clone', async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId!;
      const source = await repository.findDeliveryProfile(req.params.id);
      if (!source) throw new NotFoundError('Source profile not found');

      const targetBrandId: string = req.body.brandId || source.brandId;
      if (!await repository.canAccessBrand(targetBrandId, userId)) throw new ForbiddenError();
      // Source must be either accessible or shared
      const sourceAccessible = await repository.canAccessBrand(source.brandId, userId);
      if (!sourceAccessible && !source.isShared) throw new ForbiddenError();

      const user = await repository.findUserById(userId);
      const cloned = await repository.createDeliveryProfile({
        brandId: targetBrandId,
        name: `${source.name} (copy)`,
        description: source.description,
        profileType: source.profileType,
        metrics: source.metrics as any,
        recipients: source.recipients as any,
        emailSubject: source.emailSubject,
        emailTemplate: source.emailTemplate,
        schedule: source.schedule,
        scheduleCron: (source as any).scheduleCron ?? null,
        scheduleHour: (source as any).scheduleHour ?? 7,
        scheduleDow: (source as any).scheduleDow ?? 1,
        dateRange: (source as any).dateRange ?? 'today',
        isShared: false,
        mailProvider: (source as any).mailProvider ?? 'auto',
        createdBy: userId,
        createdByEmail: user?.email ?? null,
        nextRunAt: null,
      });
      res.status(201).json({ profile: cloned });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // ── List profiles for a brand (includes shared admin templates) ────────────
  app.get('/api/delivery-profiles', async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId!;
      const brandId = req.query.brandId as string;
      if (!brandId) throw new ValidationError('brandId is required');
      if (!await repository.canAccessBrand(brandId, userId)) throw new ForbiddenError();

      const [own, shared] = await Promise.all([
        repository.findDeliveryProfiles(brandId),
        isAdminUser(userId).then(isA => isA ? repository.findSharedDeliveryProfiles() : []),
      ]);

      const ownIds = new Set(own.map(p => p.id));
      const sharedExtras = shared.filter(p => !ownIds.has(p.id) && p.brandId !== brandId);

      res.json({ profiles: own, sharedProfiles: sharedExtras });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // ── Create ─────────────────────────────────────────────────────────────────
  app.post('/api/delivery-profiles', async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId!;
      const {
        brandId, name, description, profileType,
        metrics, recipients, emailSubject, emailTemplate,
        schedule, scheduleCron, scheduleHour, scheduleDow,
        dateRange, isShared, mailProvider, slackWebhookUrl,
      } = req.body;
      if (!brandId || !name) throw new ValidationError('brandId and name are required');
      if (!await repository.canAccessBrand(brandId, userId)) throw new ForbiddenError();

      // isShared requires admin
      if (isShared && !await isAdminUser(userId)) {
        throw new ForbiddenError('Only admins can create shared templates');
      }

      const user = await repository.findUserById(userId);
      const scheduleType = schedule ?? 'manual';
      const nextRunAt = scheduleType === 'manual' ? null : computeNextRunAt({
        schedule: scheduleType,
        scheduleCron,
        scheduleHour: scheduleHour ?? 7,
        scheduleDow: scheduleDow ?? 1,
      });

      const profile = await repository.createDeliveryProfile({
        brandId,
        name,
        description: description ?? '',
        profileType: profileType ?? 'custom',
        metrics: Array.isArray(metrics) ? metrics : [],
        recipients: Array.isArray(recipients) ? recipients : [],
        emailSubject: emailSubject ?? 'Report',
        emailTemplate: emailTemplate ?? '',
        schedule: scheduleType,
        scheduleCron: scheduleCron ?? null,
        scheduleHour: scheduleHour ?? 7,
        scheduleDow: scheduleDow ?? 1,
        dateRange: dateRange ?? 'today',
        isShared: !!isShared,
        mailProvider: mailProvider ?? 'auto',
        slackWebhookUrl: slackWebhookUrl ?? null,
        createdBy: userId,
        createdByEmail: user?.email ?? null,
        nextRunAt,
      });
      res.status(201).json({ profile });
    } catch (err: any) {
      res.status(err.status || 400).json({ message: err.message });
    }
  });

  // ── Patch ──────────────────────────────────────────────────────────────────
  app.patch('/api/delivery-profiles/:id', async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId!;
      const existing = await repository.findDeliveryProfile(req.params.id);
      if (!existing) throw new NotFoundError('Delivery profile not found');

      const isAdmin = await isAdminUser(userId);
      const canAccess = await repository.canAccessBrand(existing.brandId, userId);
      // Admins can edit any profile (shared or not); others only their brand's
      if (!canAccess && !isAdmin) throw new ForbiddenError();

      if (req.body.isShared !== undefined && req.body.isShared !== existing.isShared && !isAdmin) {
        throw new ForbiddenError('Only admins can toggle shared templates');
      }

      const patch: any = {};
      const keys = [
        'name', 'description', 'profileType', 'metrics', 'recipients',
        'emailSubject', 'emailTemplate', 'schedule', 'scheduleCron',
        'scheduleHour', 'scheduleDow', 'dateRange', 'isShared', 'mailProvider',
        'slackWebhookUrl', 'paused',
      ];
      for (const k of keys) if (req.body[k] !== undefined) patch[k] = req.body[k];
      // Resuming a dead-lettered profile: reset failure streak and reschedule.
      if (req.body.paused === false && existing.paused) {
        patch.consecutiveFailures = 0;
      }

      // Recompute nextRunAt if scheduling changed
      if (patch.schedule || patch.scheduleCron !== undefined || patch.scheduleHour !== undefined || patch.scheduleDow !== undefined) {
        const effective = { ...existing, ...patch };
        patch.nextRunAt = effective.schedule === 'manual' ? null : computeNextRunAt({
          schedule: effective.schedule,
          scheduleCron: effective.scheduleCron,
          scheduleHour: effective.scheduleHour ?? 7,
          scheduleDow: effective.scheduleDow ?? 1,
        });
      }

      const updated = await repository.updateDeliveryProfile(req.params.id, patch);
      res.json({ profile: updated });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // ── Delete ─────────────────────────────────────────────────────────────────
  app.delete('/api/delivery-profiles/:id', async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId!;
      const existing = await repository.findDeliveryProfile(req.params.id);
      if (!existing) throw new NotFoundError('Delivery profile not found');
      const isAdmin = await isAdminUser(userId);
      const canAccess = await repository.canAccessBrand(existing.brandId, userId);
      if (!canAccess && !isAdmin) throw new ForbiddenError();

      await repository.deleteDeliveryProfile(req.params.id);
      res.json({ message: 'Delivery profile deleted' });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // ── Preview (render HTML without sending) ──────────────────────────────────
  app.get('/api/delivery-profiles/:id/preview', previewLimiter, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId!;
      const existing = await repository.findDeliveryProfile(req.params.id);
      if (!existing) throw new NotFoundError('Delivery profile not found');
      const isAdmin = await isAdminUser(userId);
      const canAccess = await repository.canAccessBrand(existing.brandId, userId);
      if (!canAccess && !(existing.isShared && isAdmin)) throw new ForbiddenError();

      const preview = await renderDeliveryProfilePreview(req.params.id);
      res.json(preview);
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // ── Send now ───────────────────────────────────────────────────────────────
  app.post('/api/delivery-profiles/:id/send', sendLimiter, async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId!;
      const existing = await repository.findDeliveryProfile(req.params.id);
      if (!existing) throw new NotFoundError('Delivery profile not found');
      const isAdmin = await isAdminUser(userId);
      const canAccess = await repository.canAccessBrand(existing.brandId, userId);
      if (!canAccess && !(existing.isShared && isAdmin)) throw new ForbiddenError();

      const result = await sendDeliveryProfile(req.params.id, userId);
      res.json(result);
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });
}
