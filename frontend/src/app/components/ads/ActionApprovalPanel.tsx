import { useState } from 'react'
import { CheckCircle, XCircle, AlertTriangle, GitBranch, ChevronDown, ChevronUp } from 'lucide-react'
import { useAdsStore } from '../../store/adsStore'
import type { AdsActionLogEntry } from '../../store/adsStore'

function ConfidenceBar({ score }: { score?: number }) {
  if (score === undefined) return null
  const pct = Math.round(score * 100)
  const color = score >= 0.85 ? '#22c55e' : score >= 0.75 ? '#f59e0b' : '#ef4444'
  const label = score >= 0.85 ? 'High confidence' : score >= 0.75 ? 'Medium confidence' : 'Low confidence'
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>{label}</span>
        <span style={{ fontSize: '11px', fontWeight: 700, color }}>{pct}%</span>
      </div>
      <div style={{ height: '4px', backgroundColor: 'var(--color-stroke)', borderRadius: '2px', overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          backgroundColor: color, borderRadius: '2px',
          transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
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

const ACTION_RISK: Record<string, { level: string; color: string }> = {
  INCREASE_BUDGET: { level: 'Medium', color: '#f59e0b' },
  DECREASE_BUDGET: { level: 'Low', color: '#22c55e' },
  PAUSE_CAMPAIGN: { level: 'High', color: '#ef4444' },
  PAUSE_ADSET: { level: 'Medium', color: '#f59e0b' },
  FLAG_CREATIVE_FATIGUE: { level: 'Low', color: '#22c55e' },
  ADJUST_BID: { level: 'Low', color: '#22c55e' },
  CREATIVE_REFRESH: { level: 'Low', color: '#22c55e' },
}

interface Props {
  items: AdsActionLogEntry[]
}

export default function ActionApprovalPanel({ items }: Props) {
  const { approveAction, rejectAction } = useAdsStore()
  const [rejectId, setRejectId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const handleApprove = async (id: string) => {
    setProcessingId(id)
    try { await approveAction(id) } finally { setProcessingId(null) }
  }

  const handleReject = async (id: string) => {
    setProcessingId(id)
    try {
      await rejectAction(id, rejectReason || 'Rejected by reviewer')
      setRejectId(null)
      setRejectReason('')
    } finally { setProcessingId(null) }
  }

  if (items.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: '56px 24px',
        backgroundColor: 'var(--color-bg-card)',
        border: '1px solid var(--color-stroke)',
        borderRadius: '12px',
      }}>
        <div style={{
          width: '48px', height: '48px', borderRadius: '50%',
          backgroundColor: '#22c55e18', margin: '0 auto 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <CheckCircle size={24} style={{ color: '#22c55e' }} />
        </div>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: '4px' }}>
          All clear
        </div>
        <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
          No items awaiting approval
        </div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {items.map(item => {
        const before = item.beforeState as Record<string, unknown>
        const confidence = before?.confidence as number | undefined
        const risk = ACTION_RISK[item.action]
        const isExpanded = expandedId === item.id
        const isProcessing = processingId === item.id

        return (
          <div key={item.id} style={{
            backgroundColor: 'var(--color-bg-card)',
            border: '1px solid var(--color-stroke)',
            borderRadius: '12px',
            overflow: 'hidden',
          }}>
            {/* Top accent bar */}
            <div style={{
              height: '3px',
              backgroundColor: risk?.color ?? '#f59e0b',
            }} />

            <div style={{ padding: '16px' }}>
              {/* Header row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <AlertTriangle size={14} style={{ color: '#f59e0b', flexShrink: 0 }} />
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      {ACTION_LABELS[item.action] ?? item.action}
                    </span>
                    {risk && (
                      <span style={{
                        padding: '1px 7px', borderRadius: '4px',
                        fontSize: '10px', fontWeight: 700,
                        backgroundColor: `${risk.color}18`, color: risk.color,
                      }}>
                        {risk.level} risk
                      </span>
                    )}
                    {/* Decision Agent badge */}
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: '3px',
                      padding: '1px 7px', borderRadius: '4px',
                      fontSize: '10px', fontWeight: 700,
                      backgroundColor: '#3b82f618', color: '#3b82f6',
                    }}>
                      <GitBranch size={9} />
                      Decision Agent
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                    {item.platform} · {item.entityType} · <span style={{ fontFamily: 'monospace' }}>{item.externalId ?? item.entityId}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    {new Date(item.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                    {new Date(item.createdAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>

              {/* Confidence bar */}
              {confidence !== undefined && (
                <div style={{ marginBottom: '10px' }}>
                  <ConfidenceBar score={confidence} />
                </div>
              )}

              {/* Reason */}
              <div style={{
                fontSize: '13px', color: 'var(--color-text-secondary)',
                backgroundColor: 'var(--color-bg-base)',
                borderRadius: '8px', padding: '10px 12px',
                marginBottom: '12px',
                borderLeft: '3px solid var(--color-stroke)',
              }}>
                {item.reason}
              </div>

              {/* Expand params */}
              {Object.keys(before ?? {}).length > 0 && (
                <div style={{ marginBottom: '12px' }}>
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      background: 'none', border: 'none',
                      fontSize: '11px', color: 'var(--color-text-muted)',
                      cursor: 'pointer', padding: 0,
                    }}
                  >
                    {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    {isExpanded ? 'Hide' : 'View'} parameters
                  </button>
                  {isExpanded && (
                    <pre style={{
                      fontSize: '11px', color: 'var(--color-text-primary)',
                      backgroundColor: 'var(--color-bg-base)',
                      borderRadius: '6px', padding: '10px', marginTop: '6px',
                      overflow: 'auto', maxHeight: '160px',
                      border: '1px solid var(--color-stroke)',
                    }}>
                      {JSON.stringify(before, null, 2)}
                    </pre>
                  )}
                </div>
              )}

              {/* Reject reason input */}
              {rejectId === item.id && (
                <div style={{ marginBottom: '10px' }}>
                  <input
                    type="text"
                    placeholder="Rejection reason (optional)"
                    value={rejectReason}
                    onChange={e => setRejectReason(e.target.value)}
                    autoFocus
                    style={{
                      width: '100%', padding: '8px 12px',
                      borderRadius: '6px',
                      border: '1px solid #ef444460',
                      backgroundColor: 'var(--color-bg-base)',
                      color: 'var(--color-text-primary)',
                      fontSize: '13px', boxSizing: 'border-box',
                      outline: 'none',
                    }}
                  />
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => handleApprove(item.id)}
                  disabled={isProcessing}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    padding: '7px 16px', borderRadius: '7px',
                    border: 'none',
                    backgroundColor: isProcessing ? '#22c55e60' : '#22c55e',
                    color: '#fff', fontSize: '13px', fontWeight: 700,
                    cursor: isProcessing ? 'not-allowed' : 'pointer',
                    transition: 'opacity 0.15s',
                  }}
                >
                  <CheckCircle size={13} />
                  {isProcessing ? 'Processing…' : 'Approve'}
                </button>

                {rejectId === item.id ? (
                  <>
                    <button
                      onClick={() => handleReject(item.id)}
                      disabled={isProcessing}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '5px',
                        padding: '7px 16px', borderRadius: '7px',
                        border: '1px solid #ef4444',
                        backgroundColor: 'transparent',
                        color: '#ef4444', fontSize: '13px', fontWeight: 700,
                        cursor: isProcessing ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <XCircle size={13} />
                      Confirm Reject
                    </button>
                    <button
                      onClick={() => { setRejectId(null); setRejectReason('') }}
                      style={{
                        padding: '7px 14px', borderRadius: '7px',
                        border: '1px solid var(--color-stroke)',
                        backgroundColor: 'transparent',
                        color: 'var(--color-text-muted)',
                        fontSize: '13px', cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setRejectId(item.id)}
                    disabled={isProcessing}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '5px',
                      padding: '7px 14px', borderRadius: '7px',
                      border: '1px solid var(--color-stroke)',
                      backgroundColor: 'transparent',
                      color: 'var(--color-text-muted)',
                      fontSize: '13px', cursor: isProcessing ? 'not-allowed' : 'pointer',
                    }}
                  >
                    <XCircle size={13} />
                    Reject
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
