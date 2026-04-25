// adsWorkflowService.ts
// Central workflow orchestrator for the ads management engine.
// Owns the state machine — the Claude Bridge stays a dumb task router.

// Use string constants to avoid Prisma enum import issues during build
const AdsPlatform = { META: 'META' as const, GOOGLE: 'GOOGLE' as const };
type AdsPlatform = 'META' | 'GOOGLE';
const ActionStatus = {
  PENDING: 'PENDING' as const,
  APPROVED: 'APPROVED' as const,
  REJECTED: 'REJECTED' as const,
  EXECUTED: 'EXECUTED' as const,
  FAILED: 'FAILED' as const,
  AWAITING_HUMAN: 'AWAITING_HUMAN' as const,
};
type ActionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'FAILED' | 'AWAITING_HUMAN';
import * as metaAdsService from './metaAdsService';
import * as googleAdsService from './googleAdsService';
import { getMetaCredentials, getGoogleCredentials } from './adsCredentialService';
import { verifyApprovedActions, GuardrailConfig, ActionSpec } from './adsGuardrailService';
import * as repo from '../database/adsRepository';
import { ETL_DEFAULT } from '../config/constants';
import { runPipeline } from '../etl/pipeline';
import { makeMetaAdsConnector, makeGoogleAdsConnector } from '../etl/connectors/ads';
import repository from '../database/repository';

const BRIDGE_URL = process.env.BRIDGE_URL || 'http://localhost:18792';
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || '7b721f525270e8e44e5224defc5ae5dbc6ba81c38cf80730';
const TASK_TIMEOUT_MS = 120_000;
const TASK_POLL_MS = 3_000;

// ─── Bridge client ────────────────────────────────────────────────────────────

async function bridgePost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${BRIDGE_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Bridge POST ${path} failed: ${res.status}`);
  return res.json();
}

async function bridgeGet(path: string): Promise<unknown> {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    headers: { 'Authorization': `Bearer ${BRIDGE_TOKEN}` },
  });
  if (!res.ok) throw new Error(`Bridge GET ${path} failed: ${res.status}`);
  return res.json();
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Submit a task to the bridge and poll until complete or timeout.
// Returns the parsed JSON result from the agent.
async function bridgeTask(agentId: string, payload: unknown): Promise<unknown> {
  const submission = await bridgePost('/task', {
    from: 'ads-workflow',
    type: 'ads-management',
    context: { targetAgent: agentId },
    description: JSON.stringify(payload),
  }) as { id: string };

  const taskId = submission.id;
  const deadline = Date.now() + TASK_TIMEOUT_MS;

  while (Date.now() < deadline) {
    await sleep(TASK_POLL_MS);
    const task = await bridgeGet(`/task/${taskId}`) as {
      status: string;
      result?: string;
    };

    if (task.status === 'awaiting_approval' || task.status === 'complete' || task.status === 'completed') {
      if (!task.result) throw new Error(`Agent ${agentId} returned empty result`);
      try {
        return JSON.parse(task.result);
      } catch {
        // Agent returned non-JSON — wrap it
        return { raw: task.result };
      }
    }
    if (task.status === 'failed') {
      throw new Error(`Agent ${agentId} task ${taskId} failed: ${task.result}`);
    }
  }

  throw new Error(`Agent ${agentId} task ${taskId} timed out after ${TASK_TIMEOUT_MS}ms`);
}

// ─── Data fetch + store ───────────────────────────────────────────────────────

async function fetchAndStoreMetrics(
  adsAccountId: string,
  platform: AdsPlatform,
  lookbackDays: number,
): Promise<void> {
  // ETL path: use the pipeline so every insight payload lands in raw_events,
  // failures are captured in etl_dead_letters, and the run is audited in
  // etl_runs. Watermarks aren't strictly necessary here (idempotent upsert)
  // but the pipeline still records them for observability.
  if (ETL_DEFAULT) {
    // Look up the ads account's brandId so the run is correctly attributed.
    const accountRow = await repository.prisma.adsAccount.findUnique({
      where: { id: adsAccountId },
      select: { brandId: true },
    });
    const brandId = accountRow?.brandId;
    if (!brandId) {
      // Without brandId we still want to ingest, but the run won't be
      // attributable in etl_runs. That's a noisy but acceptable outcome.
      console.warn(`[ads-etl] adsAccountId=${adsAccountId} has no brandId — running unattributed`);
    }
    const connector = platform === AdsPlatform.META
      ? makeMetaAdsConnector({ brandId: brandId ?? '', adsAccountId, lookbackDays })
      : makeGoogleAdsConnector({ brandId: brandId ?? '', adsAccountId, lookbackDays });
    await runPipeline(connector, { prisma: repository.prisma, brandId: brandId ?? undefined });
    return;
  }

  const campaigns = await repo.getCampaignsByAccount(adsAccountId);

  if (platform === AdsPlatform.META) {
    const creds = await getMetaCredentials(adsAccountId);
    const insights = await metaAdsService.fetchCampaignInsights(creds, lookbackDays);

    for (const insight of insights) {
      const campaign = campaigns.find(c => c.externalId === insight.externalId);
      if (!campaign) continue;

      await repo.upsertPerformanceMetric({
        campaignId: campaign.id,
        platform: AdsPlatform.META,
        dateKey: insight.dateKey,
        impressions: insight.impressions,
        clicks: insight.clicks,
        spendCents: insight.spendCents,
        conversions: insight.conversions,
        conversionValueCents: insight.conversionValueCents,
        ctr: insight.ctr,
        cpc: insight.cpc,
        cpa: insight.cpa,
        roas: insight.roas,
        frequencyScore: insight.frequency,
      });
    }
  } else if (platform === AdsPlatform.GOOGLE) {
    const creds = await getGoogleCredentials(adsAccountId);
    const metrics = await googleAdsService.fetchCampaignMetrics(creds, lookbackDays);

    for (const metric of metrics) {
      const campaign = campaigns.find(c => c.externalId === metric.externalId);
      if (!campaign) continue;

      await repo.upsertPerformanceMetric({
        campaignId: campaign.id,
        platform: AdsPlatform.GOOGLE,
        dateKey: metric.dateKey,
        impressions: metric.impressions,
        clicks: metric.clicks,
        spendCents: metric.spendCents,
        conversions: metric.conversions,
        conversionValueCents: metric.conversionValueCents,
        ctr: metric.ctr,
        cpc: metric.cpc,
        cpa: metric.cpa,
        roas: metric.roas,
      });
    }
  }
}

async function syncCampaignCatalog(
  adsAccountId: string,
  platform: AdsPlatform,
): Promise<void> {
  if (platform === AdsPlatform.META) {
    const creds = await getMetaCredentials(adsAccountId);
    const campaigns = await metaAdsService.fetchCampaigns(creds);

    for (const c of campaigns) {
      await repo.upsertCampaign({
        adsAccountId,
        externalId: c.id,
        platform: AdsPlatform.META,
        name: c.name,
        status: metaAdsService.mapMetaStatus(c.status),
        objective: c.objective,
        dailyBudgetCents: c.daily_budget ? parseInt(c.daily_budget, 10) : undefined,
      });
    }
    return;
  }

  if (platform === AdsPlatform.GOOGLE) {
    const creds = await getGoogleCredentials(adsAccountId);
    const campaigns = await googleAdsService.fetchCampaigns(creds);

    for (const c of campaigns) {
      await repo.upsertCampaign({
        adsAccountId,
        externalId: c.externalId,
        platform: AdsPlatform.GOOGLE,
        name: c.name,
        status: c.status,
        dailyBudgetCents: c.dailyBudgetCents ?? undefined,
      });
    }
  }
}

// ─── Execute approved actions ─────────────────────────────────────────────────

async function executeApprovedActions(
  actions: ActionSpec[],
  brandId: string,
  adsAccountId: string,
  workflowRunId: string,
  platform: AdsPlatform,
): Promise<void> {
  for (const action of actions) {
    // Create pending action log entry
    const logEntry = await repo.createActionLog({
      brandId,
      agentId: 'agent-ads-executor',
      workflowRunId,
      action: action.type,
      entityType: action.entityType,
      entityId: action.entityId,
      externalId: action.externalId,
      platform,
      reason: action.approvalReason || action.rationale || '',
      beforeState: action.params,
      status: ActionStatus.PENDING,
    });

    // FLAG_CREATIVE_FATIGUE is internal only — no API call
    if (action.type === 'FLAG_CREATIVE_FATIGUE') {
      await repo.updateActionLogStatus(logEntry.id, {
        status: ActionStatus.EXECUTED,
        afterState: { creativeFatigueFlagged: true },
        executedAt: new Date(),
      });
      continue;
    }

    try {
      let apiResponse: unknown;

      if (platform === AdsPlatform.META) {
        const creds = await getMetaCredentials(adsAccountId);
        if (action.type === 'PAUSE_CAMPAIGN') {
          apiResponse = await metaAdsService.pauseCampaign(creds, action.externalId!);
        } else if (action.type === 'INCREASE_BUDGET' || action.type === 'DECREASE_BUDGET') {
          const { proposedValueCents } = action.params as { proposedValueCents: number };
          apiResponse = await metaAdsService.updateCampaignBudget(creds, action.externalId!, proposedValueCents);
        } else if (action.type === 'PAUSE_ADSET') {
          apiResponse = await metaAdsService.pauseAdSet(creds, action.externalId!);
        }
      } else if (platform === AdsPlatform.GOOGLE) {
        const creds = await getGoogleCredentials(adsAccountId);
        if (action.type === 'PAUSE_CAMPAIGN') {
          apiResponse = await googleAdsService.pauseCampaign(creds, action.externalId!);
        } else if (action.type === 'PAUSE_ADSET') {
          apiResponse = await googleAdsService.pauseAdGroup(creds, action.externalId!);
        }
      }

      const afterState = (() => {
        if (action.type === 'PAUSE_CAMPAIGN' || action.type === 'PAUSE_ADSET') return { status: 'PAUSED' };
        if (action.type === 'INCREASE_BUDGET' || action.type === 'DECREASE_BUDGET') {
          return { dailyBudgetCents: (action.params as any).proposedValueCents };
        }
        return {};
      })();

      await repo.updateActionLogStatus(logEntry.id, {
        status: ActionStatus.EXECUTED,
        afterState,
        executedAt: new Date(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[workflow] Action ${action.type} failed: ${message}`);
      await repo.updateActionLogStatus(logEntry.id, {
        status: ActionStatus.FAILED,
        errorMessage: message,
      });
    }
  }
}

// ─── Workflow 1: Daily Optimization ──────────────────────────────────────────

export async function runDailyOptimizationWorkflow(
  brandId: string,
  adsAccountId: string,
  dryRun = false,
): Promise<void> {
  const workflowRunId = `wfrun_${brandId}_${Date.now()}`;
  const lookbackDays = 7;

  console.log(`[workflow] Starting daily optimization: ${workflowRunId}`);

  // Get account + config
  const account = await repo.getAdsAccount(adsAccountId);
  if (!account) throw new Error(`AdsAccount ${adsAccountId} not found`);
  const platform = account.platform;

  let agentConfig = account.agentConfig;
  if (!agentConfig) {
    agentConfig = await repo.upsertAdsAgentConfig(adsAccountId, {});
  }

  const guardrailConfig: GuardrailConfig = {
    manualApprovalMode: agentConfig.manualApprovalMode,
    confidenceThreshold: Number(agentConfig.confidenceThreshold),
    maxDailyBudgetIncrPct: agentConfig.maxDailyBudgetIncrPct,
    minSpendThresholdCents: agentConfig.minSpendThresholdCents,
    cooldownHours: agentConfig.cooldownHours,
    allowedActions: agentConfig.allowedActions as string[],
    blockedCampaignIds: agentConfig.blockedCampaignIds as string[],
  };

  // Step 1: Fetch & store metrics
  if (!dryRun) {
    try {
      await syncCampaignCatalog(adsAccountId, platform);
      console.log(`[workflow] Campaign catalog synced for account ${adsAccountId}`);
    } catch (err: unknown) {
      console.error(`[workflow] Campaign sync failed: ${err instanceof Error ? err.message : String(err)}`);
      // Continue — metrics may still map to existing campaign rows
    }

    try {
      await fetchAndStoreMetrics(adsAccountId, platform, lookbackDays);
      console.log(`[workflow] Metrics fetched for account ${adsAccountId}`);
    } catch (err: unknown) {
      console.error(`[workflow] Metric fetch failed: ${err instanceof Error ? err.message : String(err)}`);
      // Continue — analyst will work with whatever is in DB
    }
  }

  // Step 2: Build analyst input from DB
  const campaigns = await repo.getCampaignsByAccount(adsAccountId);
  const metrics = await repo.getMetricsByAccount(adsAccountId, lookbackDays);

  const analystInput = {
    $schema: 'analyst-input-v1',
    workflowRunId,
    brandId,
    adsAccountId,
    platform,
    lookbackDays,
    campaigns: campaigns.map(c => ({
      campaignId: c.id,
      externalId: c.externalId,
      name: c.name,
      currentDailyBudgetCents: c.dailyBudgetCents ?? 0,
      status: c.status,
    })),
    metrics: metrics.map(m => ({
      campaignId: m.campaignId,
      dateKey: m.dateKey,
      impressions: m.impressions,
      clicks: m.clicks,
      spendCents: m.spendCents,
      conversions: m.conversions,
      conversionValueCents: m.conversionValueCents,
      ctr: Number(m.ctr),
      cpc: Number(m.cpc),
      cpa: Number(m.cpa),
      roas: Number(m.roas),
      frequencyScore: m.frequencyScore ? Number(m.frequencyScore) : null,
    })),
    guardrailConfig,
  };

  if (dryRun) {
    console.log(`[workflow] DRY RUN — analyst input:\n${JSON.stringify(analystInput, null, 2)}`);
    return;
  }

  // Step 3: Run Performance Analyst agent
  console.log(`[workflow] Running agent-ads-analyst...`);
  const analystOutput = await bridgeTask('agent-ads-analyst', analystInput) as Record<string, unknown>;
  console.log(`[workflow] Analyst complete — ${(analystOutput.campaignInsights as unknown[])?.length ?? 0} insights`);

  // Step 4: Get recent action log for cooldown checks
  const recentActions = await repo.getActionLogsByBrand(brandId, { status: ActionStatus.EXECUTED });
  const recentActionsForGuardrail = recentActions.map(a => ({
    entityId: a.entityId,
    action: a.action,
    executedAt: a.executedAt ?? a.createdAt,
    status: a.status,
  }));

  // Build spend records for Rule 5 (min spend threshold)
  const spendRecords = metrics.reduce<{ entityId: string; spendCents: number }[]>((acc, m) => {
    if (!m.campaignId) return acc;
    const existing = acc.find(r => r.entityId === m.campaignId);
    if (existing) {
      existing.spendCents += m.spendCents;
    } else {
      acc.push({ entityId: m.campaignId, spendCents: m.spendCents });
    }
    return acc;
  }, []);

  // Build decision input
  const decisionInput = {
    $schema: 'decision-input-v1',
    analystOutput,
    guardrailConfig,
    lastActionLog: recentActionsForGuardrail,
  };

  // Step 5: Run Decision Engine agent
  console.log(`[workflow] Running agent-ads-decision...`);
  const decisionOutput = await bridgeTask('agent-ads-decision', decisionInput) as {
    workflowRunId: string;
    approved_actions: ActionSpec[];
    rejected_actions: unknown[];
    requires_human_approval: ActionSpec[];
    guardrailsApplied: unknown[];
  };

  // Step 6: Server-side guardrail double-check
  const { finalApproved, finalRejected, requiresHumanApproval } = verifyApprovedActions(
    decisionOutput.approved_actions ?? [],
    guardrailConfig,
    recentActionsForGuardrail,
    spendRecords,
  );

  console.log(`[workflow] Decision: ${finalApproved.length} approved, ${finalRejected.length} rejected, ${requiresHumanApproval.length} needs human`);

  // Store agent decision record
  const allRecommended = (analystOutput.campaignInsights as any[])
    ?.flatMap((ci: any) => ci.recommended_actions ?? []) ?? [];

  await repo.createAgentDecision({
    brandId,
    workflowRunId,
    agentId: 'agent-ads-decision',
    inputJson: analystOutput as object,
    approvedActions: finalApproved as object[],
    rejectedActions: ([...(decisionOutput.rejected_actions ?? []), ...finalRejected.map(r => r.action)] as object[]),
    humanQueue: ([...(decisionOutput.requires_human_approval ?? []), ...requiresHumanApproval.map(r => r.action)] as object[]),
    confidence: allRecommended.length > 0
      ? allRecommended.reduce((s: number, a: any) => s + (a.confidence ?? 0), 0) / allRecommended.length
      : 0,
    guardrailsApplied: (decisionOutput.guardrailsApplied ?? []) as object[],
  });

  // Step 7: Queue human approval items
  for (const item of [...(decisionOutput.requires_human_approval ?? []), ...requiresHumanApproval.map(r => r.action)]) {
    await repo.createActionLog({
      brandId,
      agentId: 'agent-ads-decision',
      workflowRunId,
      action: item.type,
      entityType: item.entityType,
      entityId: item.entityId,
      externalId: item.externalId,
      platform,
      reason: item.rationale ?? 'Requires human review',
      beforeState: item.params ?? {},
      status: ActionStatus.AWAITING_HUMAN,
    });
  }

  // Step 8: Execute approved actions
  if (finalApproved.length > 0) {
    console.log(`[workflow] Running agent-ads-executor for ${finalApproved.length} actions...`);
    await executeApprovedActions(finalApproved, brandId, adsAccountId, workflowRunId, platform);
  }

  // Step 9: Check for creative fatigue → trigger refresh workflow
  const fatigueActions = finalApproved.filter(a => a.type === 'FLAG_CREATIVE_FATIGUE');
  if (fatigueActions.length > 0) {
    console.log(`[workflow] ${fatigueActions.length} creative fatigue flags — triggering creative refresh`);
    await runCreativeRefreshWorkflow(brandId, adsAccountId, fatigueActions, workflowRunId, platform);
  }

  // Step 10: Run Reporter agent
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const updatedActionLog = await repo.getActionLogsByBrand(brandId, { workflowRunId });

  const reporterInput = {
    $schema: 'reporter-input-v1',
    workflowRunId,
    brandId,
    reportDate: today,
    actionLog: updatedActionLog,
    decisions: [decisionOutput],
    metricsYesterday: metrics.filter(m => m.dateKey === yesterday),
    metrics7dAgo: metrics,
  };

  console.log(`[workflow] Running agent-ads-reporter...`);
  const reporterOutput = await bridgeTask('agent-ads-reporter', reporterInput);
  console.log(`[workflow] Report generated for ${today}`);
  console.log(`[workflow] Daily optimization complete: ${workflowRunId}`);
}

// ─── Workflow 2: Creative Refresh ─────────────────────────────────────────────

export async function runCreativeRefreshWorkflow(
  brandId: string,
  adsAccountId: string,
  fatigueActions: ActionSpec[],
  workflowRunId: string,
  platform: AdsPlatform,
): Promise<void> {
  const creativeInput = {
    $schema: 'creative-input-v1',
    workflowRunId,
    brandId,
    triggerType: 'FATIGUE_REFRESH',
    clawbotBrief: {
      note: 'Awaiting Clawbot strategy input. Generate generic high-performing refresh variations.',
    },
    performanceFeedback: {
      fatigueSignals: fatigueActions.map(a => ({
        adSetId: a.entityId,
        externalId: a.externalId,
        frequencyScore: (a.params as any)?.frequencyScore,
        ctrDrop: (a.params as any)?.ctrDrop7d,
      })),
      topPerformingHooks: [],
      underperformingPatterns: ['Question headlines', 'Vague benefit claims'],
    },
    platform,
    adFormat: 'SINGLE_IMAGE',
    variationsRequested: 3,
  };

  console.log(`[creative-refresh] Running agent-ads-creative...`);
  const creativeOutput = await bridgeTask('agent-ads-creative', creativeInput);

  // Store as ActionLog entry awaiting human approval — creative ALWAYS gates on human review
  await repo.createActionLog({
    brandId,
    agentId: 'agent-ads-creative',
    workflowRunId,
    action: 'CREATIVE_REFRESH',
    entityType: 'adset',
    entityId: fatigueActions[0]?.entityId ?? 'unknown',
    externalId: fatigueActions[0]?.externalId,
    platform,
    reason: 'Creative fatigue detected — new variations generated for human review',
    beforeState: { fatigueActions },
    afterState: creativeOutput as object,
    status: ActionStatus.AWAITING_HUMAN,
  });

  console.log(`[creative-refresh] Creative variations queued for human approval`);
}

// ─── Stale approval queue check ───────────────────────────────────────────────

export async function checkStaleApprovalQueue(): Promise<void> {
  const staleItems = await repo.getStaleApprovalItems(8);
  if (staleItems.length === 0) return;
  console.warn(`[workflow] ${staleItems.length} approval items older than 8 hours — review needed in Bottech UI`);
}
