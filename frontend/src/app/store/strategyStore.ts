import { create } from 'zustand'
import { api } from '../lib/apiClient'

// ─── Types ────────────────────────────────────────────────────────────────────

export type CampaignSignal = 'WINNER' | 'LOSER' | 'FATIGUE' | 'NEUTRAL' | 'NEW'
export type RecommendationType =
  | 'SCALE_WINNER' | 'PAUSE_LOSER' | 'REDUCE_BUDGET' | 'CREATIVE_REFRESH'
  | 'AUDIENCE_EXPANSION' | 'BID_ADJUSTMENT' | 'BUDGET_REALLOCATION' | 'TEST_NEW_CREATIVE'

export interface CampaignScore {
  campaignId: string
  externalId: string
  campaignName: string
  platform: string
  status: string
  signal: CampaignSignal
  signalReasons: string[]
  recommendedAction: 'SCALE' | 'PAUSE' | 'REDUCE_BUDGET' | 'REFRESH_CREATIVE' | 'MONITOR'
  suggestedBudgetChangePct?: number
  metrics: {
    roas: number
    ctr: number
    cpa: number
    spend7d: number
    conversions7d: number
    avgFrequency: number
    impressions7d: number
  }
}

export interface StrategyRecommendation {
  id: string
  type: RecommendationType
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  title: string
  insight: string
  suggestedAction: string
  estimatedImpact: string
  campaignId?: string
  campaignName?: string
  externalId?: string
  platform?: string
  actionPayload?: {
    type: 'INCREASE_BUDGET' | 'DECREASE_BUDGET' | 'PAUSE_CAMPAIGN' | 'CREATIVE_REFRESH'
    valuePct?: number
  } | null
  confidence: number
}

export interface CopyVariant {
  text: string
  rationale?: string
  tone?: string
  charCount?: number
}

export interface CopyVariants {
  primaryTexts: CopyVariant[]
  headlines: CopyVariant[]
  descriptions: CopyVariant[]
  generationContext: string
}

export interface AutoRule {
  id: string
  name: string
  condition: 'ROAS_BELOW' | 'ROAS_ABOVE' | 'FREQUENCY_ABOVE' | 'CTR_BELOW' | 'CPA_ABOVE'
  threshold: number
  action: 'PAUSE_CAMPAIGN' | 'INCREASE_BUDGET' | 'DECREASE_BUDGET' | 'FLAG_CREATIVE'
  actionValue?: number
  minSpendCents?: number
  enabled: boolean
  requiresApproval: boolean
}

export interface AutoRuleResult {
  ruleId: string
  ruleName: string
  campaignId: string
  campaignName: string
  triggered: boolean
  reason: string
  actionQueued?: string
}

export interface CopyInput {
  campaignName?: string
  objective?: string
  product: string
  targetAudience?: string
  usp?: string
  tone?: string
  platform: 'META' | 'GOOGLE'
  existingCopy?: { primaryText?: string; headline?: string; description?: string }
  topPerformingInsights?: string
}

// ─── Store ────────────────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const method = (options?.method ?? 'GET').toUpperCase()
  const body = options?.body
    ? (typeof options.body === 'string' ? JSON.parse(options.body) : options.body)
    : undefined

  if (method === 'POST') return api.post(path, body) as Promise<T>
  if (method === 'PATCH') return api.patch(path, body) as Promise<T>
  if (method === 'PUT') return api.put(path, body) as Promise<T>
  if (method === 'DELETE') return api.delete(path) as Promise<T>
  return api.get(path) as Promise<T>
}

// Default auto-rules — user can customise
const DEFAULT_RULES: AutoRule[] = [
  {
    id: 'rule_pause_loser',
    name: 'Pause low-ROAS campaigns',
    condition: 'ROAS_BELOW',
    threshold: 0.8,
    action: 'PAUSE_CAMPAIGN',
    minSpendCents: 15000,
    enabled: true,
    requiresApproval: true,
  },
  {
    id: 'rule_scale_winner',
    name: 'Scale high-ROAS campaigns',
    condition: 'ROAS_ABOVE',
    threshold: 3.5,
    action: 'INCREASE_BUDGET',
    actionValue: 20,
    minSpendCents: 10000,
    enabled: true,
    requiresApproval: false,
  },
  {
    id: 'rule_fatigue',
    name: 'Flag creative fatigue',
    condition: 'FREQUENCY_ABOVE',
    threshold: 3.5,
    action: 'FLAG_CREATIVE',
    minSpendCents: 5000,
    enabled: true,
    requiresApproval: false,
  },
  {
    id: 'rule_low_ctr',
    name: 'Flag low-CTR creatives',
    condition: 'CTR_BELOW',
    threshold: 0.5,
    action: 'FLAG_CREATIVE',
    minSpendCents: 10000,
    enabled: false,
    requiresApproval: false,
  },
]

interface StrategyState {
  selectedBrandId: string | null
  selectedAdsAccountId: string | null

  scores: CampaignScore[]
  recommendations: StrategyRecommendation[]
  autoRules: AutoRule[]
  autoRuleResults: AutoRuleResult[]
  copyVariants: CopyVariants | null

  isLoadingScores: boolean
  isGeneratingRecs: boolean
  isGeneratingCopy: boolean
  isEvaluatingRules: boolean
  error: string | null
  copyError: string | null

  lastRecsGeneratedAt: string | null

  setSelectedBrand: (brandId: string, adsAccountId?: string | null) => void
  fetchScores: () => Promise<void>
  generateRecommendations: () => Promise<void>
  generateCopyVariants: (input: CopyInput) => Promise<void>
  clearCopyVariants: () => void
  evaluateAutoRules: () => Promise<void>
  updateAutoRule: (ruleId: string, updates: Partial<AutoRule>) => void
  applyQuickAction: (params: {
    campaignId: string
    externalId: string
    platform: string
    action: string
    valuePct?: number
    reason?: string
  }) => Promise<void>
}

export const useStrategyStore = create<StrategyState>((set, get) => ({
  selectedBrandId: null,
  selectedAdsAccountId: null,
  scores: [],
  recommendations: [],
  autoRules: DEFAULT_RULES,
  autoRuleResults: [],
  copyVariants: null,
  isLoadingScores: false,
  isGeneratingRecs: false,
  isGeneratingCopy: false,
  isEvaluatingRules: false,
  error: null,
  copyError: null,
  lastRecsGeneratedAt: null,

  setSelectedBrand: (brandId, adsAccountId = null) => {
    set({ selectedBrandId: brandId, selectedAdsAccountId: adsAccountId })
  },

  fetchScores: async () => {
    const { selectedBrandId } = get()
    if (!selectedBrandId) return
    set({ isLoadingScores: true, error: null })
    try {
      const data = await apiFetch<{ scores: CampaignScore[] }>(`/strategy/scores/${selectedBrandId}`)
      set({ scores: data.scores, isLoadingScores: false })
    } catch (e) {
      set({ error: (e as Error).message, isLoadingScores: false })
    }
  },

  generateRecommendations: async () => {
    const { selectedBrandId, selectedAdsAccountId } = get()
    if (!selectedBrandId) return
    set({ isGeneratingRecs: true, error: null })
    try {
      const data = await apiFetch<{ recommendations: StrategyRecommendation[]; scores: CampaignScore[] }>(
        `/strategy/recommendations/${selectedBrandId}`,
        { method: 'POST', body: JSON.stringify({ adsAccountId: selectedAdsAccountId }) },
      )
      set({
        recommendations: data.recommendations,
        scores: data.scores ?? get().scores,
        isGeneratingRecs: false,
        lastRecsGeneratedAt: new Date().toISOString(),
      })
    } catch (e) {
      set({ error: (e as Error).message, isGeneratingRecs: false })
    }
  },

  generateCopyVariants: async (input: CopyInput) => {
    set({ isGeneratingCopy: true, copyError: null, copyVariants: null })
    try {
      const data = await apiFetch<{ variants: CopyVariants }>(
        '/strategy/copy-variants',
        { method: 'POST', body: JSON.stringify(input) },
      )
      set({ copyVariants: data.variants, isGeneratingCopy: false })
    } catch (e) {
      set({ copyError: (e as Error).message, isGeneratingCopy: false })
    }
  },

  clearCopyVariants: () => set({ copyVariants: null, copyError: null }),

  evaluateAutoRules: async () => {
    const { selectedBrandId, autoRules } = get()
    if (!selectedBrandId) return
    set({ isEvaluatingRules: true, error: null })
    try {
      const data = await apiFetch<{ results: AutoRuleResult[] }>(
        `/strategy/auto-rules/evaluate/${selectedBrandId}`,
        { method: 'POST', body: JSON.stringify({ rules: autoRules }) },
      )
      set({ autoRuleResults: data.results, isEvaluatingRules: false })
    } catch (e) {
      set({ error: (e as Error).message, isEvaluatingRules: false })
    }
  },

  updateAutoRule: (ruleId, updates) => {
    set(state => ({
      autoRules: state.autoRules.map(r => r.id === ruleId ? { ...r, ...updates } : r),
    }))
  },

  applyQuickAction: async (params) => {
    const { selectedBrandId } = get()
    if (!selectedBrandId) return
    await apiFetch(`/strategy/quick-action/${selectedBrandId}`, {
      method: 'POST',
      body: JSON.stringify(params),
    })
    // Refresh scores after queuing action
    await get().fetchScores()
  },
}))
