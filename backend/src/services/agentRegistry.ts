// agentRegistry.ts
// Defines the 11 marketing agents, their default configuration, and the
// canonical `runAgent()` that every call site should use. Config is per
// (brandId, agentKey) and persisted in AgentConfig — so changing the model
// in the UI actually changes which LLM API the agent calls.

import { Prisma } from '@prisma/client';
import prisma from '../database/prismaClient';
import { callLLM, LLMMessage, LLMResponse } from './llmRouter';
import { calcCostUsd, getModelSpec } from '../config/modelCatalog';

export type AgentLayer =
  | 'strategic'
  | 'intelligence'
  | 'decision'
  | 'execution'
  | 'control';

export type AgentKey =
  | 'clawbot'
  | 'analyst'
  | 'creative'
  | 'reporter'
  | 'audience'
  | 'competitor'
  | 'research'
  | 'attribution'
  | 'decision'
  | 'guardrails'
  | 'budget'
  | 'metaExecutor'
  | 'googleExecutor'
  | 'tiktokExecutor'
  | 'emailExecutor'
  | 'orchestrator'
  | 'syncAgent'
  | 'costTracker';

export interface AgentDefinition {
  key: AgentKey;
  name: string;
  layer: AgentLayer;
  description: string;
  defaultModel: string;
  defaultSystemPrompt: string;
  defaultTemperature: number;
  defaultMaxTokens: number;
  /** If false, agent is deterministic/orchestration only — no LLM calls. */
  usesLLM: boolean;
}

export const AGENT_DEFINITIONS: Record<AgentKey, AgentDefinition> = {
  clawbot: {
    key: 'clawbot',
    name: 'Clawbot',
    layer: 'strategic',
    description:
      'Master brand-strategy orchestrator. Produces full marketing strategies and campaign briefs from raw brand data.',
    defaultModel: 'claude-sonnet-4-6',
    defaultSystemPrompt: `You are Clawbot — the world's most advanced brand marketing strategy AI.
You analyse brand data and produce precise, data-driven marketing strategies.
Your output is always valid JSON. No markdown fences, no commentary outside JSON.`,
    defaultTemperature: 0.7,
    defaultMaxTokens: 3000,
    usesLLM: true,
  },
  analyst: {
    key: 'analyst',
    name: 'Analyst',
    layer: 'intelligence',
    description:
      'Reads campaign performance, classifies winners/losers/fatigue, surfaces signals for the decision layer.',
    defaultModel: 'claude-sonnet-4-6',
    defaultSystemPrompt: `You are the Ads Analyst. Given campaign performance JSON, classify each campaign as WINNER / LOSER / FATIGUE / NEUTRAL / NEW using ROAS, CTR, frequency, and spend. Output strict JSON.`,
    defaultTemperature: 0.2,
    defaultMaxTokens: 2000,
    usesLLM: true,
  },
  creative: {
    key: 'creative',
    name: 'Creative',
    layer: 'intelligence',
    description:
      'Generates ad copy variants, headlines, descriptions. Flags creative fatigue and suggests refreshes.',
    defaultModel: 'claude-sonnet-4-6',
    defaultSystemPrompt: `You are the Creative Agent. Produce high-converting ad copy variants: primary texts, headlines, descriptions. Match the brand voice and the target audience. Output strict JSON.`,
    defaultTemperature: 0.9,
    defaultMaxTokens: 2000,
    usesLLM: true,
  },
  reporter: {
    key: 'reporter',
    name: 'Reporter',
    layer: 'intelligence',
    description:
      'Synthesises performance into executive-ready reports with clear narrative and recommendations.',
    defaultModel: 'claude-haiku-4-5',
    defaultSystemPrompt: `You are the Reporter. Synthesise ads performance data into a concise executive report. Lead with the insight. Output plaintext or Markdown as requested.`,
    defaultTemperature: 0.4,
    defaultMaxTokens: 1500,
    usesLLM: true,
  },
  audience: {
    key: 'audience',
    name: 'Audience Agent',
    layer: 'intelligence',
    description:
      'Discovers audience segments, builds lookalikes, and recommends targeting parameters from first-party data and intent signals.',
    defaultModel: 'claude-sonnet-4-6',
    defaultSystemPrompt: `You are the Audience Agent. Given brand data, customer records, and performance signals, identify high-value audience segments, lookalike seeds, and negative audiences. Output strict JSON with segments[], lookalikes[], exclusions[], and a rationale per segment.`,
    defaultTemperature: 0.4,
    defaultMaxTokens: 2000,
    usesLLM: true,
  },
  competitor: {
    key: 'competitor',
    name: 'Competitor Agent',
    layer: 'intelligence',
    description:
      'Tracks competitor ads, positioning, pricing and creative angles. Surfaces competitive moves worth reacting to.',
    defaultModel: 'sonar-large',
    defaultSystemPrompt: `You are the Competitor Agent. Given a brand and a competitor set, gather current ad creatives, landing pages, offers, and pricing. Output strict JSON with per-competitor snapshots and a "threats" and "opportunities" list.`,
    defaultTemperature: 0.3,
    defaultMaxTokens: 2500,
    usesLLM: true,
  },
  research: {
    key: 'research',
    name: 'Research Agent',
    layer: 'intelligence',
    description:
      'Live market, category and trend research via web search. Grounded outputs with citations.',
    defaultModel: 'sonar-large',
    defaultSystemPrompt: `You are the Research Agent. Perform up-to-date market and category research using web search. Always cite sources. Output a concise structured briefing with keyFindings[], dataPoints[] (with URL citations), and actionableImplications[].`,
    defaultTemperature: 0.3,
    defaultMaxTokens: 2500,
    usesLLM: true,
  },
  attribution: {
    key: 'attribution',
    name: 'Attribution Agent',
    layer: 'intelligence',
    description:
      'Multi-touch attribution and LTV modelling across channels. Reconciles platform-reported and first-party data.',
    defaultModel: 'claude-sonnet-4-6',
    defaultSystemPrompt: `You are the Attribution Agent. Given order data, UTMs, and platform-reported conversions, produce a channel attribution view (first-touch, last-touch, linear, data-driven). Flag discrepancies between platform ROAS and actual revenue. Output strict JSON.`,
    defaultTemperature: 0.2,
    defaultMaxTokens: 2500,
    usesLLM: true,
  },
  decision: {
    key: 'decision',
    name: 'Decision Agent',
    layer: 'decision',
    description:
      'Proposes specific actions (scale / pause / budget-shift / creative-refresh) from analyst signals.',
    defaultModel: 'claude-sonnet-4-6',
    defaultSystemPrompt: `You are the Decision Agent. Given analyst signals and guardrails, propose one concrete action per campaign with an expected impact. All actions are proposals — humans approve. Output strict JSON.`,
    defaultTemperature: 0.3,
    defaultMaxTokens: 1500,
    usesLLM: true,
  },
  guardrails: {
    key: 'guardrails',
    name: 'Guardrails',
    layer: 'decision',
    description:
      'Rule-based gate. Rejects proposals that exceed daily-spend caps, ROAS floors, or brand-safety rules.',
    defaultModel: 'claude-haiku-4-5',
    defaultSystemPrompt: `You are the Guardrails agent. Validate a proposed action against brand policy. Return {approved: boolean, reason: string}. Be strict — err on the side of blocking.`,
    defaultTemperature: 0.1,
    defaultMaxTokens: 500,
    usesLLM: true,
  },
  budget: {
    key: 'budget',
    name: 'Budget Agent',
    layer: 'decision',
    description:
      'Allocates and reallocates spend across campaigns and channels using performance + pacing signals.',
    defaultModel: 'claude-sonnet-4-6',
    defaultSystemPrompt: `You are the Budget Agent. Given current spend, performance, pacing, and targets, propose budget reallocations. Maximise expected ROAS subject to pacing and minimum-spend constraints. Output strict JSON with moves[]: [{fromCampaignId, toCampaignId, amountUsd, rationale, expectedDeltaROAS}].`,
    defaultTemperature: 0.2,
    defaultMaxTokens: 1500,
    usesLLM: true,
  },
  metaExecutor: {
    key: 'metaExecutor',
    name: 'Meta Executor',
    layer: 'execution',
    description:
      'Turns approved decisions into Meta Marketing API calls. Never auto-runs — waits for human approval.',
    defaultModel: 'claude-haiku-4-5',
    defaultSystemPrompt: `You are the Meta Executor. Given an approved action, generate the exact Meta Marketing API payload. Only output the payload — no narration.`,
    defaultTemperature: 0.0,
    defaultMaxTokens: 1000,
    usesLLM: true,
  },
  googleExecutor: {
    key: 'googleExecutor',
    name: 'Google Executor',
    layer: 'execution',
    description:
      'Turns approved decisions into Google Ads API calls. Human approval required.',
    defaultModel: 'claude-haiku-4-5',
    defaultSystemPrompt: `You are the Google Executor. Given an approved action, generate the exact Google Ads API payload. Only output the payload — no narration.`,
    defaultTemperature: 0.0,
    defaultMaxTokens: 1000,
    usesLLM: true,
  },
  tiktokExecutor: {
    key: 'tiktokExecutor',
    name: 'TikTok Executor',
    layer: 'execution',
    description:
      'Turns approved decisions into TikTok Ads API calls. Human approval required.',
    defaultModel: 'claude-haiku-4-5',
    defaultSystemPrompt: `You are the TikTok Executor. Given an approved action, generate the exact TikTok Ads API payload. Only output the payload — no narration.`,
    defaultTemperature: 0.0,
    defaultMaxTokens: 1000,
    usesLLM: true,
  },
  emailExecutor: {
    key: 'emailExecutor',
    name: 'Email Executor',
    layer: 'execution',
    description:
      'Drafts and schedules email campaigns (subject lines, body, preview text) for ESP delivery. Human approval required before send.',
    defaultModel: 'claude-sonnet-4-6',
    defaultSystemPrompt: `You are the Email Executor. Given a campaign brief and audience segment, produce an email with subjectLine, previewText, htmlBody, plainTextBody, and suggested sendTime. Match the brand voice. Output strict JSON.`,
    defaultTemperature: 0.7,
    defaultMaxTokens: 2500,
    usesLLM: true,
  },
  orchestrator: {
    key: 'orchestrator',
    name: 'Orchestrator',
    layer: 'control',
    description:
      'Routes messages across agents. Deterministic — does not call an LLM.',
    defaultModel: 'claude-haiku-4-5',
    defaultSystemPrompt: '',
    defaultTemperature: 0.0,
    defaultMaxTokens: 500,
    usesLLM: false,
  },
  syncAgent: {
    key: 'syncAgent',
    name: 'Sync Agent',
    layer: 'control',
    description:
      'Pulls performance data from ad platforms on schedule. Deterministic.',
    defaultModel: 'claude-haiku-4-5',
    defaultSystemPrompt: '',
    defaultTemperature: 0.0,
    defaultMaxTokens: 500,
    usesLLM: false,
  },
  costTracker: {
    key: 'costTracker',
    name: 'Cost Tracker',
    layer: 'control',
    description:
      'Aggregates LLM spend across providers. Deterministic — reads api_cost_logs.',
    defaultModel: 'claude-haiku-4-5',
    defaultSystemPrompt: '',
    defaultTemperature: 0.0,
    defaultMaxTokens: 500,
    usesLLM: false,
  },
};

export interface ResolvedAgentConfig {
  agentKey: AgentKey;
  brandId: string;
  model: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  enabled: boolean;
  isOverride: boolean; // true if a row exists in agent_configs
  settings: Record<string, unknown>;
}

/**
 * Load the agent config for a brand, merging DB overrides on top of defaults.
 */
export async function getAgentConfig(
  brandId: string,
  agentKey: AgentKey,
): Promise<ResolvedAgentConfig> {
  const def = AGENT_DEFINITIONS[agentKey];
  if (!def) throw new Error(`Unknown agent key: ${agentKey}`);

  const row = await prisma.agentConfig.findUnique({
    where: { brandId_agentKey: { brandId, agentKey } },
  });

  return {
    agentKey,
    brandId,
    model: row?.model ?? def.defaultModel,
    systemPrompt: row?.systemPrompt ?? def.defaultSystemPrompt,
    temperature: row?.temperature ?? def.defaultTemperature,
    maxTokens: row?.maxTokens ?? def.defaultMaxTokens,
    enabled: row?.enabled ?? true,
    isOverride: !!row,
    settings:
      (row?.settings as Record<string, unknown> | null) ?? {},
  };
}

/**
 * List all agent configs for a brand, with defaults merged for any
 * agents that don't yet have an override row.
 */
export async function listAgentConfigs(brandId: string): Promise<ResolvedAgentConfig[]> {
  const out: ResolvedAgentConfig[] = [];
  for (const key of Object.keys(AGENT_DEFINITIONS) as AgentKey[]) {
    out.push(await getAgentConfig(brandId, key));
  }
  return out;
}

/**
 * Upsert an override for a single (brand, agent).
 */
export async function saveAgentConfig(
  brandId: string,
  agentKey: AgentKey,
  patch: Partial<{
    model: string;
    systemPrompt: string;
    temperature: number;
    maxTokens: number;
    enabled: boolean;
    settings: Record<string, unknown>;
  }>,
): Promise<ResolvedAgentConfig> {
  const def = AGENT_DEFINITIONS[agentKey];
  if (!def) throw new Error(`Unknown agent key: ${agentKey}`);

  // Validate model is in catalog.
  const modelId = patch.model ?? def.defaultModel;
  if (!getModelSpec(modelId)) {
    throw new Error(`Model "${modelId}" is not in the catalog.`);
  }

  await prisma.agentConfig.upsert({
    where: { brandId_agentKey: { brandId, agentKey } },
    create: {
      brandId,
      agentKey,
      model: modelId,
      systemPrompt: patch.systemPrompt ?? def.defaultSystemPrompt,
      temperature: patch.temperature ?? def.defaultTemperature,
      maxTokens: patch.maxTokens ?? def.defaultMaxTokens,
      enabled: patch.enabled ?? true,
      settings: (patch.settings ?? {}) as Prisma.InputJsonValue,
    },
    update: {
      ...(patch.model !== undefined ? { model: patch.model } : {}),
      ...(patch.systemPrompt !== undefined ? { systemPrompt: patch.systemPrompt } : {}),
      ...(patch.temperature !== undefined ? { temperature: patch.temperature } : {}),
      ...(patch.maxTokens !== undefined ? { maxTokens: patch.maxTokens } : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
      ...(patch.settings !== undefined
        ? { settings: patch.settings as Prisma.InputJsonValue }
        : {}),
    },
  });

  return getAgentConfig(brandId, agentKey);
}

/**
 * Reset an agent to defaults by deleting its override row.
 */
export async function resetAgentConfig(
  brandId: string,
  agentKey: AgentKey,
): Promise<ResolvedAgentConfig> {
  await prisma.agentConfig
    .delete({ where: { brandId_agentKey: { brandId, agentKey } } })
    .catch(() => {}); // no-op if missing
  return getAgentConfig(brandId, agentKey);
}

/**
 * PRIMARY entry point for any agent call site. Loads the live config,
 * routes to the selected provider, logs cost, returns the response.
 *
 * USE THIS INSTEAD OF callClaude() — the "selected model" only becomes
 * real when every call goes through here.
 */
export async function runAgent(params: {
  brandId: string;
  agentKey: AgentKey;
  userMessage: string;
  operation?: string;
  history?: LLMMessage[];
  /** Runtime override of system prompt — rare. */
  systemPromptOverride?: string;
}): Promise<{ response: LLMResponse; costUsd: number; config: ResolvedAgentConfig }> {
  const config = await getAgentConfig(params.brandId, params.agentKey);
  const def = AGENT_DEFINITIONS[params.agentKey];

  if (!def.usesLLM) {
    throw new Error(`Agent ${params.agentKey} does not use an LLM (control-layer only).`);
  }
  if (!config.enabled) {
    throw new Error(`Agent ${params.agentKey} is disabled for brand ${params.brandId}.`);
  }

  const messages: LLMMessage[] = [
    ...(params.history ?? []),
    { role: 'user', content: params.userMessage },
  ];

  const response = await callLLM({
    modelId: config.model,
    systemPrompt: params.systemPromptOverride ?? config.systemPrompt,
    messages,
    temperature: config.temperature,
    maxTokens: config.maxTokens,
  });

  const costUsd = calcCostUsd(
    response.modelId,
    response.inputTokens,
    response.outputTokens,
  );

  await prisma.apiCostLog.create({
    data: {
      brandId: params.brandId,
      provider: response.provider,
      model: response.modelId,
      operation: params.operation ?? `${params.agentKey}:run`,
      inputTokens: response.inputTokens,
      outputTokens: response.outputTokens,
      costUsd,
      metadata: {
        agentKey: params.agentKey,
        providerModelId: response.providerModelId,
      } as Prisma.InputJsonValue,
    },
  });

  return { response, costUsd, config };
}
