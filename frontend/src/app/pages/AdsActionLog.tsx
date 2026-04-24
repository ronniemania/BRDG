import { useEffect, useState } from 'react'
import { Download, ChevronDown, ChevronUp, Brain, GitBranch, Zap } from 'lucide-react'
import { useAdsStore } from '../store/adsStore'
import type { AdsActionLogEntry, AdsPlatform, ActionStatus } from '../store/adsStore'

const STATUS_COLORS: Record<ActionStatus, string> = {
  PENDING: '#6b7280',
  APPROVED: '#3b82f6',
  REJECTED: '#9ca3af',
  EXECUTED: '#22c55e',
  FAILED: '#ef4444',
  AWAITING_HUMAN: '#f59e0b',
}

function StatusChip({ status }: { status: ActionStatus }) {
  const color = STATUS_COLORS[status]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '2px 8px', borderRadius: '9999px',
      fontSize: '10px', fontWeight: 700,
      backgroundColor: `${color}20`, color,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: '5px', height: '5px', borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
      {status.replace(/_/g, ' ')}
    </span>
  )
}

const ACTION_LABELS: Record<string, string> = {
  INCREASE_BUDGET: 'Increase Budget',
  DECREASE_BUDGET: 'Decrease Budget',
  PAUSE_CAMPAIGN: 'Pause Campaign',
  PAUSE_ADSET: 'Pause Ad Set',
  FLAG_CREATIVE_FATIGUE: 'Flag Creative Fatigue',
  ADJUST_BID: 'Adjust Bid',
  CREATIVE_REFRESH: 'Creative Refresh',
}

const AGENT_META: Record<string, { label: string; layer: string; icon: React.ReactNode; color: string }> = {
  'agent-ads-analyst': { label: 'Analyst', layer: 'Intelligence', icon: <Brain size={10} />, color: '#8b5cf6' },
  'agent-ads-decision': { label: 'Decision', layer: 'Decision', icon: <GitBranch size={10} />, color: '#3b82f6' },
  'agent-ads-executor': { label: 'Executor', layer: 'Execution', icon: <Zap size={10} />, color: '#22c55e' },
  'agent-ads-creative': { label: 'Creative', layer: 'Intelligence', icon: <Brain size={10} />, color: '#8b5cf6' },
  'agent-ads-reporter': { label: 'Reporter', layer: 'Execution', icon: <Zap size={10} />, color: '#22c55e' },
}

function AgentChip({ agentId }: { agentId: string }) {
  const meta = AGENT_META[agentId]
  if (!meta) return <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{agentId}</span>
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '3px',
      padding: '2px 7px', borderRadius: '4px',
      fontSize: '10px', fontWeight: 700,
      backgroundColor: `${meta.color}18`, color: meta.color,
    }}>
      {meta.icon}
      {meta.label}
    </span>
  )
}

interface ExpandedRowProps {
  log: AdsActionLogEntry
}

function ExpandedRow({ log }: ExpandedRowProps) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr',
      gap: '12px', padding: '14px 20px',
      backgroundColor: 'var(--color-bg-base)',
      borderTop: '1px solid var(--color-stroke)',
    }}>
      <div>
        <div style={{
          fontSize: '10px', fontWeight: 800, color: 'var(--color-text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px',
        }}>Before</div>
        <pre style={{
          fontSize: '11px', color: 'var(--color-text-primary)', margin: 0,
          whiteSpace: 'pre-wrap', fontFamily: 'monospace',
          backgroundColor: 'var(--color-bg-card)',
          border: '1px solid var(--color-stroke)',
          borderRadius: '6px', padding: '8px',
          maxHeight: '140px', overflow: 'auto',
        }}>
          {JSON.stringify(log.beforeState, null, 2)}
        </pre>
      </div>
      <div>
        <div style={{
          fontSize: '10px', fontWeight: 800, color: 'var(--color-text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '6px',
        }}>After</div>
        <pre style={{
          fontSize: '11px', color: 'var(--color-text-primary)', margin: 0,
          whiteSpace: 'pre-wrap', fontFamily: 'monospace',
          backgroundColor: 'var(--color-bg-card)',
          border: '1px solid var(--color-stroke)',
          borderRadius: '6px', padding: '8px',
          maxHeight: '140px', overflow: 'auto',
        }}>
          {log.afterState ? JSON.stringify(log.afterState, null, 2) : '—'}
        </pre>
      </div>
      {log.reason && (
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{
            fontSize: '10px', fontWeight: 800, color: 'var(--color-text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px',
          }}>Reason</div>
          <div style={{
            fontSize: '12px', color: 'var(--color-text-secondary)',
            backgroundColor: 'var(--color-bg-card)',
            border: '1px solid var(--color-stroke)',
            borderRadius: '6px', padding: '8px 12px',
            borderLeft: '3px solid var(--color-stroke)',
          }}>
            {log.reason}
          </div>
        </div>
      )}
      {log.errorMessage && (
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={{
            fontSize: '10px', fontWeight: 800, color: '#ef4444',
            textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '4px',
          }}>Error</div>
          <div style={{
            fontSize: '12px', color: '#ef4444',
            backgroundColor: '#ef444410', border: '1px solid #ef444430',
            borderRadius: '6px', padding: '8px 12px',
          }}>
            {log.errorMessage}
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdsActionLog() {
  const { actionLog, fetchActionLog, selectedBrandId } = useAdsStore()
  const [platformFilter, setPlatformFilter] = useState<AdsPlatform | ''>('')
  const [statusFilter, setStatusFilter] = useState<ActionStatus | ''>('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedBrandId) return
    fetchActionLog({
      platform: platformFilter || undefined,
      status: statusFilter || undefined,
    })
  }, [selectedBrandId, platformFilter, statusFilter])

  const exportCsv = () => {
    const headers = ['Timestamp', 'Agent', 'Layer', 'Action', 'Platform', 'Entity Type', 'External ID', 'Status', 'Reason']
    const rows = actionLog.map(l => {
      const meta = AGENT_META[l.agentId]
      return [
        l.createdAt,
        meta?.label ?? l.agentId,
        meta?.layer ?? 'Unknown',
        ACTION_LABELS[l.action] ?? l.action,
        l.platform,
        l.entityType,
        l.externalId ?? '',
        l.status,
        `"${l.reason.replace(/"/g, '""')}"`,
      ]
    })
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ads-action-log-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const selectStyle: React.CSSProperties = {
    padding: '7px 12px',
    borderRadius: '7px',
    border: '1px solid var(--color-stroke)',
    backgroundColor: 'var(--color-bg-card)',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    cursor: 'pointer',
    outline: 'none',
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1280px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <h1 style={{ margin: '0 0 4px', fontSize: '20px', fontWeight: 800, color: 'var(--color-text-primary)' }}>
            Ads Action Log
          </h1>
          <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-muted)' }}>
            Full audit trail — who decided, why, what changed, outcome
          </p>
        </div>
        <button
          onClick={exportCsv}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 14px', borderRadius: '8px',
            border: '1px solid var(--color-stroke)',
            backgroundColor: 'transparent',
            color: 'var(--color-text-primary)',
            fontSize: '13px', cursor: 'pointer',
          }}
        >
          <Download size={13} />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={platformFilter} onChange={e => setPlatformFilter(e.target.value as AdsPlatform | '')} style={selectStyle}>
          <option value="">All Platforms</option>
          <option value="META">Meta</option>
          <option value="GOOGLE">Google</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as ActionStatus | '')} style={selectStyle}>
          <option value="">All Statuses</option>
          <option value="EXECUTED">Executed</option>
          <option value="AWAITING_HUMAN">Awaiting Human</option>
          <option value="REJECTED">Rejected</option>
          <option value="FAILED">Failed</option>
          <option value="APPROVED">Approved</option>
          <option value="PENDING">Pending</option>
        </select>
        <div style={{ display: 'flex', gap: '6px', marginLeft: '4px' }}>
          {['Intelligence', 'Decision', 'Execution'].map(layer => {
            const meta = Object.values(AGENT_META).find(m => m.layer === layer)
            return (
              <span key={layer} style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                padding: '3px 8px', borderRadius: '5px',
                fontSize: '11px', fontWeight: 600,
                backgroundColor: `${meta?.color}14`, color: meta?.color,
              }}>
                {meta?.icon} {layer}
              </span>
            )
          })}
        </div>
        <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginLeft: 'auto' }}>
          {actionLog.length} entries
        </span>
      </div>

      {/* Table */}
      <div style={{
        backgroundColor: 'var(--color-bg-card)',
        border: '1px solid var(--color-stroke)',
        borderRadius: '12px',
        overflow: 'hidden',
      }}>
        {/* Table header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '140px 100px 170px 80px 130px 110px 28px',
          padding: '10px 20px',
          backgroundColor: 'var(--color-bg-base)',
          borderBottom: '1px solid var(--color-stroke)',
          fontSize: '10px', fontWeight: 800,
          color: 'var(--color-text-muted)',
          textTransform: 'uppercase', letterSpacing: '0.07em',
        }}>
          <div>Timestamp</div>
          <div>Agent</div>
          <div>Action</div>
          <div>Platform</div>
          <div>Entity</div>
          <div>Status</div>
          <div />
        </div>

        {actionLog.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '56px',
            color: 'var(--color-text-muted)', fontSize: '13px',
          }}>
            No action log entries found for current filters.
          </div>
        ) : (
          actionLog.map((log, idx) => {
            const isExpanded = expandedId === log.id
            const statusColor = STATUS_COLORS[log.status] ?? '#6b7280'
            return (
              <div key={log.id} style={{
                borderBottom: idx < actionLog.length - 1 ? '1px solid var(--color-stroke)' : 'none',
                borderLeft: `3px solid ${statusColor}40`,
              }}>
                <div
                  onClick={() => setExpandedId(isExpanded ? null : log.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '140px 100px 170px 80px 130px 110px 28px',
                    padding: '11px 20px',
                    cursor: 'pointer',
                    transition: 'background-color 0.1s',
                    alignItems: 'center',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-bg-base)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                  <div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-primary)', fontWeight: 500 }}>
                      {new Date(log.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                      {new Date(log.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div>
                    <AgentChip agentId={log.agentId} />
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-primary)', fontWeight: 600 }}>
                    {ACTION_LABELS[log.action] ?? log.action}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    {log.platform}
                  </div>
                  <div style={{
                    fontSize: '10px', color: 'var(--color-text-muted)',
                    fontFamily: 'monospace',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {log.externalId ?? log.entityId}
                  </div>
                  <div>
                    <StatusChip status={log.status} />
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: 'var(--color-text-muted)',
                  }}>
                    {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                  </div>
                </div>
                {isExpanded && <ExpandedRow log={log} />}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
