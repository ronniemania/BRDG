import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts'
import type { CampaignWithMetrics } from '../../store/adsStore'

interface Props {
  campaign: CampaignWithMetrics
}

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: '#22c55e',
  PAUSED: '#f59e0b',
  ARCHIVED: '#6b7280',
  DELETED: '#ef4444',
  PENDING: '#3b82f6',
}

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? '#6b7280'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      padding: '2px 8px', borderRadius: '9999px',
      fontSize: '10px', fontWeight: 700,
      backgroundColor: `${color}20`, color,
    }}>
      <span style={{
        width: '5px', height: '5px', borderRadius: '50%',
        backgroundColor: color, flexShrink: 0,
      }} />
      {status}
    </span>
  )
}

function PlatformBadge({ platform }: { platform: string }) {
  const isMeta = platform === 'META'
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px', borderRadius: '4px',
      fontSize: '10px', fontWeight: 800,
      backgroundColor: isMeta ? '#1877f218' : '#4285f418',
      color: isMeta ? '#1877f2' : '#4285f4',
      letterSpacing: '0.04em',
    }}>
      {platform}
    </span>
  )
}

function MetricCell({ label, value, trend }: { label: string; value: string; trend?: number }) {
  const TrendIcon = trend === undefined ? null : trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : null
  const trendColor = trend === undefined ? '' : trend > 0 ? '#22c55e' : '#ef4444'

  return (
    <div style={{
      padding: '8px', borderRadius: '8px',
      backgroundColor: 'var(--color-bg-base)',
      textAlign: 'center',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{value}</span>
        {TrendIcon && trend !== undefined && (
          <TrendIcon size={11} style={{ color: trendColor }} />
        )}
      </div>
      <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
    </div>
  )
}

export default function CampaignMetricsCard({ campaign }: Props) {
  const latestMetric = campaign.metrics[campaign.metrics.length - 1]
  const prevMetric = campaign.metrics.length >= 2 ? campaign.metrics[campaign.metrics.length - 2] : null
  const roasData = campaign.metrics.map(m => ({ date: m.dateKey, roas: Number(m.roas) }))
  const spend7d = campaign.metrics.reduce((s, m) => s + m.spendCents, 0)
  const budget = campaign.dailyBudgetCents ?? 0
  const utilisation = budget > 0 ? Math.min((spend7d / 7 / budget) * 100, 100) : 0
  const isFatigued = campaign.metrics.some(m => (m.frequencyScore ?? 0) > 4)

  const currentRoas = latestMetric ? Number(latestMetric.roas) : 0
  const prevRoas = prevMetric ? Number(prevMetric.roas) : null
  const roasTrend = prevRoas ? ((currentRoas - prevRoas) / prevRoas) * 100 : undefined

  const utilisationColor = utilisation > 90 ? '#22c55e' : utilisation > 60 ? '#f59e0b' : '#ef4444'
  const roasColor = currentRoas >= 3 ? '#22c55e' : currentRoas >= 1.5 ? '#f59e0b' : '#ef4444'

  return (
    <div style={{
      backgroundColor: 'var(--color-bg-card)',
      border: `1px solid ${isFatigued ? '#ef444440' : 'var(--color-stroke)'}`,
      borderRadius: '12px',
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      transition: 'box-shadow 0.15s',
    }}
    onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)')}
    onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: '5px', alignItems: 'center', marginBottom: '5px', flexWrap: 'wrap' }}>
            <PlatformBadge platform={campaign.platform} />
            <StatusBadge status={campaign.status} />
            {isFatigued && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '3px',
                padding: '2px 7px', borderRadius: '9999px',
                fontSize: '10px', fontWeight: 700,
                backgroundColor: '#ef444420', color: '#ef4444',
              }}>
                <AlertTriangle size={10} />
                FATIGUE
              </span>
            )}
          </div>
          <div style={{
            fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            maxWidth: '200px',
          }} title={campaign.name}>
            {campaign.name}
          </div>
          <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px', fontFamily: 'monospace' }}>
            {campaign.externalId}
          </div>
        </div>

        {/* ROAS highlight */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '24px', fontWeight: 900, color: roasColor, lineHeight: 1 }}>
            {latestMetric ? Number(latestMetric.roas).toFixed(2) : '—'}×
          </div>
          <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '2px' }}>ROAS</div>
          {roasTrend !== undefined && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '2px',
              justifyContent: 'flex-end', marginTop: '2px',
            }}>
              {roasTrend > 0
                ? <TrendingUp size={10} style={{ color: '#22c55e' }} />
                : <TrendingDown size={10} style={{ color: '#ef4444' }} />}
              <span style={{ fontSize: '10px', color: roasTrend > 0 ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                {Math.abs(roasTrend).toFixed(1)}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ROAS Sparkline */}
      {roasData.length > 1 && (
        <div style={{ margin: '0 -4px' }}>
          <ResponsiveContainer width="100%" height={44}>
            <LineChart data={roasData}>
              <Line
                type="monotone"
                dataKey="roas"
                stroke={roasColor}
                strokeWidth={2}
                dot={false}
              />
              <Tooltip
                contentStyle={{
                  fontSize: '11px',
                  backgroundColor: 'var(--color-bg-card)',
                  border: '1px solid var(--color-stroke)',
                  borderRadius: '6px',
                  padding: '4px 8px',
                }}
                formatter={(v: unknown) => [`${(v as number).toFixed(2)}×`, 'ROAS']}
                labelFormatter={(l: unknown) => String(l)}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
        <MetricCell
          label="CPA"
          value={latestMetric ? `$${Number(latestMetric.cpa).toFixed(2)}` : '—'}
        />
        <MetricCell
          label="CTR"
          value={latestMetric ? `${(Number(latestMetric.ctr) * 100).toFixed(2)}%` : '—'}
        />
        <MetricCell
          label="Spend 7d"
          value={`$${(spend7d / 100).toFixed(0)}`}
        />
      </div>

      {/* Budget utilisation */}
      {budget > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px' }}>
            <span style={{ fontSize: '10px', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Budget Utilisation
            </span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: utilisationColor }}>
              {utilisation.toFixed(0)}%
            </span>
          </div>
          <div style={{
            height: '5px',
            backgroundColor: 'var(--color-stroke)',
            borderRadius: '3px',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${utilisation}%`,
              backgroundColor: utilisationColor,
              borderRadius: '3px',
              transition: 'width 0.4s ease',
            }} />
          </div>
          <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            ${(spend7d / 7 / 100).toFixed(0)}/day avg · ${(budget / 100).toFixed(0)}/day budget
          </div>
        </div>
      )}
    </div>
  )
}
