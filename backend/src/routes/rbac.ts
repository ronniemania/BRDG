import { Express, Request, Response } from 'express';
import { AuthRequest } from '../config/authMiddleware';
import repository from '../database/repository';
import { ValidationError, NotFoundError, ForbiddenError } from '../utils/errors';

export function setupRBACRoutes(app: Express) {
  // ─── Policies ────────────────────────────────────────────────────────────────

  /**
   * GET /api/rbac?brandId=
   * Returns all RBAC policies + member attributes for the brand.
   */
  app.get('/api/rbac', async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId!;
      const brandId = req.query.brandId as string;
      if (!brandId) throw new ValidationError('brandId is required');
      if (!await repository.canAccessBrand(brandId, userId)) throw new ForbiddenError();

      const [policies, members] = await Promise.all([
        repository.findRBACPolicies(brandId),
        repository.findBrandMembers(brandId),
      ]);

      res.json({ policies, members });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  /**
   * GET /api/rbac/my-access?brandId=
   * Returns the calling user's allowed modules for the specified brand,
   * derived from their team/department attributes and the brand's RBAC policies.
   * Returns { allowedModules: null } when no restrictions apply (all access).
   */
  app.get('/api/rbac/my-access', async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId!;
      const brandId = req.query.brandId as string;
      if (!brandId) throw new ValidationError('brandId is required');
      if (!await repository.canAccessBrand(brandId, userId)) throw new ForbiddenError();

      const member = await repository.findBrandMember(brandId, userId);

      // No membership record or no team/dept set → unrestricted
      if (!member || (!(member as any).team && !(member as any).department)) {
        return res.json({ allowedModules: null, team: null, department: null });
      }

      const memberTeam = (member as any).team as string | null;
      const memberDept = (member as any).department as string | null;

      const policies = await repository.findRBACPolicies(brandId);
      const applicable = policies.filter((p: any) =>
        (p.team && p.team === memberTeam) ||
        (p.department && p.department === memberDept),
      );

      // No policies match → unrestricted
      if (!applicable.length) {
        return res.json({ allowedModules: null, team: memberTeam, department: memberDept });
      }

      // Union of all modules granted by applicable policies
      const allowed = new Set<string>();
      for (const policy of applicable) {
        const mods = (policy.allowedModules as string[]) || [];
        mods.forEach(m => allowed.add(m));
      }

      res.json({
        allowedModules: Array.from(allowed),
        team: memberTeam,
        department: memberDept,
      });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  /**
   * POST /api/rbac/policies
   * Creates a new RBAC policy for a brand.
   */
  app.post('/api/rbac/policies', async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId!;
      const { brandId, name, team, department, allowedModules } = req.body;
      if (!brandId || !name) throw new ValidationError('brandId and name are required');
      if (!await repository.canAccessBrand(brandId, userId)) throw new ForbiddenError();

      const policy = await repository.createRBACPolicy({
        brandId, name, team: team ?? null, department: department ?? null,
        allowedModules: Array.isArray(allowedModules) ? allowedModules : [],
      });
      res.status(201).json({ policy });
    } catch (err: any) {
      res.status(err.status || 400).json({ message: err.message });
    }
  });

  /**
   * PATCH /api/rbac/policies/:id
   * Updates an existing RBAC policy.
   */
  app.patch('/api/rbac/policies/:id', async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId!;
      const policy = await repository.prisma.rBACPolicy.findUnique({ where: { id: req.params.id } });
      if (!policy) throw new NotFoundError('Policy not found');
      if (!await repository.canAccessBrand(policy.brandId, userId)) throw new ForbiddenError();

      const { name, team, department, allowedModules } = req.body;
      const updated = await repository.updateRBACPolicy(req.params.id, {
        ...(name !== undefined && { name }),
        ...(team !== undefined && { team }),
        ...(department !== undefined && { department }),
        ...(allowedModules !== undefined && { allowedModules }),
      });
      res.json({ policy: updated });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  /**
   * DELETE /api/rbac/policies/:id
   */
  app.delete('/api/rbac/policies/:id', async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId!;
      const policy = await repository.prisma.rBACPolicy.findUnique({ where: { id: req.params.id } });
      if (!policy) throw new NotFoundError('Policy not found');
      if (!await repository.canAccessBrand(policy.brandId, userId)) throw new ForbiddenError();

      await repository.deleteRBACPolicy(req.params.id);
      res.json({ message: 'Policy deleted' });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // ─── Member Attributes ───────────────────────────────────────────────────────

  /**
   * PATCH /api/rbac/members/:memberId
   * Sets the team and department attributes on a brand member.
   */
  app.patch('/api/rbac/members/:memberId', async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId!;
      const member = await repository.prisma.brandMember.findUnique({
        where: { id: req.params.memberId },
      });
      if (!member) throw new NotFoundError('Member not found');
      if (!await repository.canAccessBrand(member.brandId, userId)) throw new ForbiddenError();

      const { team, department } = req.body;
      const updated = await repository.updateBrandMemberAttributes(req.params.memberId, {
        team: team ?? null,
        department: department ?? null,
      });
      res.json({ member: updated });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });
}
