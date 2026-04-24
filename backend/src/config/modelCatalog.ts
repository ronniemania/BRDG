// modelCatalog.ts
// Canonical catalog of LLMs available to agents in the ecosystem.
// All pricing in USD per 1M tokens. Add models here — they automatically
// appear in the dropdown, cost-tracking, and router.

export type Provider =
  | 'anthropic'
  | 'openai'
  | 'perplexity'
  | 'google'
  | 'groq'
  | 'mistral'
  | 'xai';

export type ModelTier = 'frontier' | 'balanced' | 'fast' | 'cheap';
export type ModelCapability =
  | 'json'
  | 'vision'
  | 'tools'
  | 'reasoning'
  | 'web-search'
  | 'long-context'
  | 'fast';

export interface ModelSpec {
  /** Canonical id used across the app (AgentConfig.model, api_cost_logs.model). */
  id: string;
  /** Provider-facing model id used in the actual API call. */
  providerModelId: string;
  provider: Provider;
  displayName: string;
  contextWindow: number;
  maxOutput: number;
  inputPricePerM: number;
  outputPricePerM: number;
  capabilities: ModelCapability[];
  tier: ModelTier;
  /** True once we confirm the API key for this provider is configured. */
  requiresEnvKey: string;
}

export const MODEL_CATALOG: ModelSpec[] = [
  // ─── Anthropic ─────────────────────────────────────────────────────────────
  {
    id: 'claude-sonnet-4-6',
    providerModelId: 'claude-sonnet-4-5-20250929',
    provider: 'anthropic',
    displayName: 'Claude Sonnet 4.5',
    contextWindow: 200000,
    maxOutput: 8192,
    inputPricePerM: 3.0,
    outputPricePerM: 15.0,
    capabilities: ['json', 'vision', 'tools'],
    tier: 'frontier',
    requiresEnvKey: 'ANTHROPIC_API_KEY',
  },
  {
    id: 'claude-opus-4-6',
    providerModelId: 'claude-opus-4-20250514',
    provider: 'anthropic',
    displayName: 'Claude Opus 4',
    contextWindow: 200000,
    maxOutput: 8192,
    inputPricePerM: 15.0,
    outputPricePerM: 75.0,
    capabilities: ['json', 'vision', 'tools', 'reasoning'],
    tier: 'frontier',
    requiresEnvKey: 'ANTHROPIC_API_KEY',
  },
  {
    id: 'claude-haiku-4-5',
    providerModelId: 'claude-3-5-haiku-20241022',
    provider: 'anthropic',
    displayName: 'Claude Haiku 3.5',
    contextWindow: 200000,
    maxOutput: 8192,
    inputPricePerM: 0.8,
    outputPricePerM: 4.0,
    capabilities: ['json', 'tools', 'fast'],
    tier: 'fast',
    requiresEnvKey: 'ANTHROPIC_API_KEY',
  },
  {
    id: 'claude-3-5-sonnet',
    providerModelId: 'claude-3-5-sonnet-20241022',
    provider: 'anthropic',
    displayName: 'Claude 3.5 Sonnet',
    contextWindow: 200000,
    maxOutput: 8192,
    inputPricePerM: 3.0,
    outputPricePerM: 15.0,
    capabilities: ['json', 'vision', 'tools'],
    tier: 'balanced',
    requiresEnvKey: 'ANTHROPIC_API_KEY',
  },

  // ─── OpenAI ────────────────────────────────────────────────────────────────
  {
    id: 'gpt-4o',
    providerModelId: 'gpt-4o',
    provider: 'openai',
    displayName: 'GPT-4o',
    contextWindow: 128000,
    maxOutput: 16384,
    inputPricePerM: 2.5,
    outputPricePerM: 10.0,
    capabilities: ['json', 'vision', 'tools'],
    tier: 'frontier',
    requiresEnvKey: 'OPENAI_API_KEY',
  },
  {
    id: 'gpt-4o-mini',
    providerModelId: 'gpt-4o-mini',
    provider: 'openai',
    displayName: 'GPT-4o Mini',
    contextWindow: 128000,
    maxOutput: 16384,
    inputPricePerM: 0.15,
    outputPricePerM: 0.6,
    capabilities: ['json', 'vision', 'tools', 'fast'],
    tier: 'cheap',
    requiresEnvKey: 'OPENAI_API_KEY',
  },
  {
    id: 'gpt-4-turbo',
    providerModelId: 'gpt-4-turbo',
    provider: 'openai',
    displayName: 'GPT-4 Turbo',
    contextWindow: 128000,
    maxOutput: 4096,
    inputPricePerM: 10.0,
    outputPricePerM: 30.0,
    capabilities: ['json', 'vision', 'tools'],
    tier: 'balanced',
    requiresEnvKey: 'OPENAI_API_KEY',
  },
  {
    id: 'o1',
    providerModelId: 'o1',
    provider: 'openai',
    displayName: 'OpenAI o1',
    contextWindow: 200000,
    maxOutput: 100000,
    inputPricePerM: 15.0,
    outputPricePerM: 60.0,
    capabilities: ['reasoning'],
    tier: 'frontier',
    requiresEnvKey: 'OPENAI_API_KEY',
  },
  {
    id: 'o1-mini',
    providerModelId: 'o1-mini',
    provider: 'openai',
    displayName: 'OpenAI o1-mini',
    contextWindow: 128000,
    maxOutput: 65536,
    inputPricePerM: 3.0,
    outputPricePerM: 12.0,
    capabilities: ['reasoning'],
    tier: 'balanced',
    requiresEnvKey: 'OPENAI_API_KEY',
  },

  // ─── Perplexity ────────────────────────────────────────────────────────────
  {
    id: 'sonar-large',
    providerModelId: 'llama-3.1-sonar-large-128k-online',
    provider: 'perplexity',
    displayName: 'Perplexity Sonar Large (online)',
    contextWindow: 127000,
    maxOutput: 4096,
    inputPricePerM: 1.0,
    outputPricePerM: 1.0,
    capabilities: ['web-search'],
    tier: 'balanced',
    requiresEnvKey: 'PERPLEXITY_API_KEY',
  },
  {
    id: 'sonar-small',
    providerModelId: 'llama-3.1-sonar-small-128k-online',
    provider: 'perplexity',
    displayName: 'Perplexity Sonar Small (online)',
    contextWindow: 127000,
    maxOutput: 4096,
    inputPricePerM: 0.2,
    outputPricePerM: 0.2,
    capabilities: ['web-search', 'fast'],
    tier: 'fast',
    requiresEnvKey: 'PERPLEXITY_API_KEY',
  },

  // ─── Google Gemini ─────────────────────────────────────────────────────────
  {
    id: 'gemini-1.5-pro',
    providerModelId: 'gemini-1.5-pro',
    provider: 'google',
    displayName: 'Gemini 1.5 Pro',
    contextWindow: 2000000,
    maxOutput: 8192,
    inputPricePerM: 1.25,
    outputPricePerM: 5.0,
    capabilities: ['json', 'vision', 'long-context'],
    tier: 'frontier',
    requiresEnvKey: 'GOOGLE_API_KEY',
  },
  {
    id: 'gemini-1.5-flash',
    providerModelId: 'gemini-1.5-flash',
    provider: 'google',
    displayName: 'Gemini 1.5 Flash',
    contextWindow: 1000000,
    maxOutput: 8192,
    inputPricePerM: 0.075,
    outputPricePerM: 0.3,
    capabilities: ['json', 'vision', 'long-context', 'fast'],
    tier: 'cheap',
    requiresEnvKey: 'GOOGLE_API_KEY',
  },
  {
    id: 'gemini-2.0-flash',
    providerModelId: 'gemini-2.0-flash-exp',
    provider: 'google',
    displayName: 'Gemini 2.0 Flash (exp)',
    contextWindow: 1000000,
    maxOutput: 8192,
    inputPricePerM: 0.1,
    outputPricePerM: 0.4,
    capabilities: ['json', 'vision', 'fast'],
    tier: 'fast',
    requiresEnvKey: 'GOOGLE_API_KEY',
  },

  // ─── Groq ──────────────────────────────────────────────────────────────────
  {
    id: 'groq-llama-3.3-70b',
    providerModelId: 'llama-3.3-70b-versatile',
    provider: 'groq',
    displayName: 'Llama 3.3 70B (Groq)',
    contextWindow: 128000,
    maxOutput: 32768,
    inputPricePerM: 0.59,
    outputPricePerM: 0.79,
    capabilities: ['json', 'fast'],
    tier: 'fast',
    requiresEnvKey: 'GROQ_API_KEY',
  },
  {
    id: 'groq-mixtral-8x7b',
    providerModelId: 'mixtral-8x7b-32768',
    provider: 'groq',
    displayName: 'Mixtral 8x7B (Groq)',
    contextWindow: 32768,
    maxOutput: 4096,
    inputPricePerM: 0.24,
    outputPricePerM: 0.24,
    capabilities: ['json', 'fast'],
    tier: 'fast',
    requiresEnvKey: 'GROQ_API_KEY',
  },

  // ─── Mistral ───────────────────────────────────────────────────────────────
  {
    id: 'mistral-large',
    providerModelId: 'mistral-large-latest',
    provider: 'mistral',
    displayName: 'Mistral Large',
    contextWindow: 128000,
    maxOutput: 8192,
    inputPricePerM: 2.0,
    outputPricePerM: 6.0,
    capabilities: ['json', 'tools'],
    tier: 'balanced',
    requiresEnvKey: 'MISTRAL_API_KEY',
  },
  {
    id: 'mistral-small',
    providerModelId: 'mistral-small-latest',
    provider: 'mistral',
    displayName: 'Mistral Small',
    contextWindow: 128000,
    maxOutput: 8192,
    inputPricePerM: 0.2,
    outputPricePerM: 0.6,
    capabilities: ['json'],
    tier: 'cheap',
    requiresEnvKey: 'MISTRAL_API_KEY',
  },

  // ─── xAI ───────────────────────────────────────────────────────────────────
  {
    id: 'grok-2',
    providerModelId: 'grok-2-latest',
    provider: 'xai',
    displayName: 'Grok 2',
    contextWindow: 131072,
    maxOutput: 8192,
    inputPricePerM: 2.0,
    outputPricePerM: 10.0,
    capabilities: ['json'],
    tier: 'balanced',
    requiresEnvKey: 'XAI_API_KEY',
  },
];

export function getModelSpec(id: string): ModelSpec | null {
  return MODEL_CATALOG.find((m) => m.id === id) ?? null;
}

export function calcCostUsd(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const spec = getModelSpec(modelId);
  if (!spec) {
    // Unknown model: default to Claude Sonnet rates as a safe guess.
    return (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15;
  }
  return (
    (inputTokens / 1_000_000) * spec.inputPricePerM +
    (outputTokens / 1_000_000) * spec.outputPricePerM
  );
}

/** Returns the catalog with `available: boolean` based on env keys. */
export function getCatalogWithAvailability(): Array<ModelSpec & { available: boolean }> {
  return MODEL_CATALOG.map((m) => ({
    ...m,
    available: !!process.env[m.requiresEnvKey],
  }));
}
