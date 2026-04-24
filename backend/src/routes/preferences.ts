import { Express, Request, Response } from 'express';
import repository from '../database/repository';
import { AuthRequest } from '../config/authMiddleware';

export function setupPreferencesRoutes(app: Express) {
  // GET /api/user/preferences — return current user's preferences
  app.get('/api/user/preferences', async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId!;
      const prefs = await repository.getUserPreferences(userId);
      res.json({ preferences: prefs });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  // PATCH /api/user/preferences — merge-update preferences
  app.patch('/api/user/preferences', async (req: Request, res: Response) => {
    try {
      const userId = (req as AuthRequest).userId!;
      const patch = req.body;
      if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
        return res.status(400).json({ message: 'Body must be a JSON object' });
      }
      const updated = await repository.updateUserPreferences(userId, patch);
      res.json({ preferences: updated });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });
}
