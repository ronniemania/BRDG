import { useEffect, useState } from 'react'
import { Play, RefreshCw, Brain, GitBranch, Zap, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { useAdsStore } from '../store/adsStore'
import CampaignMetricsCard from '../components/ads/CampaignMetricsCard'
import ActionApprovalPanel from '../components/ads/ActionApprovalPanel'
import GuardrailConfigPanel from '../components/ads/GuardrailConfigPanel'
import WorkflowStatusTimeline from '../components/ads/WorkflowStatusTimeline'

type Tab = 'overview' | 'campaigns' | 'approvals' | 'settings'

interface KpiCardProps {
  label: string
  value: string
  sublabel?: string
  trend?: number // positive = up, negative = down
  accentColor?: string
  icon?: React.ReactNode
}

function KpiCard({ label, value, sublabel, trend, accentColor = 'var(--color-accent)', icon }: KpiCardProps) {
  const TrendIcon = trend === undefined ? null : trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus
  const trendColor = trend === undefined ? '' : trend > 0 ? '#22c55e' : trend < 0 ? '#ef4444' : '#6b7280'

  return (
    <div style={{
      backgroundColor: 'var(--color-bg-card)',
      border: '1px solid var(--color-stroke)',
      borderRadius: '12px',
      padding: '16px 20px',
      borderLeft: `3px solid ${accentColor}`,
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {label}
        </div>
        {icon && (
          <div style={{ color: accentColor, opacity: 0.7 }}>{icon}</div>
        )}
      </div>
      <div style={{ fontSize: '26px', fontWeight: 800, color: 'var(--color-text-primary)', lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {TrendIcon && trend !== undefined && (
          <>
            <TrendIcon size={12} style={{ color: trendColor }} />
            <span style={{ fontSize: '11px', color: trendColor, fontWeight: 600 }}>
              {Math.abs(trend).toFixed(1)}%
            </span>
          </>
        )}
        {sublabel && (
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
            {sublabel}
          </span>
        )}
      </div>
    </div>
  )
}

function LayerLegend() {
  const layers = [
    { icon: <Brain size={12} />, label: 'Intelligence', color: '#8b5cf6', desc: 'Analyst · Creative · Clawbot' },
    { icon: <GitBranch size={12} />, label: 'Decision', color: '#3b82f6', desc: 'Decision Agent · Guardrails' },
    { icon: <Zap size={12} />, label: 'Execution', color: '#22c55e', desc: 'Executor · Reporter' },
  ]
  return (
    <div style={{
      display: 'flex',
      gap: '12px',
      padding: '10px 16px',
      backgroundColor: 'var(--color-bg-base)',
      borderRadius: '8px',
      border: '1px solid var(--color-stroke)',
      marginBottom: '20px',
    }}>
      {layers.map(l => (
        <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '20px', height: '20px', borderRadius: '6px',
            backgroundColor: `${l.color}22`, color: l.color,
          }}>
            {l.icon}
          </div>
          <div>
            <span style={{ fontSize: '11px', fontWeight: 700, color: l.color }}>{l.label}</span>
            <span style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginLeft: '4px' }}>{l.desc}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function AdsManagement() {
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [triggering, setTriggering] = useState(false)

  const {
    campaigns,
    actionLog,
    approvalQueue,
    workflowRuns,
    isLoading,
    error,
    fetchCampaigns,
    fetchActionLog,
    fetchApprovalQueue,
    fetchGuardrailConfig,
    fetchWorkflowRuns,
    triggerWorkflow,
    selectedBrandId,
  } = useAdsStore()

  useEffect(() => {
    if (!selectedBrandId) return
    fetchCampaigns()
    fetchActionLog()
    fetchApprovalQueue()
    fetchGuardrailConfig()
    fetchWorkflowRuns()
  }, [selectedBrandId])

  const handleTrigger = async () => {
    setTriggering(true)
    try {
      await triggerWorkflow()
      await fetchWorkflowRuns()
    } finally {
      setTriggering(false)
    }
  }

  const handleRefresh = () => {
    fetchCampaigns()
    fetchActionLog()
    fetchApprovalQueue()
    fetchWorkflowRuns()
  }

  const totalSpend7d = campaigns.reduce((s, c) => s + c.metrics.reduce((ms, m) => ms + m.spendCents, 0), 0)
  const totalConversions7d = campaigns.reduce((s, c) => s + c.metrics.reduce((ms, m) => ms + m.conversions, 0), 0)
  const blendedRoas = (() => {
    const totalValue = campaigns.reduce((s, c) => s + c.metrics.reduce((ms, m) => ms + m.spendCents * Number(m.roas), 0), 0)
    return totalSpend7d > 0 ? totalValue / totalSpend7d : 0
  })()
  const activeCampaigns = campaigns.filter(c => c.status === 'ACTIVE').length

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'campaigns', label: `Campaigns (${campaigns.length})` },
    { id: 'approvals', label: 'Approval Queue', badge: approvalQueue.length },
    { id: 'settings', label: 'Guardrails' },
  ]

  return (
    <div style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
            <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: 'var(--color-text-primary)' }}>
              Ads Management
            </h1>
            <span style={{
              padding: '2px 8px',
              borderRadius: '6px',
              fontSize: '10px',
              fontWeight: 700,
              backgroundColor: '#22c55e22',
              color: '#22c55e',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}>
              AI-Driven
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-muted)' }}>
            Orchestrated · Intelligence → Decision → Execution · Daily 06:00 UTC
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={handleRefresh}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', borderRadius: '8px',
              border: '1px solid var(--color-stroke)',
              backgroundColor: 'transparent',
              color: 'var(--color-text-primary)',
              fontSize: '13px', cursor: 'pointer',
            }}
          >
            <RefreshCw size={13} />
            Refresh
          </button>
          <button
            onClick={handleTrigger}
            disabled={triggering || !selectedBrandId}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 16px', borderRadius: '8px',
              border: 'none',
              backgroundColor: triggering ? 'var(--color-stroke)' : 'var(--color-accent)',
              color: triggering ? 'var(--color-text-muted)' : '#fff',
              fontSize: '13px', fontWeight: 700,
              cursor: triggering || !selectedBrandId ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s',
            }}
          >
            <Play size={13} fill={triggering ? 'none' : 'currentColor'} />
            {triggering ? 'Triggering…' : 'Run Now'}
          </button>
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

      {!selectedBrandId ? (
        <div style={{
          textAlign: 'center', padding: '80px 24px',
          color: 'var(--color-text-muted)', fontSize: '14px',
          backgroundColor: 'var(--color-bg-card)',
          borderRadius: '16px', border: '1px dashed var(--color-stroke)',
        }}>
          <Brain size={32} style={{ marginBottom: '12px', opacity: 0.3 }} />
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>No brand selected</div>
          <div style={{ fontSize: '13px' }}>Select a brand from the dashboard to view ads management.</div>
        </div>
      ) : (
        <>
          {/* Agent Layer Legend */}
          <LayerLegend />

          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '24px' }}>
            <KpiCard
              label="Total Spend (7d)"
              value={`$${(totalSpend7d / 100).toLocaleString()}`}
              sublabel="last 7 days"
              accentColor="#8b5cf6"
              icon={<TrendingUp size={14} />}
            />
            <KpiCard
              label="Blended ROAS"
              value={`${blendedRoas.toFixed(2)}×`}
              sublabel="7d weighted"
              accentColor={blendedRoas >= 3 ? '#22c55e' : blendedRoas >= 1.5 ? '#f59e0b' : '#ef4444'}
              icon={<TrendingUp size={14} />}
            />
            <KpiCard
              label="Conversions (7d)"
              value={totalConversions7d.toLocaleString()}
              sublabel="across all campaigns"
              accentColor="#3b82f6"
            />
            <KpiCard
              label="Active Campaigns"
              value={activeCampaigns.toString()}
              sublabel={`of ${campaigns.length} total`}
              accentColor="#22c55e"
            />
          </div>

          {/* Approval Queue alert bar */}
          {approvalQueue.length > 0 && (
            <div
              onClick={() => setActiveTab('approvals')}
              style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 16px', borderRadius: '8px',
                backgroundColor: '#f59e0b15', border: '1px solid #f59e0b40',
                marginBottom: '20px', cursor: 'pointer',
              }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '20px', height: '20px', borderRadius: '50%',
                backgroundColor: '#f59e0b', color: '#fff',
                fontSize: '11px', fontWeight: 800, flexShrink: 0,
              }}>
                {approvalQueue.length}
              </div>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#b45309' }}>
                {approvalQueue.length === 1 ? '1 action awaiting' : `${approvalQueue.length} actions awaiting`} your approval
              </span>
              <span style={{ fontSize: '12px', color: '#b45309', marginLeft: 'auto' }}>View queue →</span>
            </div>
          )}

          {/* Tabs */}
          <div style={{
            display: 'flex', gap: '2px', marginBottom: '20px',
            borderBottom: '1px solid var(--color-stroke)',
          }}>
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '9px 18px',
                  border: 'none',
                  borderBottom: activeTab === tab.id
                    ? '2px solid var(--color-accent)'
                    : '2px solid transparent',
                  backgroundColor: 'transparent',
                  color: activeTab === tab.id ? 'var(--color-accent)' : 'var(--color-text-muted)',
                  fontSize: '13px',
                  fontWeight: activeTab === tab.id ? 700 : 400,
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px',
                  transition: 'color 0.1s',
                  marginBottom: '-1px',
                }}
              >
                {tab.label}
                {tab.badge !== undefined && tab.badge > 0 && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    minWidth: '18px', height: '18px',
                    borderRadius: '9px',
                    backgroundColor: '#f59e0b',
                    color: '#fff', fontSize: '10px', fontWeight: 800,
                    padding: '0 4px',
                  }}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'overview' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                  Recent Workflow Runs
                </h3>
                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                  Last {Math.min(workflowRuns.length, 10)} runs
                </span>
              </div>
              <div style={{
                backgroundColor: 'var(--color-bg-card)',
                border: '1px solid var(--color-stroke)',
                borderRadius: '12px',
                overflow: 'hidden',
              }}>
                <WorkflowStatusTimeline runs={workflowRuns} actionLog={actionLog} />
              </div>
            </div>
          )}

          {activeTab === 'campaigns' && (
            isLoading ? (
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px',
              }}>
                {[1, 2, 3].map(i => (
                  <div key={i} style={{
                    height: '220px', borderRadius: '12px',
                    backgroundColor: 'var(--color-bg-card)',
                    border: '1px solid var(--color-stroke)',
                    animation: 'pulse 1.5s ease-in-out infinite',
                  }} />
                ))}
              </div>
            ) : campaigns.length === 0 ? (
              <div style={{
                textAlign: 'center', padding: '64px 24px',
                backgroundColor: 'var(--color-bg-card)',
                borderRadius: '12px', border: '1px dashed var(--color-stroke)',
                color: 'var(--color-text-muted)', fontSize: '14px',
              }}>
                <div style={{ fontWeight: 600, marginBottom: '6px' }}>No campaigns found</div>
                <div style={{ fontSize: '13px' }}>Connect a Meta or Google Ads account and sync campaigns.</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
                {campaigns.map(c => (
                  <CampaignMetricsCard key={c.id} campaign={c} />
                ))}
              </div>
            )
          )}

          {activeTab === 'approvals' && (
            <div>
              <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--color-text-muted)' }}>
                Actions flagged by the Decision Agent for human review before execution. Creative refreshes always appear here.
              </p>
              <ActionApprovalPanel items={approvalQueue} />
            </div>
          )}

          {activeTab === 'settings' && (
            <div style={{
              backgroundColor: 'var(--color-bg-card)',
              border: '1px solid var(--color-stroke)',
              borderRadius: '12px', padding: '28px',
            }}>
              <GuardrailConfigPanel />
            </div>
          )}
        </>
      )}
    </div>
  )
}
