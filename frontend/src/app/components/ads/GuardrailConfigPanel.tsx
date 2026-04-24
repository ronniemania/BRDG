import { useState, useEffect } from 'react'
import { Shield, Save, Check, Lock, Unlock } from 'lucide-react'
import { useAdsStore } from '../../store/adsStore'
import type { AdsGuardrailConfig } from '../../store/adsStore'

const ALL_ACTIONS = [
  { key: 'INCREASE_BUDGET', label: 'Increase Budget', risk: 'medium' },
  { key: 'DECREASE_BUDGET', label: 'Decrease Budget', risk: 'low' },
  { key: 'PAUSE_CAMPAIGN', label: 'Pause Campaign', risk: 'high' },
  { key: 'PAUSE_ADSET', label: 'Pause Ad Set', risk: 'medium' },
  { key: 'FLAG_CREATIVE_FATIGUE', label: 'Flag Creative Fatigue', risk: 'low' },
  { key: 'ADJUST_BID', label: 'Adjust Bid', risk: 'low' },
]

const RISK_COLORS: Record<string, string> = {
  low: '#22c55e',
  medium: '#f59e0b',
  high: '#ef4444',
}

export default function GuardrailConfigPanel() {
  const { guardrailConfig, updateGuardrailConfig, selectedAdsAccountId } = useAdsStore()
  const [form, setForm] = useState<AdsGuardrailConfig | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (guardrailConfig) setForm({ ...guardrailConfig })
  }, [guardrailConfig])

  if (!selectedAdsAccountId) {
    return (
      <div style={{
        textAlign: 'center', padding: '48px',
        color: 'var(--color-text-muted)', fontSize: '13px',
      }}>
        Select an ads account to configure guardrails.
      </div>
    )
  }

  if (!form) {
    return (
      <div style={{ color: 'var(--color-text-muted)', fontSize: '13px', padding: '24px' }}>
        Loading guardrail config…
      </div>
    )
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateGuardrailConfig(form)
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } finally {
      setSaving(false)
    }
  }

  const toggleAction = (action: string) => {
    const allowed = form.allowedActions.includes(action)
      ? form.allowedActions.filter(a => a !== action)
      : [...form.allowedActions, action]
    setForm({ ...form, allowedActions: allowed })
  }

  const sliders = [
    {
      label: 'Confidence Threshold',
      key: 'confidenceThreshold' as const,
      min: 0.5, max: 0.99, step: 0.01,
      format: (v: number) => `${(v * 100).toFixed(0)}%`,
      description: 'Minimum agent confidence to auto-approve',
      color: '#8b5cf6',
    },
    {
      label: 'Max Budget Increase / Run',
      key: 'maxDailyBudgetIncrPct' as const,
      min: 1, max: 25, step: 1,
      format: (v: number) => `+${v}%`,
      description: 'Maximum single-run budget increase cap',
      color: '#3b82f6',
    },
    {
      label: 'Min Spend Threshold',
      key: 'minSpendThresholdCents' as const,
      min: 0, max: 100000, step: 500,
      format: (v: number) => `$${(v / 100).toFixed(0)}`,
      description: 'Spend required before budget actions fire',
      color: '#f59e0b',
    },
    {
      label: 'Cooldown Period',
      key: 'cooldownHours' as const,
      min: 1, max: 72, step: 1,
      format: (v: number) => `${v}h`,
      description: 'Wait between actions on the same entity',
      color: '#22c55e',
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', maxWidth: '620px' }}>
      {/* Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '10px',
          backgroundColor: 'var(--color-accent)20',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Shield size={18} style={{ color: 'var(--color-accent)' }} />
        </div>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--color-text-primary)' }}>
            Guardrail Configuration
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
            8 rules enforced server-side before every execution
          </div>
        </div>
      </div>

      {/* Manual approval toggle */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 16px',
        backgroundColor: form.manualApprovalMode ? '#f59e0b0e' : 'var(--color-bg-base)',
        borderRadius: '10px',
        border: `1px solid ${form.manualApprovalMode ? '#f59e0b40' : 'var(--color-stroke)'}`,
        transition: 'all 0.2s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {form.manualApprovalMode
            ? <Lock size={16} style={{ color: '#f59e0b' }} />
            : <Unlock size={16} style={{ color: 'var(--color-text-muted)' }} />}
          <div>
            <div style={{
              fontSize: '13px', fontWeight: 700,
              color: form.manualApprovalMode ? '#b45309' : 'var(--color-text-primary)',
            }}>
              Manual Approval Mode
              {form.manualApprovalMode && (
                <span style={{
                  marginLeft: '8px', padding: '1px 6px', borderRadius: '4px',
                  fontSize: '10px', fontWeight: 800,
                  backgroundColor: '#f59e0b20', color: '#f59e0b',
                }}>
                  ON
                </span>
              )}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '1px' }}>
              All actions require human review before execution
            </div>
          </div>
        </div>
        <button
          onClick={() => setForm({ ...form, manualApprovalMode: !form.manualApprovalMode })}
          style={{
            width: '46px', height: '26px', borderRadius: '13px',
            border: 'none', cursor: 'pointer',
            backgroundColor: form.manualApprovalMode ? '#f59e0b' : 'var(--color-stroke)',
            position: 'relative', transition: 'background-color 0.2s', flexShrink: 0,
          }}
        >
          <span style={{
            position: 'absolute',
            width: '20px', height: '20px', borderRadius: '50%',
            backgroundColor: '#fff',
            top: '3px',
            left: form.manualApprovalMode ? '23px' : '3px',
            transition: 'left 0.2s',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
          }} />
        </button>
      </div>

      {/* Sliders */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {sliders.map(({ label, key, min, max, step, format, description, color }) => {
          const value = form[key] as number
          const pct = ((value - min) / (max - min)) * 100
          return (
            <div key={key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--color-text-primary)' }}>{label}</div>
                  <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '1px' }}>{description}</div>
                </div>
                <span style={{
                  fontSize: '16px', fontWeight: 800, color,
                  minWidth: '52px', textAlign: 'right',
                }}>
                  {format(value)}
                </span>
              </div>
              {/* Custom slider track */}
              <div style={{ position: 'relative', height: '6px' }}>
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0,
                  height: '6px', borderRadius: '3px',
                  backgroundColor: 'var(--color-stroke)',
                }} />
                <div style={{
                  position: 'absolute', top: 0, left: 0,
                  width: `${pct}%`, height: '6px', borderRadius: '3px',
                  backgroundColor: color, transition: 'width 0.1s',
                }} />
                <input
                  type="range"
                  min={min} max={max} step={step} value={value}
                  onChange={e => setForm({ ...form, [key]: parseFloat(e.target.value) })}
                  style={{
                    position: 'absolute', top: '-4px', left: 0, right: 0,
                    width: '100%', opacity: 0, cursor: 'pointer', height: '14px',
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{format(min)}</span>
                <span style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>{format(max)}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Allowed Actions */}
      <div>
        <div style={{
          fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)',
          marginBottom: '10px',
        }}>
          Allowed Actions
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {ALL_ACTIONS.map(({ key, label, risk }) => {
            const enabled = form.allowedActions.includes(key)
            const riskColor = RISK_COLORS[risk]
            return (
              <button
                key={key}
                onClick={() => toggleAction(key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '5px 12px', borderRadius: '7px',
                  border: `1px solid ${enabled ? riskColor + '60' : 'var(--color-stroke)'}`,
                  backgroundColor: enabled ? `${riskColor}14` : 'transparent',
                  color: enabled ? riskColor : 'var(--color-text-muted)',
                  fontSize: '12px', fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {enabled && <Check size={11} />}
                {label}
                <span style={{
                  fontSize: '9px', fontWeight: 700, opacity: 0.7,
                  padding: '1px 4px', borderRadius: '3px',
                  backgroundColor: `${riskColor}20`,
                }}>
                  {risk}
                </span>
              </button>
            )
          })}
        </div>
        <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '8px' }}>
          {form.allowedActions.length} of {ALL_ACTIONS.length} actions enabled
        </div>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: '10px 22px', borderRadius: '9px',
          border: 'none',
          backgroundColor: saved ? '#22c55e' : saving ? 'var(--color-stroke)' : 'var(--color-accent)',
          color: saving ? 'var(--color-text-muted)' : '#fff',
          fontSize: '14px', fontWeight: 700,
          cursor: saving ? 'not-allowed' : 'pointer',
          alignSelf: 'flex-start',
          transition: 'background-color 0.2s',
        }}
      >
        {saved ? <Check size={15} /> : <Save size={15} />}
        {saved ? 'Saved!' : saving ? 'Saving…' : 'Save Configuration'}
      </button>
    </div>
  )
}
