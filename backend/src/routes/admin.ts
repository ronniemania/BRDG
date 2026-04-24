import { Express, Request, Response } from 'express';
import repository from '../database/repository';
import { ForbiddenError } from '../utils/errors';
import { ADMIN_EMAILS } from '../config/constants';

async function assertAdmin(req: Request): Promise<void> {
  const userId = (req as any).userId;
  const user = await repository.findUserById(userId);
  if (!user || !ADMIN_EMAILS.includes(user.email)) {
    throw new ForbiddenError('Admin access required');
  }
}

export function setupAdminRoutes(app: Express) {
  // List all users
  app.get('/api/admin/users', async (req: Request, res: Response) => {
    try {
      await assertAdmin(req);
      const users = await repository.listUsers();
      res.json({ users, total: users.length });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // Update user status and/or role
  app.patch('/api/admin/users/:id', async (req: Request, res: Response) => {
    try {
      await assertAdmin(req);
      const { status, role } = req.body;

      const VALID_ROLES = ['boss', 'marketing', 'supply_chain', 'ops', 'support', 'member'];
      if (role !== undefined && !VALID_ROLES.includes(role)) {
        return res.status(400).json({ message: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` });
      }

      const updateData: Record<string, string> = {};
      if (status !== undefined) updateData.status = status;
      if (role !== undefined) updateData.role = role;

      const user = await repository.updateUser(req.params.id, updateData);
      res.json({ user });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // Get audit logs
  app.get('/api/admin/audit-logs', async (req: Request, res: Response) => {
    try {
      await assertAdmin(req);
      const userId = req.query.userId as string | undefined;
      const logs = await repository.findAuditLogs(userId ? { userId } : {});
      res.json({ logs, total: logs.length });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // Platform-wide stats
  app.get('/api/admin/stats', async (req: Request, res: Response) => {
    try {
      await assertAdmin(req);
      const [users, brands] = await Promise.all([
        repository.listUsers(),
        repository.prisma.brand.findMany(),
      ]);
      res.json({
        totalUsers: users.length,
        activeUsers: users.filter(u => u.status === 'approved').length,
        pendingUsers: users.filter(u => u.status === 'pending').length,
        totalBrands: brands.length,
      });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });
}
