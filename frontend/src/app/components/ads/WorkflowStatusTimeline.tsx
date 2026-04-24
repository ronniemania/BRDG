import { CheckCircle, Clock, AlertCircle, Brain, GitBranch, Zap } from 'lucide-react'
import type { WorkflowRun } from '../../store/adsStore'
import type { AdsActionLogEntry } from '../../store/adsStore'

interface Props {
  runs: WorkflowRun[]
  actionLog: AdsActionLogEntry[]
}

function getRunStats(run: WorkflowRun, actionLog: AdsActionLogEntry[]) {
  const runLogs = actionLog.filter(l => l.workflowRunId === run.workflowRunId)
  return {
    executed: runLogs.filter(l => l.status === 'EXECUTED').length,
    rejected: runLogs.filter(l => l.status === 'REJECTED').length,
    awaitingHuman: runLogs.filter(l => l.status === 'AWAITING_HUMAN').length,
    failed: runLogs.filter(l => l.status === 'FAILED').length,
    total: runLogs.length,
  }
}

function RunStatusDot({ stats }: { stats: ReturnType<typeof getRunStats> }) {
  if (stats.failed > 0) {
    return (
      <div style={{
        width: '32px', height: '32px', borderRadius: '50%',
        backgroundColor: '#ef444420', border: '2px solid #ef4444',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <AlertCircle size={15} style={{ color: '#ef4444' }} />
      </div>
    )
  }
  if (stats.awaitingHuman > 0) {
    return (
      <div style={{
        width: '32px', height: '32px', borderRadius: '50%',
        backgroundColor: '#f59e0b20', border: '2px solid #f59e0b',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Clock size={15} style={{ color: '#f59e0b' }} />
      </div>
    )
  }
  return (
    <div style={{
      width: '32px', height: '32px', borderRadius: '50%',
      backgroundColor: '#22c55e20', border: '2px solid #22c55e',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <CheckCircle size={15} style={{ color: '#22c55e' }} />
    </div>
  )
}

// Compact agent pipeline indicator
function AgentPipeline() {
  const steps = [
    { icon: <Brain size={10} />, label: 'Analyst', color: '#8b5cf6' },
    { icon: <GitBranch size={10} />, label: 'Decision', color: '#3b82f6' },
    { icon: <Zap size={10} />, label: 'Executor', color: '#22c55e' },
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      {steps.map((step, i) => (
        <div key={step.label} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '3px',
            padding: '2px 6px', borderRadius: '4px',
            backgroundColor: `${step.color}18`, color: step.color,
            fontSize: '10px', fontWeight: 600,
          }}>
            {step.icon}
            {step.label}
          </div>
          {i < steps.length - 1 && (
            <div style={{ width: '12px', height: '1px', backgroundColor: 'var(--color-stroke)' }} />
          )}
        </div>
      ))}
    </div>
  )
}

export default function WorkflowStatusTimeline({ runs, actionLog }: Props) {
  if (runs.length === 0) {
    return (
      <div style={{
        textAlign: 'center', padding: '48px 24px',
        color: 'var(--color-text-muted)', fontSize: '13px',
      }}>
        <div style={{
          display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
        }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '50%',
            border: '2px dashed var(--color-stroke)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Clock size={18} style={{ opacity: 0.4 }} />
          </div>
          <div>No workflow runs yet</div>
          <div style={{ fontSize: '12px' }}>Trigger a manual run or wait for the daily 06:00 UTC schedule.</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      {/* Header row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '32px 180px 1fr auto',
        gap: '12px',
        padding: '10px 20px',
        borderBottom: '1px solid var(--color-stroke)',
        fontSize: '10px',
        fontWeight: 700,
        color: 'var(--color-text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}>
        <div />
        <div>Run Time</div>
        <div>Outcomes</div>
        <div>Run ID</div>
      </div>

      {/* Vertical line */}
      <div style={{
        position: 'absolute',
        left: '36px',
        top: '41px',
        bottom: '20px',
        width: '1px',
        backgroundColor: 'var(--color-stroke)',
        zIndex: 0,
      }} />

      {runs.slice(0, 10).map((run, idx) => {
        const stats = getRunStats(run, actionLog)
        const date = new Date(run.createdAt)
        const isLatest = idx === 0

        return (
          <div key={run.workflowRunId} style={{
            display: 'grid',
            gridTemplateColumns: '32px 180px 1fr auto',
            gap: '12px',
            padding: '14px 20px',
            alignItems: 'center',
            position: 'relative',
            backgroundColor: isLatest ? 'var(--color-bg-base)' : 'transparent',
            borderBottom: idx < runs.length - 1 && idx < 9 ? '1px solid var(--color-stroke)' : 'none',
          }}>
            {/* Status dot (on top of vertical line) */}
            <div style={{ position: 'relative', zIndex: 1 }}>
              <RunStatusDot stats={stats} />
            </div>

            {/* Date/time */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
                  {date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </div>
                {isLatest && (
                  <span style={{
                    padding: '1px 6px', borderRadius: '4px',
                    fontSize: '9px', fontWeight: 800,
                    backgroundColor: 'var(--color-accent)22',
                    color: 'var(--color-accent)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}>
                    Latest
                  </span>
                )}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '2px' }}>
                {date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>

            {/* Stats + pipeline */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {stats.executed > 0 && (
                  <span style={{
                    padding: '2px 8px', borderRadius: '9999px',
                    fontSize: '11px', fontWeight: 700,
                    backgroundColor: '#22c55e18', color: '#22c55e',
                  }}>
                    {stats.executed} executed
                  </span>
                )}
                {stats.awaitingHuman > 0 && (
                  <span style={{
                    padding: '2px 8px', borderRadius: '9999px',
                    fontSize: '11px', fontWeight: 700,
                    backgroundColor: '#f59e0b18', color: '#b45309',
                  }}>
                    {stats.awaitingHuman} needs review
                  </span>
                )}
                {stats.rejected > 0 && (
                  <span style={{
                    padding: '2px 8px', borderRadius: '9999px',
                    fontSize: '11px', fontWeight: 700,
                    backgroundColor: '#6b728018', color: '#6b7280',
                  }}>
                    {stats.rejected} rejected
                  </span>
                )}
                {stats.failed > 0 && (
                  <span style={{
                    padding: '2px 8px', borderRadius: '9999px',
                    fontSize: '11px', fontWeight: 700,
                    backgroundColor: '#ef444418', color: '#ef4444',
                  }}>
                    {stats.failed} failed
                  </span>
                )}
                {stats.total === 0 && (
                  <span style={{ fontSize: '12px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
                    No actions taken
                  </span>
                )}
              </div>
              {isLatest && <AgentPipeline />}
            </div>

            {/* Run ID */}
            <div style={{
              fontSize: '10px', color: 'var(--color-text-muted)',
              fontFamily: 'monospace',
              backgroundColor: 'var(--color-bg-base)',
              padding: '3px 7px', borderRadius: '4px',
              border: '1px solid var(--color-stroke)',
            }}>
              …{run.workflowRunId.slice(-10)}
            </div>
          </div>
        )
      })}
    </div>
  )
}
