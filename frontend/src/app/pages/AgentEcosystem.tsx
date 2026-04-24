import { useState, useEffect, useMemo } from 'react'
import {
  Bot, Brain, Wand2, BarChart2, GitBranch, Shield, Zap,
  Database, Eye, DollarSign, Play, Save, RotateCcw,
  CheckCircle2, AlertCircle, Layers, Users, Search,
  PieChart, Wallet, Megaphone, TrendingUp, Music2, Mail,
} from 'lucide-react'
import { getToken } from '../context/AuthContext'
import { useBrand } from '../context/BrandContext'

const API_BASE = (import.meta as { env: Record<string, string> }).env.VITE_API_BASE ?? '/api'

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getToken() ?? ''
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...opts,
  })
  if (!res.ok) {
    const b = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(b?.error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentDefinition {
  key: string
  name: string
  layer: 'strategic' | 'intelligence' | 'decision' | 'execution' | 'control'
  description: string
  defaultModel: string
  defaultSystemPrompt: string
  defaultTemperature: number
  defaultMaxTokens: number
  usesLLM: boolean
}

interface ModelSpec {
  id: string
  provider: string
  displayName: string
  contextWindow: number
  maxOutput: number
  inputPricePerM: number
  outputPricePerM: number
  capabilities: string[]
  tier: 'frontier' | 'balanced' | 'fast' | 'cheap'
  available: boolean
  requiresEnvKey: string
}

interface AgentConfig {
  agentKey: string
  brandId: string
  model: string
  systemPrompt: string
  temperature: number
  maxTokens: number
  enabled: boolean
  isOverride: boolean
  settings: Record<string, unknown>
}

interface CostSummary {
  totalCalls: number
  totalCostUsd: number
  totalInputTokens: number
  totalOutputTokens: number
}

interface CostRow {
  id: string
  provider: string
  model: string
  operation: string
  costUsd: number
  inputTokens: number
  outputTokens: number
  createdAt: string
}

// ─── Layer styling (light theme) ─────────────────────────────────────────────

const LAYER_STYLE: Record<string, { color: string; bg: string; icon: typeof Bot; label: string }> = {
  strategic:    { color: '#b45309', bg: '#fef3c7', icon: Bot,       label: 'Strategic' },
  intelligence: { color: '#6d28d9', bg: '#ede9fe', icon: Brain,     label: 'Intelligence' },
  decision:     { color: '#1d4ed8', bg: '#dbeafe', icon: GitBranch, label: 'Decision' },
  execution:    { color: '#047857', bg: '#d1fae5', icon: Zap,       label: 'Execution' },
  control:      { color: '#374151', bg: '#f3f4f6', icon: Database,  label: 'Control' },
}

const AGENT_ICONS: Record<string, typeof Bot> = {
  clawbot: Bot,
  analyst: BarChart2,
  creative: Wand2,
  reporter: Eye,
  audience: Users,
  competitor: Search,
  research: Brain,
  attribution: PieChart,
  decision: GitBranch,
  guardrails: Shield,
  budget: Wallet,
  metaExecutor: Megaphone,
  googleExecutor: TrendingUp,
  tiktokExecutor: Music2,
  emailExecutor: Mail,
  orchestrator: Layers,
  syncAgent: Database,
  costTracker: DollarSign,
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AgentEcosystem() {
  const { selectedBrandId } = useBrand() as { selectedBrandId: string | null }
  const [catalog, setCatalog] = useState<{ agents: AgentDefinition[]; models: ModelSpec[] } | null>(null)
  const [configs, setConfigs] = useState<Record<string, AgentConfig>>({})
  const [selectedKey, setSelectedKey] = useState<string>('clawbot')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedBrandId) return
    let active = true
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const [cat, cfg] = await Promise.all([
          apiFetch<{ agents: AgentDefinition[]; models: ModelSpec[] }>('/agents/catalog'),
          apiFetch<{ configs: AgentConfig[] }>(`/agents/${selectedBrandId}/configs`),
        ])
        if (!active) return
        setCatalog(cat)
        const map: Record<string, AgentConfig> = {}
        for (const c of cfg.configs) map[c.agentKey] = c
        setConfigs(map)
      } catch (e) {
        if (active) setError((e as Error).message)
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [selectedBrandId])

  const selectedDef = catalog?.agents.find((a) => a.key === selectedKey)
  const selectedConfig = configs[selectedKey]

  function patchConfig(next: Partial<AgentConfig>) {
    if (!selectedConfig) return
    setConfigs({ ...configs, [selectedKey]: { ...selectedConfig, ...next } })
  }

  if (!selectedBrandId) {
    return (
      <div className="p-8 text-gray-700">
        Select a brand to manage its agent ecosystem.
      </div>
    )
  }

  if (loading) {
    return <div className="p-8 text-gray-500">Loading agent ecosystem…</div>
  }

  if (error || !catalog) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error ?? 'Failed to load agent ecosystem'}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Agent Ecosystem</h1>
        <p className="text-sm text-gray-600 mt-1">
          Each agent has its own model, prompt, and settings. Changes here are wired to the live runtime — the selected model is the one actually called.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* ── Left: agent list grouped by layer ── */}
        <aside className="space-y-4">
          {(['strategic', 'intelligence', 'decision', 'execution', 'control'] as const).map((layer) => {
            const layerAgents = catalog.agents.filter((a) => a.layer === layer)
            if (layerAgents.length === 0) return null
            const style = LAYER_STYLE[layer]
            return (
              <div key={layer} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div
                  className="px-4 py-2 text-xs font-semibold uppercase tracking-wide flex items-center gap-2"
                  style={{ background: style.bg, color: style.color }}
                >
                  <Layers className="w-3.5 h-3.5" />
                  {style.label}
                </div>
                <div className="divide-y divide-gray-100">
                  {layerAgents.map((a) => {
                    const Icon = AGENT_ICONS[a.key] ?? Bot
                    const cfg = configs[a.key]
                    const isSel = a.key === selectedKey
                    return (
                      <button
                        key={a.key}
                        onClick={() => setSelectedKey(a.key)}
                        className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${
                          isSel ? 'bg-gray-50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <div
                          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                          style={{ background: style.bg, color: style.color }}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {a.name}
                          </div>
                          <div className="text-xs text-gray-500 truncate">
                            {cfg?.model ?? a.defaultModel}
                          </div>
                        </div>
                        {cfg?.isOverride && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-medium">
                            custom
                          </span>
                        )}
                        {!a.usesLLM && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
                            no LLM
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </aside>

        {/* ── Right: editor panel ── */}
        <section>
          {selectedDef && selectedConfig ? (
            <AgentEditor
              brandId={selectedBrandId}
              definition={selectedDef}
              config={selectedConfig}
              models={catalog.models}
              onChange={patchConfig}
              onSaved={(c) => setConfigs({ ...configs, [c.agentKey]: c })}
            />
          ) : (
            <div className="p-8 text-gray-500">Select an agent.</div>
          )}
        </section>
      </div>
    </div>
  )
}

// ─── Editor panel ─────────────────────────────────────────────────────────────

interface EditorProps {
  brandId: string
  definition: AgentDefinition
  config: AgentConfig
  models: ModelSpec[]
  onChange: (patch: Partial<AgentConfig>) => void
  onSaved: (c: AgentConfig) => void
}

function AgentEditor({ brandId, definition, config, models, onChange, onSaved }: EditorProps) {
  const [testInput, setTestInput] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{
    output: string
    modelUsed: string
    providerUsed: string
    providerModelId: string
    inputTokens: number
    outputTokens: number
    costUsd: number
    latencyMs: number
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [testErr, setTestErr] = useState<string | null>(null)
  const [summary, setSummary] = useState<CostSummary | null>(null)
  const [recent, setRecent] = useState<CostRow[]>([])

  // Reset test panel + refresh costs when agent changes
  useEffect(() => {
    setTestInput('')
    setTestResult(null)
    setTestErr(null)
    setSaveErr(null)
    ;(async () => {
      try {
        const r = await apiFetch<{ summary: CostSummary; recent: CostRow[] }>(
          `/agents/${brandId}/${definition.key}/costs`,
        )
        setSummary(r.summary)
        setRecent(r.recent)
      } catch { /* non-fatal */ }
    })()
  }, [brandId, definition.key])

  const selectedModel = useMemo(
    () => models.find((m) => m.id === config.model) ?? null,
    [models, config.model],
  )

  // Group models by provider for a clean dropdown
  const modelsByProvider = useMemo(() => {
    const g: Record<string, ModelSpec[]> = {}
    for (const m of models) {
      (g[m.provider] ??= []).push(m)
    }
    return g
  }, [models])

  async function save() {
    setSaving(true)
    setSaveErr(null)
    try {
      const r = await apiFetch<{ config: AgentConfig }>(
        `/agents/${brandId}/${definition.key}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            model: config.model,
            systemPrompt: config.systemPrompt,
            temperature: config.temperature,
            maxTokens: config.maxTokens,
            enabled: config.enabled,
            settings: config.settings,
          }),
        },
      )
      onSaved(r.config)
    } catch (e) {
      setSaveErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function reset() {
    if (!confirm(`Reset ${definition.name} to default settings?`)) return
    setSaving(true)
    setSaveErr(null)
    try {
      const r = await apiFetch<{ config: AgentConfig }>(
        `/agents/${brandId}/${definition.key}`,
        { method: 'DELETE' },
      )
      onSaved(r.config)
    } catch (e) {
      setSaveErr((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function runTest() {
    if (!testInput.trim()) return
    setTesting(true)
    setTestErr(null)
    setTestResult(null)
    try {
      const r = await apiFetch<typeof testResult & object>(
        `/agents/${brandId}/${definition.key}/test`,
        {
          method: 'POST',
          body: JSON.stringify({ userMessage: testInput }),
        },
      )
      setTestResult(r as NonNullable<typeof testResult>)
      // refresh cost summary
      const c = await apiFetch<{ summary: CostSummary; recent: CostRow[] }>(
        `/agents/${brandId}/${definition.key}/costs`,
      )
      setSummary(c.summary)
      setRecent(c.recent)
    } catch (e) {
      setTestErr((e as Error).message)
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wide text-gray-500">
              {LAYER_STYLE[definition.layer]?.label} Layer
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mt-1">
              {definition.name}
            </h2>
            <p className="text-sm text-gray-600 mt-1 max-w-2xl">
              {definition.description}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={config.enabled}
                onChange={(e) => onChange({ enabled: e.target.checked })}
                className="rounded"
              />
              Enabled
            </label>
          </div>
        </div>
      </div>

      {/* Model + hyper-params */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        <div>
          <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
            Model
          </label>
          <select
            value={config.model}
            onChange={(e) => onChange({ model: e.target.value })}
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {Object.entries(modelsByProvider).map(([provider, list]) => (
              <optgroup key={provider} label={provider.toUpperCase()}>
                {list.map((m) => (
                  <option
                    key={m.id}
                    value={m.id}
                    disabled={!m.available}
                  >
                    {m.displayName}
                    {!m.available ? ` — requires ${m.requiresEnvKey}` : ''}
                    {' · $'}{m.inputPricePerM}/M in · ${m.outputPricePerM}/M out
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {selectedModel && (
            <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
              <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                {selectedModel.provider}
              </span>
              <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                ctx {(selectedModel.contextWindow / 1000).toFixed(0)}k
              </span>
              <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                tier: {selectedModel.tier}
              </span>
              {selectedModel.capabilities.map((c) => (
                <span key={c} className="px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                  {c}
                </span>
              ))}
              {!selectedModel.available && (
                <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  API key missing
                </span>
              )}
            </div>
          )}
          {!definition.usesLLM && (
            <p className="mt-2 text-xs text-gray-500">
              This is a control-layer agent. It runs deterministically — model & prompt are stored here but only invoked if you enable LLM routing for this agent later.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Temperature ({config.temperature.toFixed(2)})
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.05"
              value={config.temperature}
              onChange={(e) => onChange({ temperature: parseFloat(e.target.value) })}
              className="mt-1 w-full"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Max Tokens
            </label>
            <input
              type="number"
              min="100"
              max="100000"
              step="100"
              value={config.maxTokens}
              onChange={(e) => onChange({ maxTokens: parseInt(e.target.value, 10) || 0 })}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
            System Prompt
          </label>
          <textarea
            value={config.systemPrompt}
            onChange={(e) => onChange({ systemPrompt: e.target.value })}
            rows={8}
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving…' : 'Save config'}
          </button>
          {config.isOverride && (
            <button
              onClick={reset}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white text-gray-700 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" />
              Reset to defaults
            </button>
          )}
          {saveErr && (
            <span className="text-sm text-red-600">{saveErr}</span>
          )}
        </div>
      </div>

      {/* Test panel */}
      {definition.usesLLM && (
        <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Test agent</h3>
            <span className="text-xs text-gray-500">
              Save first if you want to test with pending edits.
            </span>
          </div>
          <textarea
            value={testInput}
            onChange={(e) => setTestInput(e.target.value)}
            placeholder={`Enter a user message for ${definition.name}…`}
            rows={3}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={runTest}
              disabled={testing || !testInput.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Play className="w-4 h-4" />
              {testing ? 'Running…' : 'Run test'}
            </button>
            {testErr && <span className="text-sm text-red-600">{testErr}</span>}
          </div>

          {testResult && (
            <div className="mt-3 border border-green-200 bg-green-50 rounded-lg p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-green-800">
                <CheckCircle2 className="w-4 h-4" />
                Completed — called {testResult.providerUsed} / {testResult.providerModelId}
              </div>
              <div className="grid grid-cols-4 gap-3 text-xs text-gray-700">
                <div>
                  <div className="text-gray-500">Model used</div>
                  <div className="font-semibold">{testResult.modelUsed}</div>
                </div>
                <div>
                  <div className="text-gray-500">Tokens in / out</div>
                  <div className="font-semibold">{testResult.inputTokens} / {testResult.outputTokens}</div>
                </div>
                <div>
                  <div className="text-gray-500">Cost</div>
                  <div className="font-semibold">${testResult.costUsd.toFixed(6)}</div>
                </div>
                <div>
                  <div className="text-gray-500">Latency</div>
                  <div className="font-semibold">{testResult.latencyMs} ms</div>
                </div>
              </div>
              <pre className="bg-white border border-gray-200 rounded p-3 text-xs text-gray-800 whitespace-pre-wrap overflow-x-auto max-h-80">
                {testResult.output}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Cost history for this agent */}
      {summary && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900">Usage for this agent</h3>
            <span className="text-xs text-gray-500">(brand-scoped)</span>
          </div>
          <div className="grid grid-cols-4 gap-4 mb-4">
            <Metric label="Calls" value={summary.totalCalls.toString()} />
            <Metric label="Cost" value={`$${summary.totalCostUsd.toFixed(4)}`} />
            <Metric label="Tokens in" value={summary.totalInputTokens.toLocaleString()} />
            <Metric label="Tokens out" value={summary.totalOutputTokens.toLocaleString()} />
          </div>
          {recent.length > 0 && (
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-3 py-2">When</th>
                    <th className="text-left px-3 py-2">Operation</th>
                    <th className="text-left px-3 py-2">Provider / model</th>
                    <th className="text-right px-3 py-2">In / Out</th>
                    <th className="text-right px-3 py-2">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {recent.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2 text-gray-700">
                        {new Date(r.createdAt).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-gray-700">{r.operation}</td>
                      <td className="px-3 py-2 text-gray-700">
                        {r.provider} · {r.model}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">
                        {r.inputTokens} / {r.outputTokens}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        ${r.costUsd.toFixed(6)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-lg font-semibold text-gray-900 mt-0.5">{value}</div>
    </div>
  )
}
