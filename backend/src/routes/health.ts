import { Express } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export function setupHealthRoutes(app: Express) {
  app.get('/health', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: Math.round(process.uptime()),
        database: 'connected',
      });
    } catch {
      res.status(503).json({
        status: 'degraded',
        timestamp: new Date().toISOString(),
        uptime: Math.round(process.uptime()),
        database: 'disconnected',
      });
    }
  });

  app.get('/api/health', async (_req, res) => {
    res.json({ status: 'OK', version: '1.0.0' });
  });
}
