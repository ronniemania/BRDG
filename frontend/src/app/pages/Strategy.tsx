import { useEffect, useState } from 'react'
import {
  Brain, Sparkles, TrendingUp, TrendingDown, AlertTriangle,
  Play, RefreshCw, ChevronRight, Check, X, Zap, GitBranch,
  BarChart2, Target, DollarSign, Eye, ArrowUpRight, ArrowDownRight,
  Settings, ToggleLeft, ToggleRight, Clock, ExternalLink,
} from 'lucide-react'
import { useStrategyStore, CampaignScore, StrategyRecommendation, AutoRule } from '../store/strategyStore'

type Tab = 'insights' | 'performance' | 'auto-rules'

// ─── Signal styling ────────────────────────────────────────────────────────────

const SIGNAL_CONFIG = {
  WINNER: { color: '#22c55e', bg: '#22c55e14', icon: <TrendingUp size={14} />, label: 'Winner' },
  LOSER: { color: '#ef4444', bg: '#ef444414', icon: <TrendingDown size={14} />, label: 'Underperforming' },
  FATIGUE: { color: '#f59e0b', bg: '#f59e0b14', icon: <AlertTriangle size={14} />, label: 'Creative Fatigue' },
  NEUTRAL: { color: '#6b7280', bg: '#6b728014', icon: <BarChart2 size={14} />, label: 'Neutral' },
  NEW: { color: '#3b82f6', bg: '#3b82f614', icon: <Eye size={14} />, label: 'New / Collecting' },
}

const REC_TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
  SCALE_WINNER: { icon: <TrendingUp size={14} />, color: '#22c55e' },
  PAUSE_LOSER: { icon: <X size={14} />, color: '#ef4444' },
  REDUCE_BUDGET: { icon: <ArrowDownRight size={14} />, color: '#f59e0b' },
  CREATIVE_REFRESH: { icon: <Sparkles size={14} />, color: '#8b5cf6' },
  AUDIENCE_EXPANSION: { icon: <Target size={14} />, color: '#3b82f6' },
  BID_ADJUSTMENT: { icon: <DollarSign size={14} />, color: '#f59e0b' },
  BUDGET_REALLOCATION: { icon: <ArrowUpRight size={14} />, color: '#3b82f6' },
  TEST_NEW_CREATIVE: { icon: <Sparkles size={14} />, color: '#8b5cf6' },
}

const PRIORITY_COLOR = { HIGH: '#ef4444', MEDIUM: '#f59e0b', LOW: '#6b7280' }

// ─── Sub-components ───────────────────────────────────────────────────────────

function SignalBadge({ signal }: { signal: CampaignScore['signal'] }) {
  const cfg = SIGNAL_CONFIG[signal]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '3px 9px', borderRadius: '9999px',
      fontSize: '11px', fontWeight: 700,
      backgroundColor: cfg.bg, color: cfg.color,
    }}>
      {cfg.icon} {cfg.label}
    </span>
  )
}

function RoasBar({ roas }: { roas: number }) {
  const max = 6
  const pct = Math.min((roas / max) * 100, 100)
  const color = roas >= 3 ? '#22c55e' : roas >= 1.5 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ flex: 1, height: '5px', backgroundColor: 'var(--color-stroke)', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: color, borderRadius: '3px', transition: 'width 0.4s' }} />
      </div>
      <span style={{ fontSize: '12px', fontWeight: 800, color, minWidth: '42px', textAlign: 'right' }}>
        {roas.toFixed(2)}×
      </span>
    </div>
  )
}

function PerformanceCard({ score, onAction }: {
  score: CampaignScore
  onAction: (campaignId: string, externalId: string, platform: string, action: string, valuePct?: number) => void
}) {
  const [actioning, setActioning] = useState(false)

  const handleAction = async (action: string, valuePct?: number) => {
    setActioning(true)
    try {
      await onAction(score.campaignId, score.externalId, score.platform, action, valuePct)
    } finally {
      setActioning(false)
    }
  }

  const cfg = SIGNAL_CONFIG[score.signal]

  return (
    <div style={{
      backgroundColor: 'var(--color-bg-card)',
      border: `1px solid ${cfg.color}30`,
      borderLeft: `3px solid ${cfg.color}`,
      borderRadius: '12px', padding: '16px',
      display: 'flex', flexDirection: 'column', gap: '12px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <SignalBadge signal={score.signal} />
          <div style={{
            fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)',
            marginTop: '6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }} title={score.campaignName}>
            {score.campaignName}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
            {score.platform} · ${(score.metrics.spend7d / 100).toFixed(0)} spend 7d
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
          <div style={{ fontSize: '22px', fontWeight: 900, color: score.metrics.roas >= 3 ? '#22c55e' : score.metrics.roas >= 1.5 ? '#f59e0b' : '#ef4444' }}>
            {score.metrics.roas.toFixed(2)}×
          </div>
          <div style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>ROAS</div>
        </div>
      </div>

      {/* ROAS bar */}
      <RoasBar roas={score.metrics.roas} />

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
        {[
          { label: 'CTR', value: `${score.metrics.ctr.toFixed(2)}%` },
          { label: 'CPA', value: score.metrics.cpa > 0 ? `$${score.metrics.cpa.toFixed(2)}` : '—' },
          { label: 'Conv', value: score.metrics.conversions7d.toString() },
        ].map(({ label, value }) => (
          <div key={label} style={{
            padding: '7px', borderRadius: '7px',
            backgroundColor: 'var(--color-bg-base)', textAlign: 'center',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{value}</div>
            <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Signal reasons */}
      {score.signalReasons.length > 0 && (
        <div style={{
          fontSize: '11px', color: 'var(--color-text-muted)',
          backgroundColor: 'var(--color-bg-base)',
          borderRadius: '6px', padding: '8px 10px',
          borderLeft: `2px solid ${cfg.color}40`,
        }}>
          {score.signalReasons[0]}
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {score.signal === 'WINNER' && (
          <button
            onClick={() => handleAction('INCREASE_BUDGET', score.suggestedBudgetChangePct ?? 15)}
            disabled={actioning}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
              padding: '7px 12px', borderRadius: '7px', border: 'none',
              backgroundColor: '#22c55e', color: '#fff',
              fontSize: '12px', fontWeight: 700, cursor: 'pointer',
            }}
          >
            <TrendingUp size={12} />
            Scale +{score.suggestedBudgetChangePct ?? 15}%
          </button>
        )}
        {(score.signal === 'LOSER') && (
          <>
            <button
              onClick={() => handleAction('PAUSE_CAMPAIGN')}
              disabled={actioning}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                padding: '7px 12px', borderRadius: '7px',
                border: '1px solid #ef4444', backgroundColor: 'transparent',
                color: '#ef4444', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
              }}
            >
              <X size={12} />
              Pause
            </button>
            <button
              onClick={() => handleAction('DECREASE_BUDGET', 30)}
              disabled={actioning}
              style={{
                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                padding: '7px 12px', borderRadius: '7px',
                border: '1px solid var(--color-stroke)', backgroundColor: 'transparent',
                color: 'var(--color-text-muted)', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              }}
            >
              <ArrowDownRight size={12} />
              Cut -30%
            </button>
          </>
        )}
        {score.signal === 'FATIGUE' && (
          <button
            onClick={() => handleAction('CREATIVE_REFRESH')}
            disabled={actioning}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
              padding: '7px 12px', borderRadius: '7px', border: 'none',
              backgroundColor: '#8b5cf6', color: '#fff',
              fontSize: '12px', fontWeight: 700, cursor: 'pointer',
            }}
          >
            <Sparkles size={12} />
            Refresh Creative
          </button>
        )}
        {(score.signal === 'NEUTRAL' || score.signal === 'NEW') && (
          <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', padding: '4px 0' }}>
            Monitoring — collecting more data
          </div>
        )}
      </div>
    </div>
  )
}

function RecommendationCard({ rec, onApply, applying }: {
  rec: StrategyRecommendation
  onApply?: (rec: StrategyRecommendation) => void
  applying: boolean
}) {
  const typeCfg = REC_TYPE_CONFIG[rec.type] ?? { icon: <Brain size={14} />, color: '#6b7280' }
  const priorityColor = PRIORITY_COLOR[rec.priority]

  return (
    <div style={{
      backgroundColor: 'var(--color-bg-card)',
      border: '1px solid var(--color-stroke)',
      borderRadius: '12px', overflow: 'hidden',
    }}>
      <div style={{ height: '3px', backgroundColor: priorityColor }} />
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '28px', height: '28px', borderRadius: '8px',
              backgroundColor: `${typeCfg.color}18`, color: typeCfg.color, flexShrink: 0,
            }}>
              {typeCfg.icon}
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{rec.title}</div>
              {rec.campaignName && (
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{rec.campaignName}</div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0, marginLeft: '8px' }}>
            <span style={{
              padding: '2px 7px', borderRadius: '4px',
              fontSize: '10px', fontWeight: 800,
              backgroundColor: `${priorityColor}18`, color: priorityColor,
            }}>
              {rec.priority}
            </span>
            <span style={{
              padding: '2px 7px', borderRadius: '4px',
              fontSize: '10px', fontWeight: 700,
              backgroundColor: 'var(--color-bg-base)', color: 'var(--color-text-muted)',
            }}>
              {Math.round(rec.confidence * 100)}% conf
            </span>
          </div>
        </div>

        {/* Insight */}
        <div style={{
          fontSize: '12px', color: 'var(--color-text-secondary)',
          backgroundColor: 'var(--color-bg-base)', borderRadius: '7px',
          padding: '10px 12px', borderLeft: `3px solid ${typeCfg.color}40`,
        }}>
          <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--color-text-muted)', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            What the data says
          </div>
          {rec.insight}
        </div>

        {/* Suggested action */}
        <div>
          <div style={{ fontSize: '10px', fontWeight: 800, color: 'var(--color-text-muted)', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Recommended action
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-primary)' }}>{rec.suggestedAction}</div>
        </div>

        {/* Impact + apply */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            fontSize: '11px', color: '#22c55e', fontWeight: 600,
          }}>
            <ArrowUpRight size={12} />
            {rec.estimatedImpact}
          </div>
          {rec.actionPayload && onApply && (
            <button
              onClick={() => onApply(rec)}
              disabled={applying}
              style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '6px 14px', borderRadius: '7px', border: 'none',
                backgroundColor: typeCfg.color,
                color: '#fff', fontSize: '12px', fontWeight: 700,
                cursor: applying ? 'not-allowed' : 'pointer',
                opacity: applying ? 0.7 : 1,
              }}
            >
              <Zap size={11} />
              Apply →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function AutoRuleRow({ rule, onUpdate, result }: {
  rule: AutoRule
  onUpdate: (id: string, updates: Partial<AutoRule>) => void
  result?: { triggered: boolean; reason: string; actionQueued?: string }
}) {
  const conditionLabel: Record<AutoRule['condition'], string> = {
    ROAS_BELOW: `ROAS < ${rule.threshold}×`,
    ROAS_ABOVE: `ROAS > ${rule.threshold}×`,
    FREQUENCY_ABOVE: `Frequency > ${rule.threshold}×`,
    CTR_BELOW: `CTR < ${rule.threshold}%`,
    CPA_ABOVE: `CPA > $${rule.threshold}`,
  }
  const actionLabel: Record<AutoRule['action'], string> = {
    PAUSE_CAMPAIGN: 'Pause campaign',
    INCREASE_BUDGET: `Increase budget ${rule.actionValue ?? 20}%`,
    DECREASE_BUDGET: `Decrease budget ${rule.actionValue ?? 20}%`,
    FLAG_CREATIVE: 'Flag for creative refresh',
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '12px 16px',
      backgroundColor: rule.enabled ? 'var(--color-bg-card)' : 'var(--color-bg-base)',
      border: '1px solid var(--color-stroke)', borderRadius: '10px',
      opacity: rule.enabled ? 1 : 0.6,
    }}>
      {/* Toggle */}
      <button
        onClick={() => onUpdate(rule.id, { enabled: !rule.enabled })}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}
      >
        {rule.enabled
          ? <ToggleRight size={22} style={{ color: 'var(--color-accent)' }} />
          : <ToggleLeft size={22} style={{ color: '#6b7280' }} />}
      </button>

      {/* Rule info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{rule.name}</div>
        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
          If <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>{conditionLabel[rule.condition]}</span>
          {' → '}
          <span style={{ fontWeight: 700, color: 'var(--color-accent)' }}>{actionLabel[rule.action]}</span>
          {rule.minSpendCents && ` (min $${(rule.minSpendCents / 100).toFixed(0)} spend)`}
          {rule.requiresApproval && (
            <span style={{ marginLeft: '6px', color: '#f59e0b', fontWeight: 600 }}>· needs approval</span>
          )}
        </div>
      </div>

      {/* Result badge */}
      {result && (
        <div style={{
          padding: '2px 8px', borderRadius: '6px',
          fontSize: '10px', fontWeight: 700,
          backgroundColor: result.triggered ? '#f59e0b18' : '#22c55e18',
          color: result.triggered ? '#f59e0b' : '#22c55e',
          flexShrink: 0,
        }}>
          {result.triggered ? `Triggered` : 'No match'}
        </div>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Strategy() {
  const [activeTab, setActiveTab] = useState<Tab>('insights')
  const [applyingRecId, setApplyingRecId] = useState<string | null>(null)

  const {
    selectedBrandId, selectedAdsAccountId,
    scores, recommendations, autoRules, autoRuleResults,
    isLoadingScores, isGeneratingRecs, isEvaluatingRules,
    error, lastRecsGeneratedAt,
    fetchScores, generateRecommendations,
    evaluateAutoRules, updateAutoRule, applyQuickAction,
  } = useStrategyStore()

  useEffect(() => {
    if (!selectedBrandId) return
    fetchScores()
  }, [selectedBrandId])

  const handleApplyRec = async (rec: StrategyRecommendation) => {
    if (!rec.actionPayload || !rec.campaignId || !rec.platform) return
    setApplyingRecId(rec.id)
    try {
      await applyQuickAction({
        campaignId: rec.campaignId,
        externalId: rec.externalId ?? '',
        platform: rec.platform,
        action: rec.actionPayload.type,
        valuePct: rec.actionPayload.valuePct,
        reason: rec.suggestedAction,
      })
    } finally {
      setApplyingRecId(null)
    }
  }

  const winners = scores.filter(s => s.signal === 'WINNER')
  const losers = scores.filter(s => s.signal === 'LOSER')
  const fatigued = scores.filter(s => s.signal === 'FATIGUE')
  const neutral = scores.filter(s => s.signal === 'NEUTRAL' || s.signal === 'NEW')

  const tabs = [
    { id: 'insights' as Tab, label: 'AI Insights', icon: <Brain size={13} />, badge: recommendations.length > 0 ? recommendations.length : undefined },
    { id: 'performance' as Tab, label: 'Performance', icon: <BarChart2 size={13} />, badge: losers.length > 0 ? losers.length : undefined },
    { id: 'auto-rules' as Tab, label: 'Auto-Rules', icon: <Settings size={13} /> },
  ]

  if (!selectedBrandId) {
    return (
      <div style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto' }}>
        <div style={{
          textAlign: 'center', padding: '80px 24px',
          backgroundColor: 'var(--color-bg-card)',
          borderRadius: '16px', border: '1px dashed var(--color-stroke)',
          color: 'var(--color-text-muted)',
        }}>
          <Brain size={32} style={{ marginBottom: '12px', opacity: 0.3 }} />
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>No brand selected</div>
          <div style={{ fontSize: '13px' }}>Select a brand from the dashboard to view strategy.</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: 'var(--color-text-primary)' }}>
              Strategy
            </h1>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              padding: '2px 8px', borderRadius: '6px',
              fontSize: '10px', fontWeight: 700,
              backgroundColor: '#8b5cf618', color: '#8b5cf6',
            }}>
              <Brain size={10} />
              AI-Powered
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-muted)' }}>
            AI recommendations · Performance intelligence · Automated rules
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => fetchScores()}
            disabled={isLoadingScores}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', borderRadius: '8px',
              border: '1px solid var(--color-stroke)', backgroundColor: 'transparent',
              color: 'var(--color-text-primary)', fontSize: '13px', cursor: 'pointer',
            }}
          >
            <RefreshCw size={13} style={{ animation: isLoadingScores ? 'spin 1s linear infinite' : 'none' }} />
            Refresh
          </button>
          {activeTab === 'insights' && (
            <button
              onClick={() => generateRecommendations()}
              disabled={isGeneratingRecs}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 16px', borderRadius: '8px', border: 'none',
                backgroundColor: isGeneratingRecs ? 'var(--color-stroke)' : '#8b5cf6',
                color: isGeneratingRecs ? 'var(--color-text-muted)' : '#fff',
                fontSize: '13px', fontWeight: 700, cursor: 'pointer',
              }}
            >
              <Sparkles size={13} />
              {isGeneratingRecs ? 'Analysing…' : 'Generate Insights'}
            </button>
          )}
          {activeTab === 'auto-rules' && (
            <button
              onClick={() => evaluateAutoRules()}
              disabled={isEvaluatingRules}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 16px', borderRadius: '8px', border: 'none',
                backgroundColor: 'var(--color-accent)', color: '#fff',
                fontSize: '13px', fontWeight: 700, cursor: 'pointer',
              }}
            >
              <Play size={13} />
              {isEvaluatingRules ? 'Running…' : 'Run Rules Now'}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div style={{
          padding: '10px 16px', borderRadius: '8px',
          backgroundColor: '#ef444415', color: '#ef4444',
          fontSize: '13px', marginBottom: '16px',
          border: '1px solid #ef444430',
        }}>
          {error}
        </div>
      )}

      {/* KPI bar */}
      {scores.length > 0 && (
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', marginBottom: '20px',
        }}>
          {[
            { label: 'Winners', value: winners.length, color: '#22c55e', icon: <TrendingUp size={14} /> },
            { label: 'Underperforming', value: losers.length, color: '#ef4444', icon: <TrendingDown size={14} /> },
            { label: 'Creative Fatigue', value: fatigued.length, color: '#f59e0b', icon: <AlertTriangle size={14} /> },
            { label: 'Monitoring', value: neutral.length, color: '#6b7280', icon: <Eye size={14} /> },
          ].map(({ label, value, color, icon }) => (
            <div key={label} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '12px 16px', borderRadius: '10px',
              backgroundColor: 'var(--color-bg-card)',
              border: `1px solid ${color}30`,
            }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '8px',
                backgroundColor: `${color}18`, color,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {icon}
              </div>
              <div>
                <div style={{ fontSize: '20px', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
                <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '1px' }}>{label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '20px', borderBottom: '1px solid var(--color-stroke)' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              padding: '9px 18px', border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--color-accent)' : '2px solid transparent',
              backgroundColor: 'transparent',
              color: activeTab === tab.id ? 'var(--color-accent)' : 'var(--color-text-muted)',
              fontSize: '13px', fontWeight: activeTab === tab.id ? 700 : 400,
              cursor: 'pointer', marginBottom: '-1px',
            }}
          >
            {tab.icon} {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minWidth: '18px', height: '18px', borderRadius: '9px',
                backgroundColor: activeTab === tab.id ? 'var(--color-accent)' : '#ef4444',
                color: '#fff', fontSize: '10px', fontWeight: 800, padding: '0 4px',
              }}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Tab: AI Insights ──────────────────────────────────────────────────── */}
      {activeTab === 'insights' && (
        <div>
          {recommendations.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '64px 24px',
              backgroundColor: 'var(--color-bg-card)',
              borderRadius: '16px', border: '1px dashed var(--color-stroke)',
            }}>
              <div style={{
                width: '56px', height: '56px', borderRadius: '16px',
                backgroundColor: '#8b5cf618', margin: '0 auto 16px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Sparkles size={24} style={{ color: '#8b5cf6' }} />
              </div>
              <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '6px' }}>
                No insights yet
              </div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '20px', maxWidth: '400px', margin: '0 auto 20px' }}>
                Click "Generate Insights" to have AI analyse your campaigns and produce strategic recommendations.
              </div>
              <button
                onClick={() => generateRecommendations()}
                disabled={isGeneratingRecs}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '10px 20px', borderRadius: '9px', border: 'none',
                  backgroundColor: '#8b5cf6', color: '#fff',
                  fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                }}
              >
                <Sparkles size={15} />
                {isGeneratingRecs ? 'Analysing campaigns…' : 'Generate AI Insights'}
              </button>
            </div>
          ) : (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
                  {recommendations.length} recommendations
                  {lastRecsGeneratedAt && ` · Generated ${new Date(lastRecsGeneratedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '14px' }}>
                {recommendations.map(rec => (
                  <RecommendationCard
                    key={rec.id}
                    rec={rec}
                    onApply={rec.actionPayload ? handleApplyRec : undefined}
                    applying={applyingRecId === rec.id}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Performance Intelligence ─────────────────────────────────────── */}
      {activeTab === 'performance' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {isLoadingScores ? (
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '14px',
            }}>
              {[1, 2, 3].map(i => (
                <div key={i} style={{
                  height: '220px', borderRadius: '12px',
                  backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-stroke)',
                }} />
              ))}
            </div>
          ) : scores.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '48px',
              color: 'var(--color-text-muted)', fontSize: '13px',
            }}>
              No campaign data available. Sync your ad accounts first.
            </div>
          ) : (
            <>
              {winners.length > 0 && (
                <section>
                  <h3 style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 700, color: '#22c55e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <TrendingUp size={14} /> Winners — Scale These
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
                    {winners.map(s => (
                      <PerformanceCard key={s.campaignId} score={s} onAction={(cid, eid, plat, action, valuePct) =>
                        applyQuickAction({ campaignId: cid, externalId: eid, platform: plat, action, valuePct })} />
                    ))}
                  </div>
                </section>
              )}
              {fatigued.length > 0 && (
                <section>
                  <h3 style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 700, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertTriangle size={14} /> Creative Fatigue — Refresh These
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
                    {fatigued.map(s => (
                      <PerformanceCard key={s.campaignId} score={s} onAction={(cid, eid, plat, action, valuePct) =>
                        applyQuickAction({ campaignId: cid, externalId: eid, platform: plat, action, valuePct })} />
                    ))}
                  </div>
                </section>
              )}
              {losers.length > 0 && (
                <section>
                  <h3 style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 700, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <TrendingDown size={14} /> Underperforming — Review These
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
                    {losers.map(s => (
                      <PerformanceCard key={s.campaignId} score={s} onAction={(cid, eid, plat, action, valuePct) =>
                        applyQuickAction({ campaignId: cid, externalId: eid, platform: plat, action, valuePct })} />
                    ))}
                  </div>
                </section>
              )}
              {neutral.length > 0 && (
                <section>
                  <h3 style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 700, color: '#6b7280', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Eye size={14} /> Monitoring
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '12px' }}>
                    {neutral.map(s => (
                      <PerformanceCard key={s.campaignId} score={s} onAction={(cid, eid, plat, action, valuePct) =>
                        applyQuickAction({ campaignId: cid, externalId: eid, platform: plat, action, valuePct })} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Tab: Auto-Rules ───────────────────────────────────────────────────── */}
      {activeTab === 'auto-rules' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Info banner */}
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '10px',
            padding: '12px 16px', borderRadius: '10px',
            backgroundColor: '#3b82f610', border: '1px solid #3b82f630',
          }}>
            <GitBranch size={16} style={{ color: '#3b82f6', marginTop: '1px', flexShrink: 0 }} />
            <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>
              Auto-rules evaluate against live campaign scores. Actions marked "needs approval" are queued in the Approval Queue — they don't execute automatically.
            </div>
          </div>

          {/* Rules list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {autoRules.map(rule => {
              const ruleResults = autoRuleResults.filter(r => r.ruleId === rule.id)
              const triggeredResult = ruleResults.find(r => r.triggered)
              return (
                <AutoRuleRow
                  key={rule.id}
                  rule={rule}
                  onUpdate={updateAutoRule}
                  result={triggeredResult ? { triggered: true, reason: triggeredResult.reason, actionQueued: triggeredResult.actionQueued } : undefined}
                />
              )
            })}
          </div>

          {/* Results */}
          {autoRuleResults.length > 0 && (
            <div>
              <h3 style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                Last Evaluation Results
              </h3>
              <div style={{
                backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-stroke)',
                borderRadius: '12px', overflow: 'hidden',
              }}>
                {autoRuleResults.filter(r => r.triggered).map((result, idx) => (
                  <div key={`${result.ruleId}_${result.campaignId}`} style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '10px 16px',
                    borderBottom: idx < autoRuleResults.filter(r => r.triggered).length - 1 ? '1px solid var(--color-stroke)' : 'none',
                  }}>
                    <div style={{
                      width: '8px', height: '8px', borderRadius: '50%',
                      backgroundColor: '#f59e0b', flexShrink: 0,
                    }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                        {result.campaignName}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{result.reason}</div>
                    </div>
                    <div style={{
                      padding: '2px 8px', borderRadius: '5px',
                      fontSize: '10px', fontWeight: 700,
                      backgroundColor: '#f59e0b18', color: '#b45309',
                    }}>
                      {result.actionQueued?.replace(/_/g, ' ')}
                    </div>
                  </div>
                ))}
                {autoRuleResults.filter(r => r.triggered).length === 0 && (
                  <div style={{ padding: '24px', textAlign: 'center', fontSize: '13px', color: 'var(--color-text-muted)' }}>
                    No rules triggered in last evaluation
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
