// adsGuardrailService.ts
// Server-side guardrail enforcement — runs before EVERY executor call as a hard safety net.
// The decision engine agent also applies these rules; this is the authoritative double-check.

export interface GuardrailConfig {
  manualApprovalMode: boolean;
  confidenceThreshold: number;
  maxDailyBudgetIncrPct: number;
  minSpendThresholdCents: number;
  cooldownHours: number;
  allowedActions: string[];
  blockedCampaignIds: string[];
}

export interface ActionSpec {
  actionId: string;
  type: string;
  entityType: string;
  entityId: string;
  externalId?: string;
  platform: string;
  confidence: number;
  params: Record<string, unknown>;
  rationale?: string;
  approvalReason?: string;
  guardrailNote?: string;
}

interface RecentAction {
  entityId: string;
  action: string;
  executedAt: Date | string;
  status: string;
}

interface SpendRecord {
  entityId: string;
  spendCents: number;
}

export type GuardrailVerdict = 'APPROVED' | 'REJECTED' | 'REQUIRES_HUMAN_APPROVAL' | 'CLAMPED';

export interface GuardrailResult {
  verdict: GuardrailVerdict;
  reason: string;
  detail: string;
  action?: ActionSpec; // possibly modified (budget clamped)
}

const HIGH_IMPACT_ACTIONS = new Set(['DELETE_CAMPAIGN', 'ARCHIVE_CAMPAIGN', 'DELETE_ADSET']);

export function evaluateAction(
  action: ActionSpec,
  config: GuardrailConfig,
  recentActions: RecentAction[],
  spendRecords: SpendRecord[],
): GuardrailResult {
  // Rule 1: Action type allowlist
  if (!config.allowedActions.includes(action.type)) {
    return {
      verdict: 'REJECTED',
      reason: 'ACTION_TYPE_BLOCKED',
      detail: `Action type '${action.type}' is not in the allowed list for this account.`,
    };
  }

  // Rule 2: Blocked campaign/entity
  if (action.externalId && config.blockedCampaignIds.includes(action.externalId)) {
    return {
      verdict: 'REJECTED',
      reason: 'ENTITY_BLOCKED',
      detail: `Entity ${action.externalId} is in the blocked campaigns list.`,
    };
  }

  // Rule 3: Confidence threshold
  if (action.confidence < config.confidenceThreshold) {
    return {
      verdict: 'REJECTED',
      reason: 'LOW_CONFIDENCE',
      detail: `Confidence ${action.confidence.toFixed(3)} is below threshold ${config.confidenceThreshold}.`,
    };
  }

  // Rule 4: Cooldown period
  const actionsOnEntity = recentActions
    .filter(r => r.entityId === action.entityId && r.status === 'EXECUTED')
    .sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime());

  if (actionsOnEntity.length > 0) {
    const lastAction = actionsOnEntity[0];
    const hoursSince = (Date.now() - new Date(lastAction.executedAt).getTime()) / 3_600_000;
    if (hoursSince < config.cooldownHours) {
      const nextEligible = new Date(
        new Date(lastAction.executedAt).getTime() + config.cooldownHours * 3_600_000,
      ).toISOString();
      return {
        verdict: 'REJECTED',
        reason: 'COOLDOWN_ACTIVE',
        detail: `Last action ${hoursSince.toFixed(1)}h ago on entity ${action.entityId}. Cooldown: ${config.cooldownHours}h. Next eligible: ${nextEligible}.`,
      };
    }
  }

  // Rule 5: Minimum spend threshold (budget/bid actions only)
  const BUDGET_ACTIONS = new Set(['INCREASE_BUDGET', 'DECREASE_BUDGET', 'ADJUST_BID']);
  if (BUDGET_ACTIONS.has(action.type)) {
    const spendRecord = spendRecords.find(s => s.entityId === action.entityId);
    const spend = spendRecord?.spendCents ?? 0;
    if (spend < config.minSpendThresholdCents) {
      return {
        verdict: 'REJECTED',
        reason: 'INSUFFICIENT_SPEND',
        detail: `Spend $${(spend / 100).toFixed(2)} is below minimum threshold $${(config.minSpendThresholdCents / 100).toFixed(2)} required before budget changes.`,
      };
    }
  }

  // Rule 6: Budget increase cap — CLAMP, don't reject
  if (action.type === 'INCREASE_BUDGET') {
    const params = action.params as { currentValueCents: number; proposedValueCents: number; changePct?: number };
    if (params.currentValueCents && params.proposedValueCents) {
      const actualPct = ((params.proposedValueCents - params.currentValueCents) / params.currentValueCents) * 100;
      if (actualPct > config.maxDailyBudgetIncrPct) {
        const cappedValue = Math.round(params.currentValueCents * (1 + config.maxDailyBudgetIncrPct / 100));
        const modified: ActionSpec = {
          ...action,
          params: {
            ...params,
            proposedValueCents: cappedValue,
            changePct: config.maxDailyBudgetIncrPct,
          },
          guardrailNote: `Budget increase capped from ${actualPct.toFixed(1)}% to ${config.maxDailyBudgetIncrPct}% (max allowed).`,
        };
        return { verdict: 'CLAMPED', reason: 'BUDGET_CAP_APPLIED', detail: modified.guardrailNote!, action: modified };
      }
    }
  }

  // Rule 7: Manual approval mode override
  if (config.manualApprovalMode) {
    return {
      verdict: 'REQUIRES_HUMAN_APPROVAL',
      reason: 'MANUAL_APPROVAL_MODE',
      detail: 'Manual approval mode is enabled for this account. All actions require human review.',
    };
  }

  // Rule 8: High-impact actions always require human approval
  if (HIGH_IMPACT_ACTIONS.has(action.type)) {
    return {
      verdict: 'REQUIRES_HUMAN_APPROVAL',
      reason: 'HIGH_IMPACT_ACTION_POLICY',
      detail: `Action type '${action.type}' is classified as high-impact and always requires human approval.`,
    };
  }

  return {
    verdict: 'APPROVED',
    reason: 'ALL_GUARDRAILS_PASSED',
    detail: 'Action passed all 8 guardrail checks.',
    action,
  };
}

export interface VerifyResult {
  finalApproved: ActionSpec[];
  finalRejected: { action: ActionSpec; guardrailResult: GuardrailResult }[];
  requiresHumanApproval: { action: ActionSpec; guardrailResult: GuardrailResult }[];
}

export function verifyApprovedActions(
  approvedActions: ActionSpec[],
  config: GuardrailConfig,
  recentActions: RecentAction[],
  spendRecords: SpendRecord[],
): VerifyResult {
  const finalApproved: ActionSpec[] = [];
  const finalRejected: VerifyResult['finalRejected'] = [];
  const requiresHumanApproval: VerifyResult['requiresHumanApproval'] = [];

  for (const action of approvedActions) {
    const result = evaluateAction(action, config, recentActions, spendRecords);

    if (result.verdict === 'APPROVED') {
      finalApproved.push(action);
    } else if (result.verdict === 'CLAMPED') {
      // Use the clamped version of the action
      finalApproved.push(result.action!);
    } else if (result.verdict === 'REQUIRES_HUMAN_APPROVAL') {
      requiresHumanApproval.push({ action, guardrailResult: result });
    } else {
      console.warn(`[guardrail] OVERRIDE_PREVENTED: action ${action.actionId} (${action.type}) on entity ${action.entityId} — ${result.reason}: ${result.detail}`);
      finalRejected.push({ action, guardrailResult: result });
    }
  }

  return { finalApproved, finalRejected, requiresHumanApproval };
}
