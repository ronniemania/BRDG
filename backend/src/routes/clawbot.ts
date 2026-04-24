// clawbot.ts — Master Brand Strategy & Orchestration routes
// All routes require auth (registered after authMiddleware in server.ts)

import { Express, Request, Response } from 'express';
import * as clawbot from '../services/clawbotService';
import prisma from '../database/prismaClient';

export function setupClawbotRoutes(app: Express) {

  // ── POST /api/clawbot/strategy/:brandId ─────────────────────────────────────
  // Generate a full brand strategy from brand data input
  app.post('/api/clawbot/strategy/:brandId', async (req: Request, res: Response) => {
    try {
      const { brandId } = req.params;
      const input = req.body as Parameters<typeof clawbot.generateBrandStrategy>[1];

      if (!input?.brandName || !input?.industry || !input?.primaryGoal) {
        res.status(400).json({ error: 'brandName, industry and primaryGoal are required' });
        return;
      }

      const { strategy, costUsd } = await clawbot.generateBrandStrategy(brandId, input);
      res.json({ strategy, costUsd });
    } catch (e) {
      console.error('[clawbot/strategy]', e);
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ── POST /api/clawbot/campaign-brief/:brandId ────────────────────────────────
  // Expand a campaign idea (from strategy) into a full agent brief
  app.post('/api/clawbot/campaign-brief/:brandId', async (req: Request, res: Response) => {
    try {
      const { brandId } = req.params;
      const { strategyId, campaignIdea } = req.body as {
        strategyId: string;
        campaignIdea: Record<string, unknown>;
      };

      if (!campaignIdea) {
        res.status(400).json({ error: 'campaignIdea is required' });
        return;
      }

      const { brief, costUsd } = await clawbot.generateCampaignBrief(brandId, strategyId, campaignIdea);
      res.json({ brief, costUsd });
    } catch (e) {
      console.error('[clawbot/campaign-brief]', e);
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ── GET /api/clawbot/status/:brandId ────────────────────────────────────────
  // Current state of all 11 agents + pending approvals + latest strategy
  app.get('/api/clawbot/status/:brandId', async (req: Request, res: Response) => {
    try {
      const status = await clawbot.getAgentStatus(req.params.brandId);
      res.json(status);
    } catch (e) {
      console.error('[clawbot/status]', e);
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ── GET /api/clawbot/strategies/:brandId ────────────────────────────────────
  // List all saved strategies for a brand
  app.get('/api/clawbot/strategies/:brandId', async (req: Request, res: Response) => {
    try {
      const strategies = await prisma.brandStrategy.findMany({
        where: { brandId: req.params.brandId },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });
      res.json({ strategies });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ── GET /api/clawbot/briefs/:brandId ────────────────────────────────────────
  // List all campaign briefs
  app.get('/api/clawbot/briefs/:brandId', async (req: Request, res: Response) => {
    try {
      const briefs = await prisma.campaignBrief.findMany({
        where: { brandId: req.params.brandId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      res.json({ briefs });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ── GET /api/clawbot/costs ───────────────────────────────────────────────────
  // API cost summary (admin or brand-scoped)
  app.get('/api/clawbot/costs', async (req: Request, res: Response) => {
    try {
      const brandId = req.query.brandId as string | undefined;
      const days = parseInt(req.query.days as string ?? '30', 10);
      const summary = await clawbot.getCostSummary(brandId, days);
      res.json(summary);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ── GET /api/clawbot/costs/recent ───────────────────────────────────────────
  // Recent cost log entries
  app.get('/api/clawbot/costs/recent', async (req: Request, res: Response) => {
    try {
      const brandId = req.query.brandId as string | undefined;
      const logs = await prisma.apiCostLog.findMany({
        where: brandId ? { brandId } : {},
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      res.json({ logs });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
}
