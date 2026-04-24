// agents.ts — Agent ecosystem routes.
// - GET  /api/agents/catalog                 list of agent definitions + model catalog
// - GET  /api/agents/:brandId/configs        resolved configs for all 11 agents
// - PUT  /api/agents/:brandId/:agentKey      upsert agent override
// - DELETE /api/agents/:brandId/:agentKey    reset to defaults
// - POST /api/agents/:brandId/:agentKey/test run the agent once with user input
// - GET  /api/agents/:brandId/:agentKey/costs recent cost rows for this agent

import { Express, Request, Response } from 'express';
import prisma from '../database/prismaClient';
import {
  AGENT_DEFINITIONS,
  AgentKey,
  getAgentConfig,
  listAgentConfigs,
  saveAgentConfig,
  resetAgentConfig,
  runAgent,
} from '../services/agentRegistry';
import {
  MODEL_CATALOG,
  getCatalogWithAvailability,
} from '../config/modelCatalog';

function asAgentKey(k: string): AgentKey | null {
  return (Object.keys(AGENT_DEFINITIONS) as AgentKey[]).includes(k as AgentKey)
    ? (k as AgentKey)
    : null;
}

export function setupAgentRoutes(app: Express) {
  // ── GET /api/agents/catalog ─────────────────────────────────────────────────
  app.get('/api/agents/catalog', (_req: Request, res: Response) => {
    res.json({
      agents: Object.values(AGENT_DEFINITIONS),
      models: getCatalogWithAvailability(),
      providers: Array.from(new Set(MODEL_CATALOG.map((m) => m.provider))),
    });
  });

  // ── GET /api/agents/:brandId/configs ────────────────────────────────────────
  app.get('/api/agents/:brandId/configs', async (req: Request, res: Response) => {
    try {
      const configs = await listAgentConfigs(req.params.brandId);
      res.json({ configs });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ── GET /api/agents/:brandId/:agentKey ──────────────────────────────────────
  app.get('/api/agents/:brandId/:agentKey', async (req: Request, res: Response) => {
    const key = asAgentKey(req.params.agentKey);
    if (!key) {
      res.status(404).json({ error: 'Unknown agent' });
      return;
    }
    try {
      const config = await getAgentConfig(req.params.brandId, key);
      const def = AGENT_DEFINITIONS[key];
      res.json({ config, definition: def });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ── PUT /api/agents/:brandId/:agentKey ──────────────────────────────────────
  app.put('/api/agents/:brandId/:agentKey', async (req: Request, res: Response) => {
    const key = asAgentKey(req.params.agentKey);
    if (!key) {
      res.status(404).json({ error: 'Unknown agent' });
      return;
    }
    try {
      const { model, systemPrompt, temperature, maxTokens, enabled, settings } =
        req.body as Record<string, unknown>;

      const patch: Parameters<typeof saveAgentConfig>[2] = {};
      if (typeof model === 'string') patch.model = model;
      if (typeof systemPrompt === 'string') patch.systemPrompt = systemPrompt;
      if (typeof temperature === 'number') patch.temperature = temperature;
      if (typeof maxTokens === 'number') patch.maxTokens = maxTokens;
      if (typeof enabled === 'boolean') patch.enabled = enabled;
      if (settings && typeof settings === 'object')
        patch.settings = settings as Record<string, unknown>;

      const config = await saveAgentConfig(req.params.brandId, key, patch);
      res.json({ config });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // ── DELETE /api/agents/:brandId/:agentKey ───────────────────────────────────
  app.delete('/api/agents/:brandId/:agentKey', async (req: Request, res: Response) => {
    const key = asAgentKey(req.params.agentKey);
    if (!key) {
      res.status(404).json({ error: 'Unknown agent' });
      return;
    }
    try {
      const config = await resetAgentConfig(req.params.brandId, key);
      res.json({ config });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ── POST /api/agents/:brandId/:agentKey/test ────────────────────────────────
  // Run the agent once with an arbitrary user message. Uses the CURRENTLY
  // SELECTED model — this is how the user verifies model switching works.
  app.post('/api/agents/:brandId/:agentKey/test', async (req: Request, res: Response) => {
    const key = asAgentKey(req.params.agentKey);
    if (!key) {
      res.status(404).json({ error: 'Unknown agent' });
      return;
    }
    const def = AGENT_DEFINITIONS[key];
    if (!def.usesLLM) {
      res.status(400).json({
        error: `${def.name} is a control-layer agent and does not call an LLM.`,
      });
      return;
    }

    try {
      const { userMessage, systemPromptOverride } = req.body as {
        userMessage?: string;
        systemPromptOverride?: string;
      };
      if (!userMessage || typeof userMessage !== 'string') {
        res.status(400).json({ error: 'userMessage is required' });
        return;
      }

      const started = Date.now();
      const { response, costUsd, config } = await runAgent({
        brandId: req.params.brandId,
        agentKey: key,
        userMessage,
        operation: `${key}:test`,
        systemPromptOverride,
      });
      const latencyMs = Date.now() - started;

      res.json({
        output: response.content,
        inputTokens: response.inputTokens,
        outputTokens: response.outputTokens,
        costUsd,
        latencyMs,
        modelUsed: response.modelId,
        providerUsed: response.provider,
        providerModelId: response.providerModelId,
        configSnapshot: {
          model: config.model,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
        },
      });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // ── GET /api/agents/:brandId/:agentKey/costs ────────────────────────────────
  app.get('/api/agents/:brandId/:agentKey/costs', async (req: Request, res: Response) => {
    const key = asAgentKey(req.params.agentKey);
    if (!key) {
      res.status(404).json({ error: 'Unknown agent' });
      return;
    }
    try {
      const rows = await prisma.apiCostLog.findMany({
        where: {
          brandId: req.params.brandId,
          OR: [
            { operation: { startsWith: `${key}:` } },
            // Legacy log entries may not match the new "agentKey:op" convention —
            // filter by metadata.agentKey for those.
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: 25,
      });

      const agg = await prisma.apiCostLog.aggregate({
        where: { brandId: req.params.brandId, operation: { startsWith: `${key}:` } },
        _sum: { costUsd: true, inputTokens: true, outputTokens: true },
        _count: true,
      });

      res.json({
        recent: rows,
        summary: {
          totalCalls: agg._count,
          totalCostUsd: Number(agg._sum.costUsd ?? 0),
          totalInputTokens: agg._sum.inputTokens ?? 0,
          totalOutputTokens: agg._sum.outputTokens ?? 0,
        },
      });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });
}
