import { create } from 'zustand'
import { api } from '../lib/apiClient'

// ─── Types ────────────────────────────────────────────────────────────────────

export type AdsPlatform = 'META' | 'GOOGLE'
export type CampaignStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'DELETED' | 'PENDING'
export type ActionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'FAILED' | 'AWAITING_HUMAN'

export interface AdsActionLogEntry {
  id: string
  agentId: string
  workflowRunId: string | null
  action: string
  entityType: string
  entityId: string
  externalId: string | null
  platform: AdsPlatform
  reason: string
  beforeState: Record<string, unknown>
  afterState: Record<string, unknown> | null
  status: ActionStatus
  errorMessage: string | null
  executedAt: string | null
  createdAt: string
}

export interface CampaignWithMetrics {
  id: string
  externalId: string
  name: string
  platform: AdsPlatform
  status: CampaignStatus
  dailyBudgetCents: number | null
  metrics: Array<{
    dateKey: string
    impressions: number
    clicks: number
    spendCents: number
    conversions: number
    ctr: number
    cpc: number
    cpa: number
    roas: number
    frequencyScore: number | null
  }>
}

export interface AdsGuardrailConfig {
  manualApprovalMode: boolean
  confidenceThreshold: number
  maxDailyBudgetIncrPct: number
  minSpendThresholdCents: number
  cooldownHours: number
  allowedActions: string[]
  blockedCampaignIds: string[]
}

export interface WorkflowRun {
  workflowRunId: string
  createdAt: string
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface AdsState {
  campaigns: CampaignWithMetrics[]
  actionLog: AdsActionLogEntry[]
  approvalQueue: AdsActionLogEntry[]
  workflowRuns: WorkflowRun[]
  guardrailConfig: AdsGuardrailConfig | null
  selectedBrandId: string | null
  selectedAdsAccountId: string | null
  isLoading: boolean
  error: string | null

  setSelectedBrand: (brandId: string, adsAccountId?: string | null) => void
  fetchCampaigns: () => Promise<void>
  fetchActionLog: (opts?: { platform?: AdsPlatform; status?: ActionStatus }) => Promise<void>
  fetchApprovalQueue: () => Promise<void>
  fetchGuardrailConfig: () => Promise<void>
  fetchWorkflowRuns: () => Promise<void>
  submitAdDraft: (draft: {
    platform: AdsPlatform
    campaignId?: string
    headline?: string
    primaryText?: string
    description?: string
    cta?: string
    destinationUrl?: string
    product?: string
    objective?: string
    targetAudience?: string
    usp?: string
    tone?: string
    creativeUrl?: string
    creativeType?: string
    dailyBudgetCents?: number
    startDate?: string
    endDate?: string
  }) => Promise<{ id: string }>
  approveAction: (actionId: string) => Promise<void>
  rejectAction: (actionId: string, reason: string) => Promise<void>
  updateGuardrailConfig: (config: Partial<AdsGuardrailConfig>) => Promise<void>
  triggerWorkflow: () => Promise<void>
}

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

export const useAdsStore = create<AdsState>((set, get) => ({
  campaigns: [],
  actionLog: [],
  approvalQueue: [],
  workflowRuns: [],
  guardrailConfig: null,
  selectedBrandId: null,
  selectedAdsAccountId: null,
  isLoading: false,
  error: null,

  setSelectedBrand: (brandId, adsAccountId = null) => {
    set({ selectedBrandId: brandId, selectedAdsAccountId: adsAccountId })
  },

  fetchCampaigns: async () => {
    const { selectedBrandId } = get()
    if (!selectedBrandId) return
    set({ isLoading: true, error: null })
    try {
      const data = await apiFetch<{ campaigns: CampaignWithMetrics[] }>(`/ads/campaigns/${selectedBrandId}`)
      set({ campaigns: data.campaigns, isLoading: false })
    } catch (e) {
      set({ error: (e as Error).message, isLoading: false })
    }
  },

  fetchActionLog: async (opts = {}) => {
    const { selectedBrandId } = get()
    if (!selectedBrandId) return
    const params = new URLSearchParams({ limit: '100' })
    if (opts.platform) params.set('platform', opts.platform)
    if (opts.status) params.set('status', opts.status)
    try {
      const data = await apiFetch<{ logs: AdsActionLogEntry[] }>(`/ads/action-log/${selectedBrandId}?${params}`)
      set({ actionLog: data.logs })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  fetchApprovalQueue: async () => {
    const { selectedBrandId } = get()
    if (!selectedBrandId) return
    try {
      const data = await apiFetch<{ queue: AdsActionLogEntry[] }>(`/ads/approval-queue/${selectedBrandId}`)
      set({ approvalQueue: data.queue })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  fetchGuardrailConfig: async () => {
    const { selectedAdsAccountId } = get()
    if (!selectedAdsAccountId) return
    try {
      const data = await apiFetch<{ config: AdsGuardrailConfig }>(`/ads/guardrails/${selectedAdsAccountId}`)
      set({ guardrailConfig: data.config })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  fetchWorkflowRuns: async () => {
    const { selectedBrandId } = get()
    if (!selectedBrandId) return
    try {
      const data = await apiFetch<{ runs: WorkflowRun[] }>(`/ads/workflow-runs/${selectedBrandId}`)
      set({ workflowRuns: data.runs })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  approveAction: async (actionId) => {
    await apiFetch(`/ads/approval-queue/${actionId}/approve`, { method: 'POST' })
    await get().fetchApprovalQueue()
    await get().fetchActionLog()
  },

  rejectAction: async (actionId, reason) => {
    await apiFetch(`/ads/approval-queue/${actionId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })
    await get().fetchApprovalQueue()
    await get().fetchActionLog()
  },

  updateGuardrailConfig: async (config) => {
    const { selectedAdsAccountId } = get()
    if (!selectedAdsAccountId) return
    const updated = await apiFetch<{ config: AdsGuardrailConfig }>(`/ads/guardrails/${selectedAdsAccountId}`, {
      method: 'PATCH',
      body: JSON.stringify(config),
    })
    set({ guardrailConfig: updated.config })
  },

  submitAdDraft: async (draft) => {
    const { selectedBrandId } = get()
    if (!selectedBrandId) throw new Error('No brand selected')
    const data = await apiFetch<{ draft: { id: string } }>(
      `/ads/drafts/${selectedBrandId}`,
      { method: 'POST', body: JSON.stringify(draft) },
    )
    // refresh approval queue so the new draft appears
    await get().fetchApprovalQueue()
    return data.draft
  },

  triggerWorkflow: async () => {
    const { selectedBrandId, selectedAdsAccountId } = get()
    if (!selectedBrandId || !selectedAdsAccountId) return
    await apiFetch(`/ads/workflow/${selectedBrandId}/trigger`, {
      method: 'POST',
      body: JSON.stringify({ adsAccountId: selectedAdsAccountId }),
    })
  },
}))
