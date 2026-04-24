import { PrismaClient, AdsPlatform, CampaignStatus, ActionStatus, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

// ─── AdsAccount ───────────────────────────────────────────────────────────────

export async function createAdsAccount(data: {
  brandId: string;
  platform: AdsPlatform;
  accountId: string;
  accountName: string;
  encryptedCreds: string;
}) {
  return prisma.adsAccount.create({ data });
}

export async function getAdsAccount(id: string) {
  return prisma.adsAccount.findUnique({ where: { id }, include: { agentConfig: true } });
}

export async function getActiveAdsAccounts() {
  return prisma.adsAccount.findMany({
    where: { isActive: true },
    include: { agentConfig: true },
  });
}

export async function getAdsAccountsByBrand(brandId: string) {
  return prisma.adsAccount.findMany({
    where: { brandId },
    include: { agentConfig: true },
    orderBy: { createdAt: 'desc' },
  });
}

export async function updateAdsAccount(id: string, data: Partial<{
  accountName: string;
  encryptedCreds: string;
  isActive: boolean;
}>) {
  return prisma.adsAccount.update({ where: { id }, data });
}

// ─── AdsAgentConfig ───────────────────────────────────────────────────────────

export async function upsertAdsAgentConfig(adsAccountId: string, data: {
  manualApprovalMode?: boolean;
  confidenceThreshold?: number;
  maxDailyBudgetIncrPct?: number;
  minSpendThresholdCents?: number;
  cooldownHours?: number;
  allowedActions?: string[];
  blockedCampaignIds?: string[];
}) {
  const allowedActions = data.allowedActions ?? [
    'INCREASE_BUDGET', 'DECREASE_BUDGET', 'PAUSE_CAMPAIGN',
    'PAUSE_ADSET', 'FLAG_CREATIVE_FATIGUE', 'ADJUST_BID',
  ];
  return prisma.adsAgentConfig.upsert({
    where: { adsAccountId },
    create: {
      adsAccountId,
      manualApprovalMode: data.manualApprovalMode ?? false,
      confidenceThreshold: data.confidenceThreshold ?? 0.75,
      maxDailyBudgetIncrPct: data.maxDailyBudgetIncrPct ?? 20,
      minSpendThresholdCents: data.minSpendThresholdCents ?? 5000,
      cooldownHours: data.cooldownHours ?? 24,
      allowedActions,
      blockedCampaignIds: data.blockedCampaignIds ?? [],
    },
    update: {
      ...(data.manualApprovalMode !== undefined && { manualApprovalMode: data.manualApprovalMode }),
      ...(data.confidenceThreshold !== undefined && { confidenceThreshold: data.confidenceThreshold }),
      ...(data.maxDailyBudgetIncrPct !== undefined && { maxDailyBudgetIncrPct: data.maxDailyBudgetIncrPct }),
      ...(data.minSpendThresholdCents !== undefined && { minSpendThresholdCents: data.minSpendThresholdCents }),
      ...(data.cooldownHours !== undefined && { cooldownHours: data.cooldownHours }),
      ...(data.allowedActions !== undefined && { allowedActions: data.allowedActions }),
      ...(data.blockedCampaignIds !== undefined && { blockedCampaignIds: data.blockedCampaignIds }),
    },
  });
}

export async function getAdsAgentConfig(adsAccountId: string) {
  return prisma.adsAgentConfig.findUnique({ where: { adsAccountId } });
}

// ─── Campaign ─────────────────────────────────────────────────────────────────

export async function upsertCampaign(data: {
  adsAccountId: string;
  externalId: string;
  platform: AdsPlatform;
  name: string;
  status: CampaignStatus;
  objective?: string;
  dailyBudgetCents?: number;
}) {
  return prisma.campaign.upsert({
    where: { adsAccountId_externalId: { adsAccountId: data.adsAccountId, externalId: data.externalId } },
    create: data,
    update: {
      name: data.name,
      status: data.status,
      objective: data.objective,
      dailyBudgetCents: data.dailyBudgetCents,
    },
  });
}

export async function getCampaignsByBrand(brandId: string) {
  return prisma.campaign.findMany({
    where: { adsAccount: { brandId } },
    include: {
      metrics: {
        orderBy: { dateKey: 'desc' },
        take: 7,
      },
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getCampaignsByAccount(adsAccountId: string) {
  return prisma.campaign.findMany({ where: { adsAccountId } });
}

// ─── AdSet ────────────────────────────────────────────────────────────────────

export async function upsertAdSet(data: {
  campaignId: string;
  externalId: string;
  name: string;
  status: CampaignStatus;
  dailyBudgetCents?: number;
  targetingJson?: object;
}) {
  return prisma.adSet.upsert({
    where: { campaignId_externalId: { campaignId: data.campaignId, externalId: data.externalId } },
    create: data,
    update: {
      name: data.name,
      status: data.status,
      dailyBudgetCents: data.dailyBudgetCents,
      targetingJson: data.targetingJson as Prisma.InputJsonValue,
    },
  });
}

// ─── PerformanceMetric ────────────────────────────────────────────────────────

export async function upsertPerformanceMetric(data: {
  campaignId?: string;
  adSetId?: string;
  adId?: string;
  platform: AdsPlatform;
  dateKey: string;
  impressions: number;
  clicks: number;
  spendCents: number;
  conversions: number;
  conversionValueCents: number;
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
  frequencyScore?: number;
  rawJson?: object;
}) {
  const where = data.campaignId
    ? { campaignId_dateKey: { campaignId: data.campaignId, dateKey: data.dateKey } }
    : undefined;

  if (!where) {
    return prisma.performanceMetric.create({ data: data as any });
  }

  return prisma.performanceMetric.upsert({
    where,
    create: data as any,
    update: {
      impressions: data.impressions,
      clicks: data.clicks,
      spendCents: data.spendCents,
      conversions: data.conversions,
      conversionValueCents: data.conversionValueCents,
      ctr: data.ctr,
      cpc: data.cpc,
      cpa: data.cpa,
      roas: data.roas,
      frequencyScore: data.frequencyScore,
      rawJson: data.rawJson as Prisma.InputJsonValue,
      fetchedAt: new Date(),
    },
  });
}

export async function getMetricsByCampaign(campaignId: string, days = 7) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const dateKey = since.toISOString().slice(0, 10);

  return prisma.performanceMetric.findMany({
    where: { campaignId, dateKey: { gte: dateKey } },
    orderBy: { dateKey: 'asc' },
  });
}

export async function getMetricsByAccount(adsAccountId: string, lookbackDays = 7) {
  const since = new Date();
  since.setDate(since.getDate() - lookbackDays);
  const dateKey = since.toISOString().slice(0, 10);

  const campaigns = await prisma.campaign.findMany({ where: { adsAccountId }, select: { id: true } });
  const ids = campaigns.map(c => c.id);

  return prisma.performanceMetric.findMany({
    where: { campaignId: { in: ids }, dateKey: { gte: dateKey } },
    orderBy: [{ campaignId: 'asc' }, { dateKey: 'asc' }],
  });
}

// ─── ActionLog ────────────────────────────────────────────────────────────────

export async function createActionLog(data: {
  brandId: string;
  agentId: string;
  workflowRunId?: string;
  action: string;
  entityType: string;
  entityId: string;
  externalId?: string;
  platform: AdsPlatform;
  reason: string;
  beforeState: object;
  afterState?: object;
  status?: ActionStatus;
}) {
  return prisma.actionLog.create({ data: data as any });
}

export async function updateActionLogStatus(id: string, data: {
  status: ActionStatus;
  afterState?: object;
  errorMessage?: string;
  executedAt?: Date;
}) {
  return prisma.actionLog.update({ where: { id }, data: data as any });
}

export async function getActionLogsByBrand(brandId: string, opts: {
  limit?: number;
  platform?: AdsPlatform;
  status?: ActionStatus;
  workflowRunId?: string;
} = {}) {
  return prisma.actionLog.findMany({
    where: {
      brandId,
      ...(opts.platform && { platform: opts.platform }),
      ...(opts.status && { status: opts.status }),
      ...(opts.workflowRunId && { workflowRunId: opts.workflowRunId }),
    },
    orderBy: { createdAt: 'desc' },
    take: opts.limit ?? 100,
  });
}

export async function getRecentActionsByEntity(entityId: string, hours = 48) {
  const since = new Date(Date.now() - hours * 3600_000);
  return prisma.actionLog.findMany({
    where: { entityId, createdAt: { gte: since }, status: ActionStatus.EXECUTED },
    orderBy: { executedAt: 'desc' },
  });
}

export async function getHumanApprovalQueue(brandId: string) {
  return prisma.actionLog.findMany({
    where: { brandId, status: ActionStatus.AWAITING_HUMAN },
    orderBy: { createdAt: 'asc' },
  });
}

export async function getStaleApprovalItems(olderThanHours = 8) {
  const cutoff = new Date(Date.now() - olderThanHours * 3600_000);
  return prisma.actionLog.findMany({
    where: { status: ActionStatus.AWAITING_HUMAN, createdAt: { lt: cutoff } },
  });
}

// ─── AgentDecision ────────────────────────────────────────────────────────────

export async function createAgentDecision(data: {
  brandId: string;
  campaignId?: string;
  workflowRunId: string;
  agentId: string;
  inputJson: object;
  approvedActions: object[];
  rejectedActions: object[];
  humanQueue: object[];
  confidence: number;
  guardrailsApplied: object[];
}) {
  return prisma.agentDecision.create({ data: data as any });
}

export async function getWorkflowRuns(brandId: string, limit = 20) {
  // Aggregate workflow runs from action logs
  const logs = await prisma.actionLog.findMany({
    where: { brandId, workflowRunId: { not: null } },
    select: {
      workflowRunId: true,
      status: true,
      createdAt: true,
      executedAt: true,
    },
    orderBy: { createdAt: 'desc' },
    distinct: ['workflowRunId'],
    take: limit,
  });

  return logs.map(l => ({ workflowRunId: l.workflowRunId, createdAt: l.createdAt }));
}
