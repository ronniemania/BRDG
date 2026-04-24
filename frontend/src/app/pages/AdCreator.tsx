import { useState, useEffect } from 'react'
import {
  Sparkles, Copy, Check, ChevronDown, RefreshCw, Send,
  Type, FileText, Hash, Target, Globe, Brain,
  AlertCircle, Info, ArrowRight, Zap,
} from 'lucide-react'
import { useStrategyStore, CopyInput, CopyVariants } from '../store/strategyStore'
import { useAdsStore } from '../store/adsStore'

// ─── Types ─────────────────────────────────────────────────────────────────────

interface CopyField {
  key: 'primaryText' | 'headline' | 'description'
  label: string
  icon: React.ReactNode
  charLimit: number
  placeholder: string
  multiline?: boolean
}

const META_FIELDS: CopyField[] = [
  {
    key: 'primaryText',
    label: 'Primary Text',
    icon: <FileText size={14} />,
    charLimit: 125,
    placeholder: 'Stop scrolling — this is for you.\n\nTired of [pain point]? We built [product] to solve exactly that...',
    multiline: true,
  },
  {
    key: 'headline',
    label: 'Headline',
    icon: <Hash size={14} />,
    charLimit: 40,
    placeholder: 'The benefit-driven headline',
  },
  {
    key: 'description',
    label: 'Description',
    icon: <Type size={14} />,
    charLimit: 30,
    placeholder: 'Short supporting text',
  },
]

const GOOGLE_FIELDS: CopyField[] = [
  {
    key: 'headline',
    label: 'Headline',
    icon: <Hash size={14} />,
    charLimit: 30,
    placeholder: 'Short, keyword-rich headline',
  },
  {
    key: 'description',
    label: 'Description',
    icon: <FileText size={14} />,
    charLimit: 90,
    placeholder: 'Compelling description with call to action',
    multiline: true,
  },
]

const OBJECTIVES = [
  { value: 'conversions', label: 'Conversions / Sales' },
  { value: 'leads', label: 'Lead Generation' },
  { value: 'traffic', label: 'Website Traffic' },
  { value: 'awareness', label: 'Brand Awareness' },
  { value: 'engagement', label: 'Engagement' },
  { value: 'app_installs', label: 'App Installs' },
]

const TONES = [
  { value: 'urgent', label: 'Urgent' },
  { value: 'friendly', label: 'Friendly' },
  { value: 'professional', label: 'Professional' },
  { value: 'bold', label: 'Bold' },
  { value: 'empathetic', label: 'Empathetic' },
  { value: 'playful', label: 'Playful' },
  { value: 'authoritative', label: 'Authoritative' },
]

const CTA_OPTIONS = ['SHOP_NOW', 'LEARN_MORE', 'SIGN_UP', 'GET_OFFER', 'BOOK_NOW', 'CONTACT_US', 'APPLY_NOW', 'DOWNLOAD']

// ─── Sub-components ───────────────────────────────────────────────────────────

function CharCounter({ value, limit }: { value: string; limit: number }) {
  const count = value.length
  const pct = (count / limit) * 100
  const color = pct > 100 ? '#ef4444' : pct > 85 ? '#f59e0b' : '#22c55e'
  return (
    <span style={{ fontSize: '11px', color, fontWeight: pct > 85 ? 700 : 400 }}>
      {count}/{limit}
    </span>
  )
}

function VariantCard({ text, rationale, tone, charCount, charLimit, onUse, isActive }: {
  text: string
  rationale?: string
  tone?: string
  charCount?: number
  charLimit: number
  onUse: () => void
  isActive: boolean
}) {
  const [copied, setCopied] = useState(false)
  const count = charCount ?? text.length
  const overLimit = count > charLimit
  const nearLimit = count > charLimit * 0.85

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const TONE_COLORS: Record<string, string> = {
    'pain-point': '#ef4444',
    'social-proof': '#3b82f6',
    'curiosity': '#8b5cf6',
    'direct-offer': '#22c55e',
    'story': '#f59e0b',
  }
  const toneColor = tone ? TONE_COLORS[tone] ?? '#6b7280' : '#6b7280'

  return (
    <div
      onClick={onUse}
      style={{
        padding: '12px 14px',
        borderRadius: '10px',
        border: `1.5px solid ${isActive ? 'var(--color-accent)' : 'var(--color-stroke)'}`,
        backgroundColor: isActive ? 'var(--color-accent)08' : 'var(--color-bg-base)',
        cursor: 'pointer',
        transition: 'all 0.15s',
        position: 'relative',
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--color-accent)60' }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.borderColor = 'var(--color-stroke)' }}
    >
      {/* Tone + active badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <div style={{ display: 'flex', gap: '5px' }}>
          {tone && (
            <span style={{
              padding: '1px 6px', borderRadius: '4px',
              fontSize: '9px', fontWeight: 800,
              backgroundColor: `${toneColor}18`, color: toneColor,
              textTransform: 'uppercase', letterSpacing: '0.06em',
            }}>
              {tone.replace('-', ' ')}
            </span>
          )}
          {isActive && (
            <span style={{
              padding: '1px 6px', borderRadius: '4px',
              fontSize: '9px', fontWeight: 800,
              backgroundColor: 'var(--color-accent)18', color: 'var(--color-accent)',
            }}>
              SELECTED
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
          <span style={{
            fontSize: '10px', fontWeight: overLimit ? 700 : 400,
            color: overLimit ? '#ef4444' : nearLimit ? '#f59e0b' : '#6b7280',
          }}>
            {count}/{charLimit}
          </span>
          <button
            onClick={handleCopy}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: '20px', height: '20px', borderRadius: '4px',
              border: 'none', backgroundColor: 'transparent',
              color: copied ? '#22c55e' : 'var(--color-text-muted)',
              cursor: 'pointer',
            }}
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
          </button>
        </div>
      </div>

      {/* Text */}
      <div style={{
        fontSize: '12px', color: 'var(--color-text-primary)',
        lineHeight: 1.5, whiteSpace: 'pre-wrap',
        marginBottom: rationale ? '8px' : 0,
      }}>
        {text}
      </div>

      {/* Rationale */}
      {rationale && (
        <div style={{ fontSize: '10px', color: 'var(--color-text-muted)', fontStyle: 'italic' }}>
          {rationale}
        </div>
      )}
    </div>
  )
}

function VariantSection({ title, icon, variants, charLimit, activeIndex, onSelect }: {
  title: string
  icon: React.ReactNode
  variants: Array<{ text: string; rationale?: string; tone?: string; charCount?: number }>
  charLimit: number
  activeIndex: number
  onSelect: (idx: number) => void
}) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <div style={{ color: '#8b5cf6' }}>{icon}</div>
        <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary)' }}>{title}</span>
        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>— {variants.length} variants</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {variants.map((v, idx) => (
          <VariantCard
            key={idx}
            text={v.text}
            rationale={v.rationale}
            tone={v.tone}
            charCount={v.charCount}
            charLimit={charLimit}
            onUse={() => onSelect(idx)}
            isActive={activeIndex === idx}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdCreator() {
  const { generateCopyVariants, copyVariants, isGeneratingCopy, copyError, clearCopyVariants, selectedBrandId } = useStrategyStore()
  const { campaigns, selectedBrandId: adsBrandId, fetchCampaigns, submitAdDraft } = useAdsStore()

  const [platform, setPlatform] = useState<'META' | 'GOOGLE'>('META')
  const [product, setProduct] = useState('')
  const [objective, setObjective] = useState('conversions')
  const [targetAudience, setTargetAudience] = useState('')
  const [usp, setUsp] = useState('')
  const [tone, setTone] = useState('urgent')
  const [selectedCampaignId, setSelectedCampaignId] = useState('')

  // Copy fields
  const [primaryText, setPrimaryText] = useState('')
  const [headline, setHeadline] = useState('')
  const [description, setDescription] = useState('')
  const [cta, setCta] = useState('SHOP_NOW')
  const [destinationUrl, setDestinationUrl] = useState('')

  // Selected variant indices
  const [selectedPrimaryIdx, setSelectedPrimaryIdx] = useState(0)
  const [selectedHeadlineIdx, setSelectedHeadlineIdx] = useState(0)
  const [selectedDescriptionIdx, setSelectedDescriptionIdx] = useState(0)

  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const fields = platform === 'META' ? META_FIELDS : GOOGLE_FIELDS

  useEffect(() => {
    if (adsBrandId) fetchCampaigns()
  }, [adsBrandId])

  // When a variant is selected, populate the field
  useEffect(() => {
    if (copyVariants) {
      const pt = copyVariants.primaryTexts[selectedPrimaryIdx]
      const hl = copyVariants.headlines[selectedHeadlineIdx]
      const desc = copyVariants.descriptions[selectedDescriptionIdx]
      if (pt) setPrimaryText(pt.text)
      if (hl) setHeadline(hl.text)
      if (desc) setDescription(desc.text)
    }
  }, [copyVariants, selectedPrimaryIdx, selectedHeadlineIdx, selectedDescriptionIdx])

  const handleGenerate = async () => {
    if (!product.trim()) return
    clearCopyVariants()
    setSelectedPrimaryIdx(0)
    setSelectedHeadlineIdx(0)
    setSelectedDescriptionIdx(0)

    const input: CopyInput = {
      product,
      platform,
      objective,
      targetAudience: targetAudience || undefined,
      usp: usp || undefined,
      tone,
      existingCopy: {
        primaryText: primaryText || undefined,
        headline: headline || undefined,
        description: description || undefined,
      },
      campaignName: campaigns.find(c => c.id === selectedCampaignId)?.name,
    }

    await generateCopyVariants(input)
  }

  const handleSubmitForApproval = async () => {
    if (!adsBrandId) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await submitAdDraft({
        platform: platform as 'META' | 'GOOGLE',
        campaignId: selectedCampaignId || undefined,
        headline: headline || undefined,
        primaryText: primaryText || undefined,
        description: description || undefined,
        cta: cta || undefined,
        destinationUrl: destinationUrl || undefined,
        product: product || undefined,
        objective,
        targetAudience: targetAudience || undefined,
        usp: usp || undefined,
        tone,
      })
      setSubmitted(true)
      setTimeout(() => setSubmitted(false), 4000)
    } catch (e) {
      setSubmitError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const canGenerate = product.trim().length > 0

  const selectStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid var(--color-stroke)',
    backgroundColor: 'var(--color-bg-card)',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    width: '100%',
    cursor: 'pointer',
    outline: 'none',
  }

  const inputStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: '8px',
    border: '1px solid var(--color-stroke)',
    backgroundColor: 'var(--color-bg-card)',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    width: '100%',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    marginBottom: '5px',
    display: 'block',
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 800, color: 'var(--color-text-primary)' }}>
            Ad Creator
          </h1>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            padding: '2px 8px', borderRadius: '6px',
            fontSize: '10px', fontWeight: 700,
            backgroundColor: '#8b5cf618', color: '#8b5cf6',
          }}>
            <Sparkles size={10} />
            AI Copy Generation
          </span>
        </div>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--color-text-muted)' }}>
          Generate multiple AI variants for each copy field · Select the best · Submit for approval
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '400px 1fr', gap: '20px', alignItems: 'start' }}>

        {/* ── LEFT PANEL: Input form ──────────────────────────────────────────── */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '16px',
          position: 'sticky', top: '24px',
        }}>
          {/* Platform selector */}
          <div style={{
            backgroundColor: 'var(--color-bg-card)',
            border: '1px solid var(--color-stroke)',
            borderRadius: '12px', padding: '16px',
          }}>
            <label style={labelStyle}>Platform</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['META', 'GOOGLE'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => { setPlatform(p); clearCopyVariants() }}
                  style={{
                    flex: 1, padding: '8px', borderRadius: '8px',
                    border: `1.5px solid ${platform === p ? (p === 'META' ? '#1877f2' : '#4285f4') : 'var(--color-stroke)'}`,
                    backgroundColor: platform === p ? (p === 'META' ? '#1877f218' : '#4285f418') : 'transparent',
                    color: platform === p ? (p === 'META' ? '#1877f2' : '#4285f4') : 'var(--color-text-muted)',
                    fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Campaign context */}
          <div style={{
            backgroundColor: 'var(--color-bg-card)',
            border: '1px solid var(--color-stroke)',
            borderRadius: '12px', padding: '16px',
            display: 'flex', flexDirection: 'column', gap: '12px',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)' }}>
              Ad Context
            </div>

            {campaigns.length > 0 && (
              <div>
                <label style={labelStyle}>Campaign (optional)</label>
                <select value={selectedCampaignId} onChange={e => setSelectedCampaignId(e.target.value)} style={selectStyle}>
                  <option value="">No specific campaign</option>
                  {campaigns.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label style={labelStyle}>Product / Service *</label>
              <input
                type="text"
                value={product}
                onChange={e => setProduct(e.target.value)}
                placeholder="e.g. Women's running shoes, SaaS CRM tool"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Objective</label>
              <select value={objective} onChange={e => setObjective(e.target.value)} style={selectStyle}>
                {OBJECTIVES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div>
              <label style={labelStyle}>Target Audience</label>
              <input
                type="text"
                value={targetAudience}
                onChange={e => setTargetAudience(e.target.value)}
                placeholder="e.g. Female runners 25-40, SaaS founders"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Unique Selling Proposition</label>
              <input
                type="text"
                value={usp}
                onChange={e => setUsp(e.target.value)}
                placeholder="e.g. 30-day free trial, ships in 24h, #1 rated"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Tone</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {TONES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setTone(t.value)}
                    style={{
                      padding: '4px 10px', borderRadius: '6px',
                      border: `1px solid ${tone === t.value ? 'var(--color-accent)' : 'var(--color-stroke)'}`,
                      backgroundColor: tone === t.value ? 'var(--color-accent)15' : 'transparent',
                      color: tone === t.value ? 'var(--color-accent)' : 'var(--color-text-muted)',
                      fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={!canGenerate || isGeneratingCopy}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
              padding: '12px', borderRadius: '10px', border: 'none',
              backgroundColor: !canGenerate ? 'var(--color-stroke)' : isGeneratingCopy ? '#8b5cf680' : '#8b5cf6',
              color: !canGenerate ? 'var(--color-text-muted)' : '#fff',
              fontSize: '14px', fontWeight: 700,
              cursor: !canGenerate || isGeneratingCopy ? 'not-allowed' : 'pointer',
              transition: 'background-color 0.15s',
            }}
          >
            {isGeneratingCopy ? (
              <>
                <Brain size={16} style={{ animation: 'pulse 1s ease-in-out infinite' }} />
                Claude is writing…
              </>
            ) : (
              <>
                <Sparkles size={16} />
                Generate AI Copy Variants
              </>
            )}
          </button>

          {!canGenerate && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              fontSize: '11px', color: '#f59e0b',
            }}>
              <Info size={11} />
              Fill in "Product / Service" to generate copy
            </div>
          )}
        </div>

        {/* ── RIGHT PANEL: Copy editor + variants ───────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Copy fields editor */}
          <div style={{
            backgroundColor: 'var(--color-bg-card)',
            border: '1px solid var(--color-stroke)',
            borderRadius: '12px', padding: '20px',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: '16px' }}>
              Ad Copy
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {platform === 'META' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                    <label style={{ ...labelStyle, margin: 0 }}>Primary Text</label>
                    <CharCounter value={primaryText} limit={125} />
                  </div>
                  <textarea
                    value={primaryText}
                    onChange={e => setPrimaryText(e.target.value)}
                    rows={5}
                    placeholder="Stop scrolling — this is for you..."
                    style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
                  />
                </div>
              )}

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                  <label style={{ ...labelStyle, margin: 0 }}>Headline</label>
                  <CharCounter value={headline} limit={platform === 'META' ? 40 : 30} />
                </div>
                <input
                  type="text"
                  value={headline}
                  onChange={e => setHeadline(e.target.value)}
                  placeholder={platform === 'META' ? 'Short, punchy headline (40 chars)' : 'Keyword-rich headline (30 chars)'}
                  style={inputStyle}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                  <label style={{ ...labelStyle, margin: 0 }}>Description</label>
                  <CharCounter value={description} limit={platform === 'META' ? 30 : 90} />
                </div>
                {platform === 'GOOGLE' ? (
                  <textarea
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    rows={3}
                    placeholder="Compelling description with CTA (90 chars)"
                    style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
                  />
                ) : (
                  <input
                    type="text"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder="Short supporting text (30 chars)"
                    style={inputStyle}
                  />
                )}
              </div>

              {platform === 'META' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={labelStyle}>Call to Action</label>
                    <select value={cta} onChange={e => setCta(e.target.value)} style={selectStyle}>
                      {CTA_OPTIONS.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Destination URL</label>
                    <input
                      type="url"
                      value={destinationUrl}
                      onChange={e => setDestinationUrl(e.target.value)}
                      placeholder="https://"
                      style={inputStyle}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Ad Preview */}
          {(headline || primaryText) && (
            <div style={{
              backgroundColor: 'var(--color-bg-card)',
              border: '1px solid var(--color-stroke)',
              borderRadius: '12px', padding: '20px',
            }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Ad Preview — {platform}
              </div>
              <div style={{
                border: '1px solid var(--color-stroke)',
                borderRadius: '10px', overflow: 'hidden',
                maxWidth: '400px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
              }}>
                {/* Simulated ad card */}
                <div style={{ backgroundColor: '#e5e7eb', height: '160px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#9ca3af' }}>[ Creative Image / Video ]</span>
                </div>
                <div style={{
                  padding: '10px 12px',
                  backgroundColor: platform === 'META' ? '#f0f2f5' : '#fff',
                  borderTop: '1px solid var(--color-stroke)',
                }}>
                  {primaryText && (
                    <div style={{ fontSize: '12px', color: '#1c1e21', marginBottom: '8px', lineHeight: 1.4 }}>
                      {primaryText.slice(0, 100)}{primaryText.length > 100 ? '… See more' : ''}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      {destinationUrl && (
                        <div style={{ fontSize: '10px', color: '#65676b', marginBottom: '2px' }}>{destinationUrl.replace('https://', '').split('/')[0]}</div>
                      )}
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#1c1e21' }}>{headline || 'Headline'}</div>
                      {description && <div style={{ fontSize: '11px', color: '#65676b' }}>{description}</div>}
                    </div>
                    {platform === 'META' && (
                      <div style={{
                        padding: '6px 12px', borderRadius: '4px',
                        backgroundColor: '#e4e6eb',
                        fontSize: '12px', fontWeight: 700, color: '#1c1e21',
                        whiteSpace: 'nowrap', flexShrink: 0, marginLeft: '10px',
                      }}>
                        {cta.replace(/_/g, ' ')}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* AI Copy Variants */}
          {copyError && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '12px 16px', borderRadius: '10px',
              backgroundColor: '#ef444415', border: '1px solid #ef444430',
              fontSize: '13px', color: '#ef4444',
            }}>
              <AlertCircle size={14} />
              {copyError}
            </div>
          )}

          {isGeneratingCopy && (
            <div style={{
              backgroundColor: 'var(--color-bg-card)',
              border: '1px solid var(--color-stroke)',
              borderRadius: '12px', padding: '32px',
              textAlign: 'center',
            }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '10px',
                fontSize: '14px', color: '#8b5cf6', fontWeight: 600,
              }}>
                <Brain size={18} style={{ animation: 'pulse 1s ease-in-out infinite' }} />
                Claude is writing {platform === 'META' ? '5 primary texts, 5 headlines, 4 descriptions' : '5 headlines, 4 descriptions'}…
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                This takes 5-10 seconds
              </div>
            </div>
          )}

          {copyVariants && !isGeneratingCopy && (
            <div style={{
              backgroundColor: 'var(--color-bg-card)',
              border: '1px solid #8b5cf640',
              borderRadius: '12px', padding: '20px',
            }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '7px',
                    fontSize: '13px', fontWeight: 700, color: 'var(--color-text-primary)',
                  }}>
                    <Sparkles size={14} style={{ color: '#8b5cf6' }} />
                    AI Generated Variants
                  </div>
                  {copyVariants.generationContext && (
                    <div style={{ fontSize: '11px', color: 'var(--color-text-muted)', marginTop: '3px' }}>
                      {copyVariants.generationContext}
                    </div>
                  )}
                </div>
                <button
                  onClick={handleGenerate}
                  disabled={isGeneratingCopy}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '5px',
                    padding: '6px 12px', borderRadius: '7px',
                    border: '1px solid var(--color-stroke)',
                    backgroundColor: 'transparent',
                    color: 'var(--color-text-muted)',
                    fontSize: '12px', cursor: 'pointer',
                  }}
                >
                  <RefreshCw size={11} />
                  Regenerate
                </button>
              </div>

              {/* Variant sections */}
              {platform === 'META' && copyVariants.primaryTexts?.length > 0 && (
                <VariantSection
                  title="Primary Text"
                  icon={<FileText size={13} />}
                  variants={copyVariants.primaryTexts}
                  charLimit={125}
                  activeIndex={selectedPrimaryIdx}
                  onSelect={setSelectedPrimaryIdx}
                />
              )}

              {copyVariants.headlines?.length > 0 && (
                <VariantSection
                  title="Headlines"
                  icon={<Hash size={13} />}
                  variants={copyVariants.headlines}
                  charLimit={platform === 'META' ? 40 : 30}
                  activeIndex={selectedHeadlineIdx}
                  onSelect={setSelectedHeadlineIdx}
                />
              )}

              {copyVariants.descriptions?.length > 0 && (
                <VariantSection
                  title="Descriptions"
                  icon={<Type size={13} />}
                  variants={copyVariants.descriptions}
                  charLimit={platform === 'META' ? 30 : 90}
                  activeIndex={selectedDescriptionIdx}
                  onSelect={setSelectedDescriptionIdx}
                />
              )}
            </div>
          )}

          {/* Submit action bar */}
          <div style={{
            padding: '16px', backgroundColor: 'var(--color-bg-card)',
            border: '1px solid var(--color-stroke)', borderRadius: '12px',
          }}>
            {submitError && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 12px', borderRadius: '8px', marginBottom: '10px',
                backgroundColor: '#ef444415', border: '1px solid #ef444430',
                fontSize: '12px', color: '#ef4444',
              }}>
                <AlertCircle size={12} />
                {submitError}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                style={{
                  padding: '9px 18px', borderRadius: '8px',
                  border: '1px solid var(--color-stroke)',
                  backgroundColor: 'transparent',
                  color: 'var(--color-text-muted)',
                  fontSize: '13px', cursor: 'pointer',
                }}
              >
                Save Draft
              </button>
              <button
                onClick={handleSubmitForApproval}
                disabled={(!headline && !primaryText) || submitting || !adsBrandId}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '9px 20px', borderRadius: '8px', border: 'none',
                  backgroundColor: submitted ? '#22c55e' : submitting ? 'var(--color-stroke)' : 'var(--color-accent)',
                  color: submitted || submitting ? (submitting ? 'var(--color-text-muted)' : '#fff') : '#fff',
                  fontSize: '13px', fontWeight: 700,
                  cursor: (!headline && !primaryText) || submitting || !adsBrandId ? 'not-allowed' : 'pointer',
                  transition: 'background-color 0.2s',
                }}
              >
                {submitted
                  ? <><Check size={14} /> Sent to Approval Queue</>
                  : submitting
                  ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> Submitting…</>
                  : <><Send size={14} /> Submit for Meta Approval</>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
