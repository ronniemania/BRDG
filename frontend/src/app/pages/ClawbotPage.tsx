import { useState, useEffect } from 'react'
import {
  Bot, Brain, GitBranch, Zap, Database, Eye, DollarSign,
  Play, RefreshCw, ChevronDown, ChevronUp, CheckCircle2,
  AlertCircle, Clock, BarChart2, Megaphone, Wand2,
  TrendingUp, Users, Target, Layers, Shield, Search,
  Mail, Music2, PieChart, Wallet,
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

// ─── Agent Network ────────────────────────────────────────────────────────────

const AGENT_LAYERS = [
  {
    layer: 'Strategic',
    color: '#f59e0b',
    bg: '#fef3c7',
    agents: [{ id: 'clawbot', label: 'Clawbot', desc: 'Master brand strategy orchestrator', icon: Bot }],
  },
  {
    layer: 'Intelligence',
    color: '#8b5cf6',
    bg: '#ede9fe',
    agents: [
      { id: 'analyst',     label: 'Analyst',     desc: 'Campaign performance analyser',          icon: BarChart2 },
      { id: 'creative',    label: 'Creative',    desc: 'Ad copy & creative strategist',          icon: Wand2     },
      { id: 'reporter',    label: 'Reporter',    desc: 'Performance reporting agent',            icon: Eye       },
      { id: 'audience',    label: 'Audience',    desc: 'Segmentation & lookalike builder',       icon: Users     },
      { id: 'competitor',  label: 'Competitor',  desc: 'Competitive intelligence tracker',       icon: Search    },
      { id: 'research',    label: 'Research',    desc: 'Live market & trend research',           icon: Brain     },
      { id: 'attribution', label: 'Attribution', desc: 'Multi-touch attribution & LTV modeller', icon: PieChart  },
    ],
  },
  {
    layer: 'Decision',
    color: '#3b82f6',
    bg: '#dbeafe',
    agents: [
      { id: 'decision',   label: 'Decision',   desc: 'Approval gate & action router',      icon: GitBranch },
      { id: 'guardrails', label: 'Guardrails', desc: 'Rule-based safety checks',           icon: Shield    },
      { id: 'budget',     label: 'Budget',     desc: 'Spend allocation & reallocation',    icon: Wallet    },
    ],
  },
  {
    layer: 'Execution',
    color: '#22c55e',
    bg: '#dcfce7',
    agents: [
      { id: 'metaExecutor',   label: 'Meta Exec',   desc: 'Meta Ads API executor',       icon: Megaphone  },
      { id: 'googleExecutor', label: 'Google Exec', desc: 'Google Ads API executor',     icon: TrendingUp },
      { id: 'tiktokExecutor', label: 'TikTok Exec', desc: 'TikTok Ads API executor',     icon: Music2     },
      { id: 'emailExecutor',  label: 'Email Exec',  desc: 'Email campaign drafter & ESP', icon: Mail      },
    ],
  },
  {
    layer: 'Control & Data',
    color: '#6b7280',
    bg: '#f3f4f6',
    agents: [
      { id: 'orchestrator', label: 'Orchestrator', desc: 'Workflow routing & coordination', icon: Layers   },
      { id: 'syncAgent',    label: 'Sync Agent',   desc: 'Data source synchronisation',     icon: Database },
      { id: 'costTracker',  label: 'Cost Tracker', desc: 'API cost & token monitoring',     icon: DollarSign },
    ],
  },
]

// ─── Brand Data Form ──────────────────────────────────────────────────────────

interface BrandForm {
  brandName: string
  industry: string
  productOrService: string
  pricePoint: string
  monthlyRevenue: string
  currentMonthlyAdSpend: string
  primaryMarket: string
  targetAgeRange: string
  targetGender: string
  audienceInterests: string
  topCompetitors: string
  primaryGoal: string
  targetROAS: string
  targetCPA: string
  growthTarget: string
  topSellingProducts: string
  seasonality: string
  uniqueValueProp: string
  currentChallenges: string
}

const EMPTY_FORM: BrandForm = {
  brandName: '', industry: '', productOrService: '', pricePoint: 'mid',
  monthlyRevenue: '', currentMonthlyAdSpend: '', primaryMarket: '',
  targetAgeRange: '', targetGender: '', audienceInterests: '', topCompetitors: '',
  primaryGoal: 'sales', targetROAS: '', targetCPA: '', growthTarget: '',
  topSellingProducts: '', seasonality: '', uniqueValueProp: '', currentChallenges: '',
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#5f6368', marginBottom: '4px' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', fontSize: '13px', color: '#202124',
  border: '1px solid #dadce0', borderRadius: '8px', background: '#fff',
  outline: 'none', boxSizing: 'border-box',
}

// ─── Strategy Card ────────────────────────────────────────────────────────────

function StrategyCard({ strategy }: { strategy: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false)
  const budget = (strategy.budgetRec ?? {}) as Record<string, unknown>
  const kpis = (strategy.kpis ?? {}) as Record<string, unknown>
  const channels = (strategy.channels ?? {}) as Record<string, unknown>
  const audience = (strategy.targetAudience ?? {}) as Record<string, unknown>
  const campaigns = (strategy.campaignIdeas ?? []) as Array<Record<string, unknown>>
  const messages = (strategy.keyMessages ?? []) as string[]
  const quickWins = (strategy.quickWins ?? []) as string[]

  return (
    <div style={{ border: '1px solid #e8eaed', borderRadius: '16px', overflow: 'hidden', background: '#fff' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px', background: 'linear-gradient(135deg, #f59e0b08, #10b98108)', borderBottom: '1px solid #e8eaed' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bot size={18} color="#fff" />
            </div>
            <div>
              <p style={{ fontSize: '15px', fontWeight: 700, color: '#202124' }}>{String(strategy.title ?? 'Strategy')}</p>
              <p style={{ fontSize: '11px', color: '#5f6368', marginTop: '1px' }}>Generated by Clawbot</p>
            </div>
          </div>
          <button onClick={() => setExpanded(e => !e)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5f6368', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
            {expanded ? <><ChevronUp size={14} /> Collapse</> : <><ChevronDown size={14} /> Expand</>}
          </button>
        </div>
        <p style={{ fontSize: '13px', color: '#5f6368', marginTop: '10px', lineHeight: '1.5' }}>{String(strategy.objective ?? '')}</p>
      </div>

      {/* KPI bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', borderBottom: '1px solid #e8eaed' }}>
        {[
          { label: 'Primary KPI', value: String(kpis.primary ?? '—') },
          { label: 'Target ROAS', value: String((kpis.targets as Record<string,string>)?.ROAS ?? '—') },
          { label: 'Budget/mo', value: budget.total ? `$${Number(budget.total).toLocaleString()}` : '—' },
          { label: 'Split', value: budget.metaPct ? `Meta ${budget.metaPct}% / G ${budget.googlePct}%` : '—' },
        ].map(k => (
          <div key={k.label} style={{ padding: '12px 16px', borderRight: '1px solid #e8eaed' }}>
            <p style={{ fontSize: '10px', color: '#80868b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</p>
            <p style={{ fontSize: '14px', fontWeight: 700, color: '#202124', marginTop: '2px' }}>{k.value}</p>
          </div>
        ))}
      </div>

      {expanded && (
        <div style={{ padding: '20px 24px' }}>
          {/* Key messages */}
          {messages.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '11px', fontWeight: 700, color: '#5f6368', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>Key Messages</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {messages.map((m, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                    <span style={{ width: '18px', height: '18px', borderRadius: '50%', background: '#10b981', color: '#fff', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                    <p style={{ fontSize: '13px', color: '#202124', lineHeight: '1.4', flex: 1 }}>{m}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Audience */}
          {audience.primaryPersona && (
            <div style={{ marginBottom: '20px', padding: '14px', background: '#f8f9fa', borderRadius: '10px' }}>
              <p style={{ fontSize: '11px', fontWeight: 700, color: '#5f6368', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px' }}>Target Audience</p>
              <p style={{ fontSize: '13px', fontWeight: 600, color: '#202124' }}>{String(audience.primaryPersona)}</p>
              <p style={{ fontSize: '12px', color: '#5f6368', marginTop: '4px' }}>Age {String(audience.ageRange ?? '')} · {String((audience.segments as string[] ?? []).join(', '))}</p>
            </div>
          )}

          {/* Channels */}
          {channels.primary && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '11px', fontWeight: 700, color: '#5f6368', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>Channel Strategy</p>
              <p style={{ fontSize: '13px', color: '#202124' }}><strong>Primary:</strong> {String(channels.primary)}</p>
              <p style={{ fontSize: '13px', color: '#5f6368', marginTop: '4px' }}>{String(channels.rationale ?? '')}</p>
            </div>
          )}

          {/* Campaign ideas */}
          {campaigns.length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '11px', fontWeight: 700, color: '#5f6368', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>Campaign Ideas</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {campaigns.map((c, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', border: '1px solid #e8eaed', borderRadius: '10px' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: c.platform === 'META' ? '#1877f210' : '#4285f410', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: '10px', fontWeight: 800, color: c.platform === 'META' ? '#1877f2' : '#4285f4' }}>{String(c.platform ?? 'ADS')}</span>
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: '#202124' }}>{String(c.name ?? '')}</p>
                      <p style={{ fontSize: '11px', color: '#5f6368' }}>{String(c.objective ?? '')} · ${Number(c.estimatedBudget ?? 0).toLocaleString()}/mo · ROAS {String(c.expectedROAS ?? '—')}x</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick wins */}
          {quickWins.length > 0 && (
            <div>
              <p style={{ fontSize: '11px', fontWeight: 700, color: '#5f6368', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>Quick Wins</p>
              {quickWins.map((w, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
                  <CheckCircle2 size={14} color="#10b981" style={{ marginTop: '2px', flexShrink: 0 }} />
                  <p style={{ fontSize: '13px', color: '#202124' }}>{w}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Cost Summary ─────────────────────────────────────────────────────────────

function CostPanel({ brandId }: { brandId: string }) {
  const [costs, setCosts] = useState<{
    totalCostUsd: number
    totalCalls: number
    byProvider: Array<{ provider: string; model: string; costUsd: number }>
    byOperation: Array<{ operation: string; costUsd: number; calls: number }>
  } | null>(null)

  useEffect(() => {
    if (!brandId) return
    apiFetch<typeof costs>(`/clawbot/costs?brandId=${brandId}`).then(setCosts).catch(() => {})
  }, [brandId])

  if (!costs) return null

  const PROVIDER_COLORS: Record<string, string> = { anthropic: '#f59e0b', openai: '#10a37f', perplexity: '#8b5cf6' }

  return (
    <div style={{ border: '1px solid #e8eaed', borderRadius: '16px', padding: '20px', background: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
        <DollarSign size={16} color="#10b981" />
        <p style={{ fontSize: '14px', fontWeight: 700, color: '#202124' }}>API Cost Tracker</p>
        <span style={{ marginLeft: 'auto', fontSize: '11px', color: '#5f6368' }}>Last 30 days</span>
      </div>

      {/* Totals */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        <div style={{ padding: '12px', background: '#f8f9fa', borderRadius: '10px' }}>
          <p style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>TOTAL SPEND</p>
          <p style={{ fontSize: '20px', fontWeight: 800, color: '#202124', marginTop: '2px' }}>${costs.totalCostUsd.toFixed(4)}</p>
        </div>
        <div style={{ padding: '12px', background: '#f8f9fa', borderRadius: '10px' }}>
          <p style={{ fontSize: '11px', color: '#5f6368', fontWeight: 600 }}>API CALLS</p>
          <p style={{ fontSize: '20px', fontWeight: 800, color: '#202124', marginTop: '2px' }}>{costs.totalCalls}</p>
        </div>
      </div>

      {/* By provider */}
      {costs.byProvider.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <p style={{ fontSize: '11px', fontWeight: 600, color: '#5f6368', marginBottom: '8px' }}>BY PROVIDER</p>
          {costs.byProvider.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f3f4' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: PROVIDER_COLORS[p.provider] ?? '#6b7280' }} />
                <span style={{ fontSize: '12px', color: '#202124' }}>{p.provider}</span>
                <span style={{ fontSize: '11px', color: '#80868b' }}>{p.model}</span>
              </div>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#202124' }}>${p.costUsd.toFixed(4)}</span>
            </div>
          ))}
        </div>
      )}

      {/* By operation */}
      {costs.byOperation.length > 0 && (
        <div>
          <p style={{ fontSize: '11px', fontWeight: 600, color: '#5f6368', marginBottom: '8px' }}>BY OPERATION</p>
          {costs.byOperation.map((op, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #f1f3f4' }}>
              <span style={{ fontSize: '12px', color: '#202124' }}>{op.operation}</span>
              <div style={{ display: 'flex', gap: '12px' }}>
                <span style={{ fontSize: '11px', color: '#80868b' }}>{op.calls} calls</span>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#202124' }}>${op.costUsd.toFixed(4)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ClawbotPage() {
  const { brandId } = useBrand()
  const [form, setForm] = useState<BrandForm>(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [strategy, setStrategy] = useState<Record<string, unknown> | null>(null)
  const [costUsd, setCostUsd] = useState<number | null>(null)
  const [agentStatus, setAgentStatus] = useState<Record<string, unknown> | null>(null)
  const [statusLoading, setStatusLoading] = useState(false)
  const [formOpen, setFormOpen] = useState(true)
  const [activePulse, setActivePulse] = useState<number>(0)

  useEffect(() => {
    if (!brandId) return
    setStatusLoading(true)
    apiFetch<Record<string, unknown>>(`/clawbot/status/${brandId}`)
      .then(setAgentStatus)
      .catch(() => {})
      .finally(() => setStatusLoading(false))
  }, [brandId])

  // Cycle the flowing pulse through the 5 layers for the network animation
  useEffect(() => {
    const id = setInterval(() => setActivePulse(p => (p + 1) % AGENT_LAYERS.length), 1800)
    return () => clearInterval(id)
  }, [])

  const totalAgents = AGENT_LAYERS.reduce((acc, l) => acc + l.agents.length, 0)

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!brandId) return
    setLoading(true)
    setError('')
    try {
      const payload = {
        ...form,
        monthlyRevenue: form.monthlyRevenue ? Number(form.monthlyRevenue) : undefined,
        currentMonthlyAdSpend: form.currentMonthlyAdSpend ? Number(form.currentMonthlyAdSpend) : undefined,
        targetROAS: form.targetROAS ? Number(form.targetROAS) : undefined,
        targetCPA: form.targetCPA ? Number(form.targetCPA) : undefined,
      }
      const res = await apiFetch<{ strategy: Record<string, unknown>; costUsd: number }>(
        `/clawbot/strategy/${brandId}`,
        { method: 'POST', body: JSON.stringify(payload) },
      )
      setStrategy(res.strategy)
      setCostUsd(res.costUsd)
      setFormOpen(false)
      // scroll the animated network into view so the user sees the agents react
      setTimeout(() => {
        const el = document.getElementById('bottech-network')
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const field = (key: keyof BrandForm, label: string, type: 'text' | 'number' | 'select' | 'textarea', options?: string[]) => {
    if (type === 'select' && options) return (
      <FormField label={label}>
        <select value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} style={{ ...inputStyle, appearance: 'auto' }}>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </FormField>
    )
    if (type === 'textarea') return (
      <FormField label={label}>
        <textarea value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
      </FormField>
    )
    return (
      <FormField label={label}>
        <input type={type} value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} style={inputStyle} />
      </FormField>
    )
  }

  const agentData = (agentStatus?.agents ?? {}) as Record<string, { status: string; layer: string; description: string }>
  const pendingApprovals = (agentStatus?.pendingApprovals ?? 0) as number

  const STATUS_ICON: Record<string, React.ReactNode> = {
    ACTIVE:    <CheckCircle2 size={12} color="#22c55e" />,
    READY:     <CheckCircle2 size={12} color="#3b82f6" />,
    AWAITING:  <Clock size={12} color="#f59e0b" />,
    ERROR:     <AlertCircle size={12} color="#ef4444" />,
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto', fontFamily: 'inherit' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '24px' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '14px', background: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Bot size={24} color="#fff" />
        </div>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: '#202124', margin: 0 }}>Clawbot</h1>
          <p style={{ fontSize: '13px', color: '#5f6368', margin: 0 }}>Master Brand Strategy & Marketing Orchestrator</p>
        </div>
        {pendingApprovals > 0 && (
          <div style={{ marginLeft: 'auto', padding: '6px 14px', background: '#fef3c7', border: '1px solid #fcd34d', borderRadius: '20px', fontSize: '12px', fontWeight: 600, color: '#92400e' }}>
            {pendingApprovals} action{pendingApprovals !== 1 ? 's' : ''} awaiting approval
          </div>
        )}
      </div>

      {/* ── 1. MASTER PROMPT (brand data form) on top ───────────────── */}
      <section style={{ marginBottom: '28px' }}>
        <button
          onClick={() => setFormOpen(o => !o)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '16px 20px', background: '#fff', border: '1px solid #e8eaed',
            borderRadius: formOpen ? '16px 16px 0 0' : '16px',
            cursor: 'pointer', fontSize: '14px', fontWeight: 700, color: '#202124',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '9px', background: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bot size={16} color="#fff" />
            </div>
            Master Prompt — Brand Data Input
          </span>
          {formOpen ? <ChevronUp size={18} color="#5f6368" /> : <ChevronDown size={18} color="#5f6368" />}
        </button>

        {formOpen && (
          <form
            onSubmit={handleGenerate}
            style={{
              border: '1px solid #e8eaed', borderTop: 'none', borderRadius: '0 0 16px 16px',
              padding: '20px', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              {/* Column 1 — Brand profile */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p style={{ fontSize: '11px', fontWeight: 700, color: '#5f6368', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>Brand Profile</p>
                {field('brandName', 'Brand Name *', 'text')}
                {field('industry', 'Industry *', 'text')}
                {field('productOrService', 'Product / Service *', 'text')}
                {field('pricePoint', 'Price Point', 'select', ['budget', 'mid', 'premium', 'luxury'])}
                {field('monthlyRevenue', 'Monthly Revenue ($)', 'number')}
                {field('currentMonthlyAdSpend', 'Current Ad Spend ($)', 'number')}
              </div>

              {/* Column 2 — Audience & goals */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p style={{ fontSize: '11px', fontWeight: 700, color: '#5f6368', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>Market &amp; Goals</p>
                {field('primaryMarket', 'Primary Market / Country', 'text')}
                {field('audienceInterests', 'Audience Interests', 'text')}
                {field('topCompetitors', 'Top Competitors', 'text')}
                {field('primaryGoal', 'Primary Goal *', 'select', ['sales', 'leads', 'awareness', 'retention', 'app_installs'])}
                {field('targetROAS', 'Target ROAS', 'number')}
                {field('targetCPA', 'Target CPA ($)', 'number')}
              </div>

              {/* Column 3 — Context */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <p style={{ fontSize: '11px', fontWeight: 700, color: '#5f6368', textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>Brand Context</p>
                {field('growthTarget', 'Growth Target (e.g. 30% MoM)', 'text')}
                {field('topSellingProducts', 'Top Selling Products', 'text')}
                {field('uniqueValueProp', 'Unique Value Proposition', 'textarea')}
                {field('currentChallenges', 'Current Challenges', 'textarea')}
              </div>
            </div>

            {error && (
              <div style={{ display: 'flex', gap: '8px', padding: '10px 14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', marginTop: '14px' }}>
                <AlertCircle size={14} color="#ef4444" style={{ flexShrink: 0, marginTop: '1px' }} />
                <p style={{ fontSize: '12px', color: '#b91c1c', margin: 0 }}>{error}</p>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px' }}>
              <button
                type="submit"
                disabled={loading}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  padding: '12px 22px', background: loading ? '#9ca3af' : '#f59e0b', color: '#fff',
                  border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '14px',
                  cursor: loading ? 'not-allowed' : 'pointer', transition: 'background 0.15s',
                }}
              >
                {loading
                  ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Orchestrating {totalAgents} agents…</>
                  : <><Play size={14} /> Generate Strategy with Clawbot</>}
              </button>
              {costUsd !== null && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '20px', fontSize: '12px', color: '#15803d', fontWeight: 600 }}>
                  <DollarSign size={12} /> Cost ${costUsd.toFixed(4)}
                </span>
              )}
            </div>
          </form>
        )}
      </section>

      {/* ── 2. ANIMATED AGENT NETWORK ──────────────────────────────── */}
      <section id="bottech-network" style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div>
            <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#202124', margin: 0 }}>Agent Network</h2>
            <p style={{ fontSize: '12px', color: '#5f6368', margin: '2px 0 0' }}>
              {totalAgents} agents wired across {AGENT_LAYERS.length} layers — signals flow top to bottom
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {statusLoading
              ? <RefreshCw size={14} color="#5f6368" style={{ animation: 'spin 1s linear infinite' }} />
              : <CheckCircle2 size={14} color="#22c55e" />}
            <span style={{ fontSize: '12px', color: '#5f6368' }}>
              {loading ? 'Orchestrating…' : 'All agents online'}
            </span>
            <button
              onClick={() => {
                setStatusLoading(true)
                apiFetch<Record<string, unknown>>(`/clawbot/status/${brandId}`).then(setAgentStatus).catch(() => {}).finally(() => setStatusLoading(false))
              }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5f6368', display: 'flex', alignItems: 'center' }}
            >
              <RefreshCw size={12} />
            </button>
          </div>
        </div>

        <div style={{ position: 'relative', padding: '8px 0' }}>
          {AGENT_LAYERS.map((layer, layerIdx) => {
            const isActive = loading || layerIdx === activePulse
            return (
              <div key={layer.layer} style={{ position: 'relative' }}>
                {/* Layer card */}
                <div
                  style={{
                    border: `1px solid ${isActive ? layer.color : '#e8eaed'}`,
                    borderRadius: '14px',
                    overflow: 'hidden',
                    background: '#fff',
                    boxShadow: isActive ? `0 0 0 4px ${layer.bg}` : '0 1px 3px rgba(0,0,0,0.04)',
                    transition: 'all 0.35s ease',
                  }}
                >
                  <div style={{ padding: '10px 16px', background: layer.bg, borderBottom: '1px solid #e8eaed', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: layer.color, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                      {layer.layer} Layer
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: layer.color, fontWeight: 600 }}>
                      {layer.agents.length} agent{layer.agents.length !== 1 ? 's' : ''}
                      {isActive && (
                        <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: layer.color, animation: 'pulse 1.1s ease-in-out infinite' }} />
                      )}
                    </span>
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${Math.min(layer.agents.length, 4)}, 1fr)`,
                  }}>
                    {layer.agents.map((agent, i) => {
                      const status = agentData[agent.id]?.status ?? 'ACTIVE'
                      return (
                        <div
                          key={agent.id}
                          style={{
                            padding: '14px 16px',
                            borderRight: i % Math.min(layer.agents.length, 4) !== Math.min(layer.agents.length, 4) - 1 && i < layer.agents.length - 1 ? '1px solid #f1f3f4' : 'none',
                            borderTop: i >= Math.min(layer.agents.length, 4) ? '1px solid #f1f3f4' : 'none',
                            display: 'flex', alignItems: 'flex-start', gap: '10px',
                            transition: 'all 0.3s ease',
                            background: isActive ? '#fcfcfc' : 'transparent',
                          }}
                        >
                          <div
                            style={{
                              width: '34px', height: '34px', borderRadius: '10px',
                              background: layer.bg,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                              transform: isActive ? 'scale(1.06)' : 'scale(1)',
                              transition: 'transform 0.35s ease',
                            }}
                          >
                            <agent.icon size={16} color={layer.color} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <p style={{ fontSize: '13px', fontWeight: 600, color: '#202124', margin: 0 }}>{agent.label}</p>
                              {STATUS_ICON[status] ?? STATUS_ICON.ACTIVE}
                            </div>
                            <p style={{ fontSize: '11px', color: '#5f6368', marginTop: '2px', lineHeight: 1.4 }}>{agent.desc}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Connector between layers with flowing pulse */}
                {layerIdx < AGENT_LAYERS.length - 1 && (
                  <div
                    style={{
                      position: 'relative',
                      height: '26px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <svg width="16" height="26" viewBox="0 0 16 26" style={{ overflow: 'visible' }}>
                      <line x1="8" y1="0" x2="8" y2="26" stroke="#dadce0" strokeWidth="2" strokeDasharray="3 3" />
                      <circle
                        cx="8"
                        cy="0"
                        r="4"
                        fill={layer.color}
                        style={{ animation: `flow-${layerIdx} 1.8s ease-in-out infinite` }}
                      />
                    </svg>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Summary row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginTop: '16px' }}>
          <SummaryPill label="Total agents" value={String(totalAgents)} />
          <SummaryPill label="Layers" value={String(AGENT_LAYERS.length)} />
          <SummaryPill label="Pending approvals" value={String(pendingApprovals)} highlight={pendingApprovals > 0} />
          <SummaryPill label="Active campaigns" value={String((agentStatus?.performance as Record<string, number> | undefined)?.activeCampaigns ?? 0)} />
        </div>
      </section>

      {/* ── 3. RESULT ──────────────────────────────────────────────── */}
      {strategy && (
        <section style={{ marginBottom: '28px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#202124', margin: '0 0 10px' }}>Generated Strategy</h2>
          <StrategyCard strategy={strategy} />
        </section>
      )}

      {/* ── 4. COSTS ───────────────────────────────────────────────── */}
      {brandId && (
        <section>
          <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#202124', margin: '0 0 10px' }}>API Costs</h2>
          <CostPanel brandId={brandId} />
        </section>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(1.4); }
        }
        ${AGENT_LAYERS.map((_, i) => `
          @keyframes flow-${i} {
            0%   { cy: 0;  opacity: 0; }
            15%  { opacity: 1; }
            85%  { opacity: 1; }
            100% { cy: 26; opacity: 0; }
          }
        `).join('\n')}
      `}</style>
    </div>
  )
}

function SummaryPill({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div style={{
      padding: '12px 14px', background: '#fff', border: '1px solid #e8eaed', borderRadius: '12px',
    }}>
      <p style={{ fontSize: '10px', color: '#80868b', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>{label}</p>
      <p style={{ fontSize: '18px', fontWeight: 800, color: highlight ? '#f59e0b' : '#202124', margin: '2px 0 0' }}>{value}</p>
    </div>
  )
}
