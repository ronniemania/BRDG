// strategyService.ts
// AI Strategy Layer — performance scoring, Claude-generated recommendations,
// copy variant generation, and auto-rule execution.
// Sits in the INTELLIGENCE layer: produces insights and copy, never executes.

import https from 'https';
import * as repo from '../database/adsRepository';
import { getMetaCredentials, getGoogleCredentials } from './adsCredentialService';
import * as metaAdsService from './metaAdsService';

// ─── Types ────────────────────────────────────────────────────────────────────

export type CampaignSignal = 'WINNER' | 'LOSER' | 'FATIGUE' | 'NEUTRAL' | 'NEW';
export type RecommendationType =
  | 'SCALE_WINNER'
  | 'PAUSE_LOSER'
  | 'REDUCE_BUDGET'
  | 'CREATIVE_REFRESH'
  | 'AUDIENCE_EXPANSION'
  | 'BID_ADJUSTMENT'
  | 'BUDGET_REALLOCATION'
  | 'TEST_NEW_CREATIVE';

export interface CampaignScore {
  campaignId: string;
  externalId: string;
  campaignName: string;
  platform: string;
  status: string;
  signal: CampaignSignal;
  signalReasons: string[];
  recommendedAction: 'SCALE' | 'PAUSE' | 'REDUCE_BUDGET' | 'REFRESH_CREATIVE' | 'MONITOR';
  suggestedBudgetChangePct?: number; // positive = increase, negative = decrease
  metrics: {
    roas: number;
    ctr: number;
    cpa: number;
    spend7d: number;
    conversions7d: number;
    avgFrequency: number;
    impressions7d: number;
  };
}

export interface StrategyRecommendation {
  id: string;
  type: RecommendationType;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  insight: string;
  suggestedAction: string;
  estimatedImpact: string;
  campaignId?: string;
  campaignName?: string;
  externalId?: string;
  platform?: string;
  actionPayload?: {
    type: 'INCREASE_BUDGET' | 'DECREASE_BUDGET' | 'PAUSE_CAMPAIGN' | 'CREATIVE_REFRESH';
    valuePct?: number;
  };
  confidence: number;
}

export interface CopyVariants {
  primaryTexts: Array<{ text: string; rationale: string; tone: string }>;
  headlines: Array<{ text: string; charCount: number }>;
  descriptions: Array<{ text: string; charCount: number }>;
  generationContext: string;
}

export interface CopyInput {
  campaignName?: string;
  objective?: string;  // e.g. 'conversions', 'awareness', 'traffic'
  product: string;
  targetAudience?: string;
  usp?: string;        // unique selling proposition
  tone?: string;       // e.g. 'urgent', 'friendly', 'professional'
  platform: 'META' | 'GOOGLE';
  existingCopy?: {
    primaryText?: string;
    headline?: string;
    description?: string;
  };
  topPerformingInsights?: string; // e.g. "Pain-point hooks perform 2x better than benefit hooks"
}

export interface AutoRule {
  id: string;
  name: string;
  condition: 'ROAS_BELOW' | 'ROAS_ABOVE' | 'FREQUENCY_ABOVE' | 'CTR_BELOW' | 'CPA_ABOVE';
  threshold: number;
  action: 'PAUSE_CAMPAIGN' | 'INCREASE_BUDGET' | 'DECREASE_BUDGET' | 'FLAG_CREATIVE';
  actionValue?: number; // % change for budget actions
  minSpendCents?: number;
  enabled: boolean;
  requiresApproval: boolean;
}

export interface AutoRuleResult {
  ruleId: string;
  ruleName: string;
  campaignId: string;
  campaignName: string;
  triggered: boolean;
  reason: string;
  actionQueued?: string;
}

// ─── Claude API client ────────────────────────────────────────────────────────

async function claudeGenerate(systemPrompt: string, userMessage: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const body = JSON.stringify({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(buf);
          if (parsed.error) {
            reject(new Error(`Claude API error: ${parsed.error.message}`));
          } else {
            resolve(parsed.content?.[0]?.text ?? '');
          }
        } catch {
          reject(new Error(`Claude parse error: ${buf.slice(0, 300)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Performance Scoring ──────────────────────────────────────────────────────

export function scoreCampaigns(
  campaigns: Array<{
    id: string;
    externalId: string;
    name: string;
    platform: string;
    status: string;
    dailyBudgetCents: number | null;
    metrics: Array<{
      dateKey: string;
      spendCents: number;
      conversions: number;
      conversionValueCents?: number;
      ctr: number;
      cpc: number;
      cpa: number;
      roas: number;
      impressions: number;
      frequencyScore?: number | null;
    }>;
  }>,
): CampaignScore[] {
  return campaigns.map(campaign => {
    const metrics = campaign.metrics;
    if (!metrics || metrics.length === 0) {
      return {
        campaignId: campaign.id,
        externalId: campaign.externalId,
        campaignName: campaign.name,
        platform: campaign.platform,
        status: campaign.status,
        signal: 'NEW' as CampaignSignal,
        signalReasons: ['No metrics available yet — campaign is new or data is syncing'],
        recommendedAction: 'MONITOR' as const,
        metrics: { roas: 0, ctr: 0, cpa: 0, spend7d: 0, conversions7d: 0, avgFrequency: 0, impressions7d: 0 },
      };
    }

    const spend7d = metrics.reduce((s, m) => s + m.spendCents, 0);
    const conversions7d = metrics.reduce((s, m) => s + m.conversions, 0);
    const impressions7d = metrics.reduce((s, m) => s + m.impressions, 0);
    const totalConvValue = metrics.reduce((s, m) => s + (m.conversionValueCents ?? 0), 0);
    const roas = spend7d > 0 ? totalConvValue / spend7d : 0;
    const avgCtr = metrics.reduce((s, m) => s + Number(m.ctr), 0) / metrics.length;
    const avgCpa = conversions7d > 0 ? spend7d / conversions7d / 100 : 0;
    const avgFrequency = metrics.reduce((s, m) => s + (Number(m.frequencyScore) || 0), 0) / metrics.length;
    const recentRoas = metrics.slice(-3).reduce((s, m) => {
      const val = m.conversionValueCents ?? 0;
      return s + (m.spendCents > 0 ? val / m.spendCents : 0);
    }, 0) / Math.min(3, metrics.length);

    const signalReasons: string[] = [];
    let signal: CampaignSignal = 'NEUTRAL';
    let recommendedAction: CampaignScore['recommendedAction'] = 'MONITOR';
    let suggestedBudgetChangePct: number | undefined;

    // Scoring logic
    const hasMinSpend = spend7d >= 5000; // $50 minimum spend for reliable data

    if (!hasMinSpend) {
      signal = 'NEW';
      signalReasons.push(`Only $${(spend7d / 100).toFixed(0)} spend in 7d — insufficient data for decisions`);
      recommendedAction = 'MONITOR';
    } else if (avgFrequency > 3.5) {
      signal = 'FATIGUE';
      signalReasons.push(`High ad frequency ${avgFrequency.toFixed(1)}× — audience seeing ads too often`);
      if (roas >= 2.0) signalReasons.push(`Despite fatigue, ROAS is healthy at ${roas.toFixed(2)}× — prioritise creative refresh over pause`);
      else signalReasons.push(`ROAS at ${roas.toFixed(2)}× with fatigue — urgent creative refresh needed`);
      recommendedAction = 'REFRESH_CREATIVE';
    } else if (roas >= 3.0 && avgCtr >= 0.005) {
      signal = 'WINNER';
      signalReasons.push(`Strong ROAS ${roas.toFixed(2)}× with healthy CTR ${(avgCtr * 100).toFixed(2)}%`);
      if (conversions7d >= 10) signalReasons.push(`${conversions7d} conversions in 7d — statistically reliable`);
      if (recentRoas > roas) signalReasons.push(`ROAS trending up (recent 3d avg: ${recentRoas.toFixed(2)}×)`);
      recommendedAction = 'SCALE';
      suggestedBudgetChangePct = roas >= 5.0 ? 25 : roas >= 4.0 ? 20 : 15;
    } else if (roas < 1.0 && spend7d >= 10000) {
      signal = 'LOSER';
      signalReasons.push(`ROAS ${roas.toFixed(2)}× is below break-even — losing money on ads`);
      if (avgCtr < 0.005) signalReasons.push(`Low CTR ${(avgCtr * 100).toFixed(2)}% — creative not resonating`);
      if (avgCpa > 0) signalReasons.push(`CPA $${avgCpa.toFixed(2)} is likely above target`);
      recommendedAction = spend7d >= 20000 ? 'PAUSE' : 'REDUCE_BUDGET';
      suggestedBudgetChangePct = spend7d >= 20000 ? undefined : -30;
    } else if (roas >= 1.5 && roas < 3.0) {
      signal = 'NEUTRAL';
      signalReasons.push(`ROAS ${roas.toFixed(2)}× is positive but below scaling threshold (3.0×)`);
      if (avgCtr >= 0.01) signalReasons.push(`Good CTR ${(avgCtr * 100).toFixed(2)}% — ad resonates but conversions need work`);
      recommendedAction = 'MONITOR';
    }

    return {
      campaignId: campaign.id,
      externalId: campaign.externalId,
      campaignName: campaign.name,
      platform: campaign.platform,
      status: campaign.status,
      signal,
      signalReasons,
      recommendedAction,
      suggestedBudgetChangePct,
      metrics: {
        roas: parseFloat(roas.toFixed(3)),
        ctr: parseFloat((avgCtr * 100).toFixed(3)),
        cpa: parseFloat(avgCpa.toFixed(2)),
        spend7d,
        conversions7d,
        avgFrequency: parseFloat(avgFrequency.toFixed(2)),
        impressions7d,
      },
    };
  });
}

// ─── Generate Recommendations (Claude) ───────────────────────────────────────

export async function generateRecommendations(
  scores: CampaignScore[],
  accountPlatform: string,
): Promise<StrategyRecommendation[]> {
  const systemPrompt = `You are an elite performance marketing strategist specialising in paid social and search advertising.
You analyse campaign data and generate specific, actionable recommendations like a top-tier media buyer.
You think in terms of ROAS, CAC, LTV, creative fatigue, audience saturation, and budget efficiency.
You always output valid JSON only — no markdown, no extra text.`;

  const scored = scores.map(s => ({
    name: s.campaignName,
    id: s.campaignId,
    externalId: s.externalId,
    platform: s.platform,
    signal: s.signal,
    roas: s.metrics.roas,
    ctr: s.metrics.ctr,
    cpa: s.metrics.cpa,
    spend7d: `$${(s.metrics.spend7d / 100).toFixed(0)}`,
    conversions7d: s.metrics.conversions7d,
    frequency: s.metrics.avgFrequency,
    recommendedAction: s.recommendedAction,
    reasons: s.signalReasons,
  }));

  const userMessage = `Here is the current performance data for ${accountPlatform} ad campaigns (7-day window):

${JSON.stringify(scored, null, 2)}

Generate 4-6 high-quality strategic recommendations. For each recommendation produce a JSON object with:
{
  "id": "rec_<short_unique_id>",
  "type": one of: SCALE_WINNER | PAUSE_LOSER | REDUCE_BUDGET | CREATIVE_REFRESH | AUDIENCE_EXPANSION | BID_ADJUSTMENT | BUDGET_REALLOCATION | TEST_NEW_CREATIVE,
  "priority": "HIGH" | "MEDIUM" | "LOW",
  "title": "short punchy title (max 8 words)",
  "insight": "What the data is telling you in 1-2 sentences (be specific with numbers)",
  "suggestedAction": "Exactly what to do and why (1-2 sentences)",
  "estimatedImpact": "Estimated % improvement or $ impact",
  "campaignId": "the internal campaign id if campaign-specific, else null",
  "campaignName": "campaign name if campaign-specific, else null",
  "externalId": "externalId if campaign-specific, else null",
  "platform": "META or GOOGLE if campaign-specific",
  "actionPayload": { "type": "INCREASE_BUDGET | DECREASE_BUDGET | PAUSE_CAMPAIGN | CREATIVE_REFRESH", "valuePct": number } or null,
  "confidence": 0.0-1.0
}

Return ONLY a JSON array of recommendation objects.`;

  const raw = await claudeGenerate(systemPrompt, userMessage);

  try {
    // Extract JSON array from response
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array in response');
    return JSON.parse(jsonMatch[0]) as StrategyRecommendation[];
  } catch (e) {
    console.error('[strategy] Recommendation parse error:', e);
    // Return basic recommendations from scores as fallback
    return scores
      .filter(s => s.signal === 'WINNER' || s.signal === 'LOSER' || s.signal === 'FATIGUE')
      .slice(0, 4)
      .map((s, i) => ({
        id: `rec_fallback_${i}`,
        type: s.signal === 'WINNER' ? 'SCALE_WINNER' as RecommendationType
          : s.signal === 'LOSER' ? 'PAUSE_LOSER' as RecommendationType
          : 'CREATIVE_REFRESH' as RecommendationType,
        priority: s.signal === 'LOSER' ? 'HIGH' as const : 'MEDIUM' as const,
        title: s.signal === 'WINNER' ? `Scale ${s.campaignName}`
          : s.signal === 'LOSER' ? `Review ${s.campaignName}`
          : `Refresh ${s.campaignName}`,
        insight: s.signalReasons[0] ?? '',
        suggestedAction: s.recommendedAction,
        estimatedImpact: s.suggestedBudgetChangePct ? `~${s.suggestedBudgetChangePct}% budget change` : 'Monitor performance',
        campaignId: s.campaignId,
        campaignName: s.campaignName,
        externalId: s.externalId,
        platform: s.platform,
        actionPayload: null as any,
        confidence: 0.7,
      }));
  }
}

// ─── Generate Copy Variants (Claude) ─────────────────────────────────────────

export async function generateCopyVariants(input: CopyInput): Promise<CopyVariants> {
  const systemPrompt = `You are a world-class direct response copywriter specialising in ${input.platform === 'META' ? 'Meta (Facebook/Instagram) ads' : 'Google ads'}.
You write copy that stops the scroll, speaks directly to the target audience's pain points and desires, and drives action.
You understand AIDA, PAS, and hook frameworks deeply.
You always output valid JSON only — no markdown, no extra text.`;

  const charLimits = input.platform === 'META'
    ? { primaryText: 125, headline: 40, description: 30 }
    : { headline: 30, description: 90 };

  const userMessage = `Generate copy variants for this ${input.platform} ad:

Product/Service: ${input.product}
Campaign objective: ${input.objective ?? 'conversions'}
Target audience: ${input.targetAudience ?? 'not specified'}
Unique selling proposition: ${input.usp ?? 'not specified'}
Desired tone: ${input.tone ?? 'persuasive, direct'}
${input.existingCopy ? `\nExisting copy to improve on:\n${JSON.stringify(input.existingCopy, null, 2)}` : ''}
${input.topPerformingInsights ? `\nPerformance insights from this account: ${input.topPerformingInsights}` : ''}

Generate the following (strictly follow character limits):
${input.platform === 'META' ? `
- 5 Primary Text variants (up to ${charLimits.primaryText} chars recommended, can be longer for storytelling). Include the hook in the first 3 words. Vary the frameworks: pain-point, social proof, curiosity, direct offer, story.
- 5 Headline variants (max ${charLimits.headline} chars each). Make each punchy and benefit-driven.
- 4 Description variants (max ${charLimits.description} chars each). These appear under the link/image.
` : `
- 5 Headline variants (max 30 chars each) — for Google RSA
- 4 Description variants (max 90 chars each) — for Google RSA
`}

Return ONLY this JSON structure:
{
  "primaryTexts": [
    { "text": "...", "rationale": "why this works (1 sentence)", "tone": "pain-point|social-proof|curiosity|direct-offer|story" }
  ],
  "headlines": [
    { "text": "...", "charCount": 0 }
  ],
  "descriptions": [
    { "text": "...", "charCount": 0 }
  ],
  "generationContext": "1-2 sentences about the strategic angle used"
}`;

  const raw = await claudeGenerate(systemPrompt, userMessage);

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON object in response');
    const parsed = JSON.parse(jsonMatch[0]) as CopyVariants;
    // Ensure charCount is populated
    parsed.headlines = (parsed.headlines ?? []).map(h => ({
      ...h,
      charCount: h.text.length,
    }));
    parsed.descriptions = (parsed.descriptions ?? []).map(d => ({
      ...d,
      charCount: d.text.length,
    }));
    return parsed;
  } catch (e) {
    console.error('[strategy] Copy parse error:', e);
    throw new Error('Failed to parse copy variants from AI response');
  }
}

// ─── Auto-Rule Engine ─────────────────────────────────────────────────────────

export function evaluateAutoRules(
  scores: CampaignScore[],
  rules: AutoRule[],
): AutoRuleResult[] {
  const results: AutoRuleResult[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    for (const score of scores) {
      const { metrics } = score;
      const hasMinSpend = !rule.minSpendCents || score.metrics.spend7d >= rule.minSpendCents;
      if (!hasMinSpend) continue;

      let triggered = false;
      let reason = '';

      switch (rule.condition) {
        case 'ROAS_BELOW':
          triggered = metrics.roas < rule.threshold;
          reason = `ROAS ${metrics.roas.toFixed(2)}× is below threshold ${rule.threshold}×`;
          break;
        case 'ROAS_ABOVE':
          triggered = metrics.roas > rule.threshold;
          reason = `ROAS ${metrics.roas.toFixed(2)}× exceeds threshold ${rule.threshold}×`;
          break;
        case 'FREQUENCY_ABOVE':
          triggered = metrics.avgFrequency > rule.threshold;
          reason = `Frequency ${metrics.avgFrequency.toFixed(1)}× exceeds threshold ${rule.threshold}×`;
          break;
        case 'CTR_BELOW':
          triggered = metrics.ctr < rule.threshold;
          reason = `CTR ${metrics.ctr.toFixed(2)}% is below threshold ${rule.threshold}%`;
          break;
        case 'CPA_ABOVE':
          triggered = metrics.cpa > 0 && metrics.cpa > rule.threshold;
          reason = `CPA $${metrics.cpa.toFixed(2)} exceeds threshold $${rule.threshold}`;
          break;
      }

      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        campaignId: score.campaignId,
        campaignName: score.campaignName,
        triggered,
        reason: triggered ? reason : `Condition not met: ${reason}`,
        actionQueued: triggered ? rule.action : undefined,
      });
    }
  }

  return results;
}

// ─── Fetch performance data + produce scores ──────────────────────────────────

export async function getCampaignScores(brandId: string): Promise<CampaignScore[]> {
  const campaigns = await repo.getCampaignsByBrand(brandId);
  return scoreCampaigns(campaigns as any);
}
