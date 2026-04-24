// llmRouter.ts
// Unified LLM call surface. Takes a canonical model id and routes to the
// correct provider's API. All callers go through `callLLM` so swapping
// model in AgentConfig ACTUALLY changes which API is called.

import { getModelSpec, Provider } from '../config/modelCatalog';

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  modelId: string; // canonical id from MODEL_CATALOG
  systemPrompt: string;
  messages: LLMMessage[];
  maxTokens?: number;
  temperature?: number;
}

export interface LLMResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  modelId: string;
  provider: Provider;
  providerModelId: string;
}

export async function callLLM(req: LLMRequest): Promise<LLMResponse> {
  const spec = getModelSpec(req.modelId);
  if (!spec) throw new Error(`Unknown model id: ${req.modelId}`);

  const apiKey = process.env[spec.requiresEnvKey];
  if (!apiKey) {
    throw new Error(
      `${spec.requiresEnvKey} not configured — cannot call ${spec.displayName}`,
    );
  }

  const maxTokens = Math.min(req.maxTokens ?? 4096, spec.maxOutput);
  const temperature = req.temperature ?? 0.7;

  switch (spec.provider) {
    case 'anthropic':
      return callAnthropic(spec.providerModelId, req, maxTokens, temperature, apiKey, spec);
    case 'openai':
      return callOpenAICompat(
        'https://api.openai.com/v1/chat/completions',
        spec.providerModelId,
        req,
        maxTokens,
        temperature,
        apiKey,
        spec,
      );
    case 'perplexity':
      return callOpenAICompat(
        'https://api.perplexity.ai/chat/completions',
        spec.providerModelId,
        req,
        maxTokens,
        temperature,
        apiKey,
        spec,
      );
    case 'groq':
      return callOpenAICompat(
        'https://api.groq.com/openai/v1/chat/completions',
        spec.providerModelId,
        req,
        maxTokens,
        temperature,
        apiKey,
        spec,
      );
    case 'mistral':
      return callOpenAICompat(
        'https://api.mistral.ai/v1/chat/completions',
        spec.providerModelId,
        req,
        maxTokens,
        temperature,
        apiKey,
        spec,
      );
    case 'xai':
      return callOpenAICompat(
        'https://api.x.ai/v1/chat/completions',
        spec.providerModelId,
        req,
        maxTokens,
        temperature,
        apiKey,
        spec,
      );
    case 'google':
      return callGoogleGemini(
        spec.providerModelId,
        req,
        maxTokens,
        temperature,
        apiKey,
        spec,
      );
    default:
      throw new Error(`Unsupported provider: ${spec.provider}`);
  }
}

// ─── Anthropic ───────────────────────────────────────────────────────────────

async function callAnthropic(
  providerModelId: string,
  req: LLMRequest,
  maxTokens: number,
  temperature: number,
  apiKey: string,
  spec: ReturnType<typeof getModelSpec> & object,
): Promise<LLMResponse> {
  const body = {
    model: providerModelId,
    max_tokens: maxTokens,
    temperature,
    system: req.systemPrompt,
    messages: req.messages,
  };

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Anthropic ${resp.status}: ${err.slice(0, 300)}`);
  }
  const data = (await resp.json()) as {
    content: Array<{ type: string; text: string }>;
    usage: { input_tokens: number; output_tokens: number };
  };

  const content = data.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('');

  return {
    content,
    inputTokens: data.usage.input_tokens,
    outputTokens: data.usage.output_tokens,
    modelId: req.modelId,
    provider: spec!.provider,
    providerModelId,
  };
}

// ─── OpenAI-compatible (OpenAI, Perplexity, Groq, Mistral, xAI) ──────────────

async function callOpenAICompat(
  url: string,
  providerModelId: string,
  req: LLMRequest,
  maxTokens: number,
  temperature: number,
  apiKey: string,
  spec: ReturnType<typeof getModelSpec> & object,
): Promise<LLMResponse> {
  // OpenAI o1 models reject `temperature` and `system` — adjust shape.
  const isReasoning = providerModelId.startsWith('o1');

  const messages: Array<{ role: string; content: string }> = [];
  if (!isReasoning && req.systemPrompt) {
    messages.push({ role: 'system', content: req.systemPrompt });
  } else if (isReasoning && req.systemPrompt) {
    // Fold system prompt into the first user message for o1.
    const first = req.messages[0];
    messages.push({
      role: 'user',
      content: `${req.systemPrompt}\n\n${first?.content ?? ''}`,
    });
    for (const m of req.messages.slice(1)) messages.push(m);
  }
  if (!isReasoning || !req.systemPrompt) {
    for (const m of req.messages) messages.push(m);
  }

  const body: Record<string, unknown> = {
    model: providerModelId,
    messages,
    max_tokens: maxTokens,
  };
  if (!isReasoning) body.temperature = temperature;
  if (isReasoning) {
    // o1 uses max_completion_tokens
    delete body.max_tokens;
    body.max_completion_tokens = maxTokens;
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`${spec!.provider} ${resp.status}: ${err.slice(0, 300)}`);
  }
  const data = (await resp.json()) as {
    choices: Array<{ message: { content: string } }>;
    usage: { prompt_tokens: number; completion_tokens: number };
  };

  return {
    content: data.choices[0]?.message?.content ?? '',
    inputTokens: data.usage.prompt_tokens,
    outputTokens: data.usage.completion_tokens,
    modelId: req.modelId,
    provider: spec!.provider,
    providerModelId,
  };
}

// ─── Google Gemini ───────────────────────────────────────────────────────────

async function callGoogleGemini(
  providerModelId: string,
  req: LLMRequest,
  maxTokens: number,
  temperature: number,
  apiKey: string,
  spec: ReturnType<typeof getModelSpec> & object,
): Promise<LLMResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${providerModelId}:generateContent?key=${apiKey}`;

  const contents = req.messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature,
    },
  };
  if (req.systemPrompt) {
    body.systemInstruction = { parts: [{ text: req.systemPrompt }] };
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Google ${resp.status}: ${err.slice(0, 300)}`);
  }
  const data = (await resp.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };

  const content =
    data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';

  return {
    content,
    inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    modelId: req.modelId,
    provider: spec!.provider,
    providerModelId,
  };
}
