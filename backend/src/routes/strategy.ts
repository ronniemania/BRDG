// strategy.ts — Strategy API routes
// Intelligence layer endpoints: recommendations, copy variants, performance scores, auto-rules

import { Express, Request, Response } from 'express';
import {
  getCampaignScores,
  generateRecommendations,
  generateCopyVariants,
  evaluateAutoRules,
  CopyInput,
  AutoRule,
} from '../services/strategyService';
import * as repo from '../database/adsRepository';

export function setupStrategyRoutes(app: Express): void {

  // ── Performance scores for all campaigns of a brand ──────────────────────
  app.get('/api/strategy/scores/:brandId', async (req: Request, res: Response) => {
    try {
      const scores = await getCampaignScores(req.params.brandId);
      res.json({ scores });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
    }
  });

  // ── AI-generated strategic recommendations ────────────────────────────────
  app.post('/api/strategy/recommendations/:brandId', async (req: Request, res: Response) => {
    try {
      const { adsAccountId } = req.body;
      const scores = await getCampaignScores(req.params.brandId);

      if (scores.length === 0) {
        return res.json({ recommendations: [], message: 'No campaign data available yet' });
      }

      // Determine platform from first account
      let platform = 'META';
      if (adsAccountId) {
        const account = await repo.getAdsAccount(adsAccountId);
        if (account) platform = account.platform;
      }

      const recommendations = await generateRecommendations(scores, platform);
      res.json({ recommendations, scores });
    } catch (err: unknown) {
      console.error('[strategy/recommendations]', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to generate recommendations' });
    }
  });

  // ── Generate AI copy variants ─────────────────────────────────────────────
  app.post('/api/strategy/copy-variants', async (req: Request, res: Response) => {
    try {
      const input = req.body as CopyInput;
      if (!input.product || !input.platform) {
        return res.status(400).json({ error: 'product and platform are required' });
      }
      const variants = await generateCopyVariants(input);
      res.json({ variants });
    } catch (err: unknown) {
      console.error('[strategy/copy-variants]', err);
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to generate copy variants' });
    }
  });

  // ── Evaluate auto-rules against current scores ────────────────────────────
  app.post('/api/strategy/auto-rules/evaluate/:brandId', async (req: Request, res: Response) => {
    try {
      const rules = req.body.rules as AutoRule[];
      if (!rules || !Array.isArray(rules)) {
        return res.status(400).json({ error: 'rules array required' });
      }
      const scores = await getCampaignScores(req.params.brandId);
      const results = evaluateAutoRules(scores, rules);
      res.json({ results, evaluatedAt: new Date().toISOString() });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
    }
  });

  // ── Quick action: apply a single action to a campaign ────────────────────
  // This queues an action via the existing approval-aware action log pattern.
  app.post('/api/strategy/quick-action/:brandId', async (req: Request, res: Response) => {
    try {
      const { campaignId, externalId, platform, action, valuePct, reason } = req.body;
      if (!campaignId || !action || !platform) {
        return res.status(400).json({ error: 'campaignId, action, and platform required' });
      }

      // Fetch current campaign state
      const campaign = (await repo.getCampaignsByBrand(req.params.brandId))
        .find(c => c.id === campaignId);

      if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

      const beforeState: Record<string, unknown> = {
        status: campaign.status,
        dailyBudgetCents: campaign.dailyBudgetCents,
        source: 'strategy_quick_action',
      };

      let actionType = action;
      if (action === 'INCREASE_BUDGET' || action === 'DECREASE_BUDGET') {
        const pct = valuePct ?? 15;
        const current = campaign.dailyBudgetCents ?? 0;
        const proposed = action === 'INCREASE_BUDGET'
          ? Math.round(current * (1 + pct / 100))
          : Math.round(current * (1 - Math.abs(pct) / 100));
        beforeState.proposedValueCents = proposed;
        beforeState.changePct = pct;
        beforeState.confidence = 0.82;
      }

      const logEntry = await repo.createActionLog({
        brandId: req.params.brandId,
        agentId: 'agent-strategy-ui',
        action: actionType,
        entityType: 'campaign',
        entityId: campaignId,
        externalId: externalId ?? null,
        platform,
        reason: reason ?? `Strategy quick action: ${actionType}`,
        beforeState,
        status: 'AWAITING_HUMAN' as any,
      });

      res.json({
        queued: true,
        logEntry,
        message: 'Action queued for approval',
      });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
    }
  });
}
