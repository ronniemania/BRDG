import { Express, Request, Response } from 'express';
import { AdsPlatform, ActionStatus } from '@prisma/client';
import * as repo from '../database/adsRepository';
import { encryptCredentials } from '../services/adsCredentialService';
import { runDailyOptimizationWorkflow } from '../services/adsWorkflowService';

export function setupAdsRoutes(app: Express): void {

  // ─── Accounts ──────────────────────────────────────────────────────────────

  // List ads accounts for a brand
  app.get('/api/ads/accounts/:brandId', async (req: Request, res: Response) => {
    try {
      const accounts = await repo.getAdsAccountsByBrand(req.params.brandId);
      res.json({ accounts });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
    }
  });

  // Connect a new ads account
  app.post('/api/ads/accounts', async (req: Request, res: Response) => {
    try {
      const { brandId, platform, accountId, accountName, credentials } = req.body;
      if (!brandId || !platform || !accountId || !accountName || !credentials) {
        return res.status(400).json({ error: 'brandId, platform, accountId, accountName, credentials required' });
      }
      const encryptedCreds = encryptCredentials(credentials);
      const account = await repo.createAdsAccount({
        brandId,
        platform: platform as AdsPlatform,
        accountId,
        accountName,
        encryptedCreds,
      });
      // Create default guardrail config
      await repo.upsertAdsAgentConfig(account.id, {});
      res.status(201).json({ account });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
    }
  });

  // ─── Campaigns ─────────────────────────────────────────────────────────────

  // List campaigns with latest metrics for a brand
  app.get('/api/ads/campaigns/:brandId', async (req: Request, res: Response) => {
    try {
      const campaigns = await repo.getCampaignsByBrand(req.params.brandId);
      res.json({ campaigns });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
    }
  });

  // Campaign metrics (historical)
  app.get('/api/ads/metrics/:campaignId', async (req: Request, res: Response) => {
    try {
      const days = parseInt(req.query.days as string || '7', 10);
      const metrics = await repo.getMetricsByCampaign(req.params.campaignId, days);
      res.json({ metrics });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
    }
  });

  // Submit ad draft for human approval queue
  app.post('/api/ads/drafts/:brandId', async (req: Request, res: Response) => {
    try {
      const {
        platform,
        campaignId,
        headline,
        primaryText,
        description,
        cta,
        destinationUrl,
        product,
        objective,
        targetAudience,
        usp,
        tone,
        creativeUrl,
        creativeType,
        dailyBudgetCents,
        startDate,
        endDate,
      } = req.body ?? {};

      if (!platform || !['META', 'GOOGLE'].includes(String(platform))) {
        return res.status(400).json({ error: 'platform must be META or GOOGLE' });
      }

      if (!headline && !primaryText && !description) {
        return res.status(400).json({ error: 'At least one of headline, primaryText, description is required' });
      }

      const draftId = `draft_${Date.now()}`;
      const log = await repo.createActionLog({
        brandId: req.params.brandId,
        agentId: 'agent-ads-creative',
        action: 'CREATIVE_DRAFT',
        entityType: 'draft',
        entityId: campaignId ?? draftId,
        platform: platform as AdsPlatform,
        reason: 'Draft submitted for human approval',
        beforeState: {
          draftId,
          campaignId: campaignId ?? null,
          headline: headline ?? null,
          primaryText: primaryText ?? null,
          description: description ?? null,
          cta: cta ?? null,
          destinationUrl: destinationUrl ?? null,
          product: product ?? null,
          objective: objective ?? null,
          targetAudience: targetAudience ?? null,
          usp: usp ?? null,
          tone: tone ?? null,
          creativeUrl: creativeUrl ?? null,
          creativeType: creativeType ?? null,
          dailyBudgetCents: dailyBudgetCents ?? null,
          startDate: startDate ?? null,
          endDate: endDate ?? null,
        },
        status: ActionStatus.AWAITING_HUMAN,
      });

      res.status(201).json({ draft: { id: log.id } });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
    }
  });

  // ─── Action Log ────────────────────────────────────────────────────────────

  // Get action log for a brand (filterable)
  app.get('/api/ads/action-log/:brandId', async (req: Request, res: Response) => {
    try {
      const { limit, platform, status, workflowRunId } = req.query;
      const logs = await repo.getActionLogsByBrand(req.params.brandId, {
        limit: limit ? parseInt(limit as string, 10) : 100,
        platform: platform as AdsPlatform | undefined,
        status: status as ActionStatus | undefined,
        workflowRunId: workflowRunId as string | undefined,
      });
      res.json({ logs });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
    }
  });

  // ─── Human Approval Queue ──────────────────────────────────────────────────

  // Get approval queue for a brand
  app.get('/api/ads/approval-queue/:brandId', async (req: Request, res: Response) => {
    try {
      const queue = await repo.getHumanApprovalQueue(req.params.brandId);
      res.json({ queue });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
    }
  });

  // Approve an action from the human queue
  app.post('/api/ads/approval-queue/:actionId/approve', async (req: Request, res: Response) => {
    try {
      const log = await repo.updateActionLogStatus(req.params.actionId, {
        status: ActionStatus.APPROVED,
        executedAt: new Date(),
      });
      // Note: Full execution (calling the API) would be triggered here in a complete implementation.
      // For this version, APPROVED status signals to the next workflow run or a separate handler.
      res.json({ log, message: 'Action approved. Will be executed in next workflow cycle.' });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
    }
  });

  // Reject an action from the human queue
  app.post('/api/ads/approval-queue/:actionId/reject', async (req: Request, res: Response) => {
    try {
      const { reason } = req.body;
      const log = await repo.updateActionLogStatus(req.params.actionId, {
        status: ActionStatus.REJECTED,
        errorMessage: reason ?? 'Rejected by human reviewer',
      });
      res.json({ log });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
    }
  });

  // ─── Guardrail Config ──────────────────────────────────────────────────────

  // Get guardrail config for an ads account
  app.get('/api/ads/guardrails/:adsAccountId', async (req: Request, res: Response) => {
    try {
      const config = await repo.getAdsAgentConfig(req.params.adsAccountId);
      if (!config) return res.status(404).json({ error: 'No config found — account may need setup' });
      res.json({ config });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
    }
  });

  // Update guardrail config for an ads account
  app.patch('/api/ads/guardrails/:adsAccountId', async (req: Request, res: Response) => {
    try {
      const config = await repo.upsertAdsAgentConfig(req.params.adsAccountId, req.body);
      res.json({ config });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
    }
  });

  // ─── Workflow ──────────────────────────────────────────────────────────────

  // Manually trigger a workflow run for a brand
  app.post('/api/ads/workflow/:brandId/trigger', async (req: Request, res: Response) => {
    try {
      const { adsAccountId, dryRun } = req.body;
      if (!adsAccountId) return res.status(400).json({ error: 'adsAccountId required' });

      // Fire and forget — respond immediately, run async
      res.json({ message: 'Workflow triggered', brandId: req.params.brandId, adsAccountId, dryRun: !!dryRun });

      // Run async without blocking the response
      runDailyOptimizationWorkflow(req.params.brandId, adsAccountId, !!dryRun)
        .catch(err => console.error(`[ads-route] Workflow error: ${err instanceof Error ? err.message : String(err)}`));
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
    }
  });

  // Get workflow run history for a brand
  app.get('/api/ads/workflow-runs/:brandId', async (req: Request, res: Response) => {
    try {
      const runs = await repo.getWorkflowRuns(req.params.brandId);
      res.json({ runs });
    } catch (err: unknown) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Internal error' });
    }
  });
}
