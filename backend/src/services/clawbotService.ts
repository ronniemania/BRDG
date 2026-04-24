// clawbotService.ts
// CLAWBOT — Master Brand Strategy & Marketing Orchestrator
//
// Layer: STRATEGIC INTELLIGENCE (sits above Intelligence→Decision→Execution)
// Role:  Takes raw brand data, produces a complete marketing strategy,
//        then orchestrates all downstream agents via structured briefs.
//
// Clawbot never directly executes — it outputs briefs and strategies
// that feed into the Ads Analyst → Decision → Executor pipeline.

import https from 'https';
import { Prisma } from '@prisma/client';
import prisma from '../database/prismaClient';
import { runAgent } from './agentRegistry';

// ─── Cost rates (USD per 1M tokens) ──────────────────────────────────────────

const COST_RATES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6':   { input: 3.00,  output: 15.00  },
  'claude-opus-4-6':     { input: 15.00, output: 75.00  },
  'claude-haiku-4-5':    { input: 0.25,  output: 1.25   },
  'gpt-4o':              { input: 2.50,  output: 10.00  },
  'gpt-4o-mini':         { input: 0.15,  output: 0.60   },
  'gpt-3.5-turbo':       { input: 0.50,  output: 1.50   },
  'llama-3.1-sonar-large': { input: 1.00, output: 1.00  },
};

function calcCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = COST_RATES[model] ?? { input: 3.00, output: 15.00 };
  return (inputTokens / 1_000_000) * rates.input + (outputTokens / 1_000_000) * rates.output;
}

// ─── Claude API call ─────────────────────────────────────────────────────────

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

function callClaude(
  model: string,
  systemPrompt: string,
  messages: ClaudeMessage[],
  maxTokens = 4096,
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) { reject(new Error('ANTHROPIC_API_KEY not configured')); return; }

    const body = JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
    });

    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(raw);
            if (parsed.error) { reject(new Error(parsed.error.message)); return; }
            resolve({
              content: parsed.content?.[0]?.text ?? '',
              inputTokens: parsed.usage?.input_tokens ?? 0,
              outputTokens: parsed.usage?.output_tokens ?? 0,
            });
          } catch (e) { reject(e); }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Cost logging ─────────────────────────────────────────────────────────────

export async function logApiCost(params: {
  brandId?: string;
  provider: 'anthropic' | 'openai' | 'perplexity';
  model: string;
  operation: string;
  inputTokens: number;
  outputTokens: number;
  metadata?: Record<string, unknown>;
}) {
  const costUsd = calcCost(params.model, params.inputTokens, params.outputTokens);
  await prisma.apiCostLog.create({
    data: {
      brandId: params.brandId ?? null,
      provider: params.provider,
      model: params.model,
      operation: params.operation,
      inputTokens: params.inputTokens,
      outputTokens: params.outputTokens,
      costUsd,
      metadata: (params.metadata ?? {}) as Prisma.InputJsonValue,
    },
  });
  return costUsd;
}

export async function getCostSummary(brandId?: string, days = 30) {
  const since = new Date(Date.now() - days * 86400 * 1000);
  const where = { createdAt: { gte: since }, ...(brandId ? { brandId } : {}) };

  const [rows, byProvider, byOperation] = await Promise.all([
    prisma.apiCostLog.aggregate({ where, _sum: { costUsd: true, inputTokens: true, outputTokens: true }, _count: true }),
    prisma.apiCostLog.groupBy({ by: ['provider', 'model'], where, _sum: { costUsd: true }, orderBy: { _sum: { costUsd: 'desc' } } }),
    prisma.apiCostLog.groupBy({ by: ['operation'], where, _sum: { costUsd: true }, _count: true, orderBy: { _sum: { costUsd: 'desc' } } }),
  ]);

  return {
    totalCostUsd: Number(rows._sum.costUsd ?? 0),
    totalCalls: rows._count,
    totalInputTokens: rows._sum.inputTokens ?? 0,
    totalOutputTokens: rows._sum.outputTokens ?? 0,
    byProvider: byProvider.map(r => ({ provider: r.provider, model: r.model, costUsd: Number(r._sum.costUsd ?? 0) })),
    byOperation: byOperation.map(r => ({ operation: r.operation, costUsd: Number(r._sum.costUsd ?? 0), calls: r._count })),
    periodDays: days,
  };
}

// ─── Brand data ingestion ────────────────────────────────────────────────────

export interface BrandDataInput {
  // Core brand profile
  brandName: string;
  industry: string;
  productOrService: string;
  pricePoint: string; // 'budget' | 'mid' | 'premium' | 'luxury'
  monthlyRevenue?: number;
  currentMonthlyAdSpend?: number;

  // Market & audience
  primaryMarket: string;
  targetAgeRange?: string;
  targetGender?: string;
  audienceInterests?: string;
  topCompetitors?: string;

  // Goals
  primaryGoal: string; // 'sales' | 'leads' | 'awareness' | 'retention'
  targetROAS?: number;
  targetCPA?: number;
  growthTarget?: string; // e.g. '30% MoM'

  // Current state
  topSellingProducts?: string;
  seasonality?: string;
  uniqueValueProp?: string;
  currentChallenges?: string;
}

// ─── Core functions ───────────────────────────────────────────────────────────

const MODEL = 'claude-sonnet-4-6';

export async function generateBrandStrategy(
  brandId: string,
  input: BrandDataInput,
): Promise<{ strategy: Record<string, unknown>; costUsd: number }> {
  const systemPrompt = `You are Clawbot — the world's most advanced brand marketing strategy AI.
You analyse brand data and produce precise, data-driven marketing strategies.
Your output is always valid JSON. No markdown fences, no commentary outside JSON.`;

  const userMessage = `Generate a comprehensive marketing strategy for this brand:

${JSON.stringify(input, null, 2)}

Return a JSON object with exactly these keys:
{
  "title": "strategy title",
  "objective": "primary marketing objective (2-3 sentences)",
  "targetAudience": {
    "primaryPersona": "name and 1-sentence description",
    "ageRange": "e.g. 25-40",
    "segments": ["segment1", "segment2", "segment3"],
    "interests": ["interest1", "interest2"],
    "painPoints": ["pain1", "pain2"]
  },
  "budgetRec": {
    "total": <monthly budget in USD>,
    "metaPct": <0-100>,
    "googlePct": <0-100>,
    "rationale": "why this split"
  },
  "channels": {
    "primary": "Meta|Google|Both",
    "secondary": ["email", "influencer", "..."],
    "rationale": "why these channels"
  },
  "keyMessages": ["message1", "message2", "message3"],
  "kpis": {
    "primary": "ROAS|CPA|CPL|etc",
    "targets": { "ROAS": "3.5x", "CPA": "$45", "CTR": "1.2%" }
  },
  "campaignIdeas": [
    {
      "name": "campaign name",
      "objective": "CONVERSIONS|AWARENESS|RETARGETING",
      "platform": "META|GOOGLE",
      "estimatedBudget": <USD/month>,
      "audience": "audience description",
      "creativeDirection": "brief creative direction",
      "expectedROAS": 3.5
    }
  ],
  "quickWins": ["quick win 1", "quick win 2", "quick win 3"],
  "risks": ["risk1", "risk2"]
}`;

  // Route through the agent registry — respects the model/prompt/temp that
  // the user chose for the Clawbot agent in the Agent Ecosystem UI.
  const { response, costUsd } = await runAgent({
    brandId,
    agentKey: 'clawbot',
    userMessage,
    operation: 'clawbot:brand-strategy',
    systemPromptOverride: systemPrompt,
  });

  let strategy: Record<string, unknown>;
  try {
    strategy = JSON.parse(response.content);
  } catch {
    const match = response.content.match(/\{[\s\S]*\}/);
    strategy = match ? JSON.parse(match[0]) : { raw: response.content };
  }

  // Persist to DB
  await prisma.brandStrategy.create({
    data: {
      brandId,
      title: (strategy.title as string) ?? 'Strategy',
      objective: (strategy.objective as string) ?? '',
      targetAudience: (strategy.targetAudience ?? {}) as Prisma.InputJsonValue,
      budgetRec: (strategy.budgetRec ?? {}) as Prisma.InputJsonValue,
      channels: (strategy.channels ?? {}) as Prisma.InputJsonValue,
      keyMessages: (strategy.keyMessages ?? []) as Prisma.InputJsonValue,
      kpis: (strategy.kpis ?? {}) as Prisma.InputJsonValue,
      rawInput: input as unknown as Prisma.InputJsonValue,
    },
  });

  return { strategy, costUsd };
}

export async function generateCampaignBrief(
  brandId: string,
  strategyId: string,
  campaignIdea: Record<string, unknown>,
): Promise<{ brief: Record<string, unknown>; costUsd: number }> {
  const systemPrompt = `You are Clawbot — producing a precise campaign brief for the Ads team.
Output ONLY valid JSON, no other text.`;

  const userMessage = `Expand this campaign idea into a detailed brief ready for the Ads Analyst agent:

${JSON.stringify(campaignIdea, null, 2)}

Return JSON with:
{
  "name": "campaign name",
  "platform": "META|GOOGLE",
  "objective": "campaign objective",
  "targetAudience": {
    "description": "...",
    "demographics": "...",
    "interests": ["..."],
    "behaviors": ["..."],
    "excludes": ["..."]
  },
  "creativeDirection": {
    "headline": "primary headline",
    "primaryText": "main ad copy (125 chars for Meta)",
    "description": "description (30 chars for Meta)",
    "tone": "tone keyword",
    "hooks": ["hook1", "hook2"],
    "cta": "Shop Now|Learn More|Sign Up|Get Quote"
  },
  "budget": <monthly USD>,
  "kpis": { "primary": "ROAS|CPA", "target": "3.5x|$40" },
  "agentInstructions": {
    "analyst": "what the analyst should focus on",
    "creative": "creative refresh triggers to watch",
    "decision": "approval thresholds for this campaign"
  }
}`;

  // Route campaign-brief generation through the agent registry too — uses
  // the Clawbot agent config (same brand-configurable model).
  const { response, costUsd } = await runAgent({
    brandId,
    agentKey: 'clawbot',
    userMessage,
    operation: 'clawbot:campaign-brief',
    systemPromptOverride: systemPrompt,
  });

  let brief: Record<string, unknown>;
  try {
    brief = JSON.parse(response.content);
  } catch {
    const match = response.content.match(/\{[\s\S]*\}/);
    brief = match ? JSON.parse(match[0]) : { raw: response.content };
  }

  // Persist campaign brief
  const audience = (brief.targetAudience ?? {}) as Record<string, unknown>;
  const creative = (brief.creativeDirection ?? {}) as Record<string, unknown>;
  await prisma.campaignBrief.create({
    data: {
      brandId,
      strategyId,
      name: (brief.name as string) ?? 'Campaign',
      platform: ((brief.platform as string) ?? 'META') as 'META' | 'GOOGLE',
      objective: (brief.objective as string) ?? '',
      budget: Number(brief.budget ?? 0),
      targetAudience: audience as Prisma.InputJsonValue,
      creativeDirection: creative as Prisma.InputJsonValue,
    },
  });

  return { brief, costUsd };
}

export async function getAgentStatus(brandId: string): Promise<Record<string, unknown>> {
  const [adsAccounts, recentActions, pendingApprovals, strategies] = await Promise.all([
    prisma.adsAccount.findMany({ where: { brandId }, include: { campaigns: { take: 20 } } }),
    prisma.actionLog.findMany({ where: { brandId }, orderBy: { createdAt: 'desc' }, take: 5 }),
    prisma.actionLog.count({ where: { brandId, status: 'AWAITING_HUMAN' } }),
    prisma.brandStrategy.findMany({ where: { brandId }, orderBy: { createdAt: 'desc' }, take: 1 }),
  ]);

  const allCampaigns = adsAccounts.flatMap(a => a.campaigns);
  // Score campaigns using status as simple proxy (no metrics at this level)
  const campaignScores = { total: allCampaigns.length, active: allCampaigns.filter(c => c.status === 'ACTIVE').length };

  return {
    agents: {
      clawbot:    { status: 'ACTIVE', layer: 'Strategic', description: 'Master brand strategy orchestrator' },
      analyst:    { status: 'ACTIVE', layer: 'Intelligence', description: 'Campaign performance analyser' },
      creative:   { status: 'ACTIVE', layer: 'Intelligence', description: 'Ad copy & creative strategist' },
      reporter:   { status: 'ACTIVE', layer: 'Intelligence', description: 'Performance reporting' },
      decision:   { status: 'ACTIVE', layer: 'Decision', description: 'Guardrail enforcer & approval gate' },
      guardrails: { status: 'ACTIVE', layer: 'Decision', description: 'Rule-based safety checks' },
      metaExecutor:   { status: pendingApprovals > 0 ? 'AWAITING' : 'READY', layer: 'Execution', description: 'Meta Ads API executor' },
      googleExecutor: { status: 'READY', layer: 'Execution', description: 'Google Ads API executor' },
      orchestrator:   { status: 'ACTIVE', layer: 'Control', description: 'Workflow routing & coordination' },
      syncAgent:      { status: 'ACTIVE', layer: 'Data', description: 'Data source synchronisation' },
      costTracker:    { status: 'ACTIVE', layer: 'Observability', description: 'API cost & token monitoring' },
    },
    performance: {
      totalCampaigns: campaignScores.total,
      activeCampaigns: campaignScores.active,
    },
    pendingApprovals,
    recentActions: recentActions.map(a => ({
      id: a.id,
      action: a.action,
      status: a.status,
      createdAt: a.createdAt,
    })),
    latestStrategy: strategies[0] ?? null,
  };
}
