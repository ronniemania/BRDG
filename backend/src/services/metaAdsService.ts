import https from 'https';
import { AdsPlatform, CampaignStatus } from '@prisma/client';
import { MetaCredentials } from './adsCredentialService';

const META_API_VERSION = 'v18.0';
const BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MetaCampaignMetrics {
  externalId: string;
  name: string;
  impressions: number;
  clicks: number;
  spendCents: number;
  conversions: number;
  conversionValueCents: number;
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
  frequency: number;
  dateKey: string;
}

export interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  objective?: string;
  daily_budget?: string;
}

// ─── HTTP helper with retry ───────────────────────────────────────────────────

function metaGet(path: string, params: Record<string, string>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const qs = new URLSearchParams(params).toString();
    const url = new URL(`${BASE_URL}${path}?${qs}`);

    let attempt = 0;
    const maxAttempts = 3;

    function attempt_() {
      attempt++;
      const req = https.get({
        hostname: url.hostname,
        path: url.pathname + url.search,
        headers: { 'Accept': 'application/json' },
      }, (res) => {
        let buf = '';
        res.on('data', c => buf += c);
        res.on('end', () => {
          try {
            const body = JSON.parse(buf);
            if (res.statusCode === 429 && attempt < maxAttempts) {
              const delay = Math.pow(2, attempt) * 1000;
              console.warn(`[meta] Rate limited, retry ${attempt} in ${delay}ms`);
              setTimeout(attempt_, delay);
              return;
            }
            if (body.error) {
              reject(new Error(`Meta API error: ${body.error.message} (code ${body.error.code})`));
              return;
            }
            resolve(body);
          } catch (e) {
            reject(new Error(`Meta API parse error: ${buf.slice(0, 200)}`));
          }
        });
      });
      req.on('error', reject);
    }

    attempt_();
  });
}

function metaPost(path: string, token: string, body: Record<string, string>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({ ...body, access_token: token }).toString();
    const req = https.request({
      hostname: 'graph.facebook.com',
      path: `/${META_API_VERSION}${path}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(buf);
          if (parsed.error) {
            reject(new Error(`Meta API error: ${parsed.error.message}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Meta POST parse error: ${buf.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// ─── Campaign operations ──────────────────────────────────────────────────────

export async function fetchCampaigns(creds: MetaCredentials): Promise<MetaCampaign[]> {
  const res = await metaGet(`/act_${creds.adAccountId}/campaigns`, {
    fields: 'id,name,status,objective,daily_budget',
    limit: '200',
    access_token: creds.accessToken,
  }) as { data: MetaCampaign[] };
  return res.data ?? [];
}

export async function fetchCampaignInsights(
  creds: MetaCredentials,
  lookbackDays: number,
): Promise<MetaCampaignMetrics[]> {
  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - lookbackDays * 86_400_000).toISOString().slice(0, 10);

  const res = await metaGet(`/act_${creds.adAccountId}/insights`, {
    fields: 'campaign_id,campaign_name,impressions,clicks,spend,actions,action_values,frequency',
    level: 'campaign',
    time_range: JSON.stringify({ since: startDate, until: endDate }),
    time_increment: '1',
    limit: '500',
    access_token: creds.accessToken,
  }) as { data: Record<string, unknown>[] };

  const rows = res.data ?? [];
  return rows.map(row => {
    const spendCents = Math.round(parseFloat((row.spend as string) || '0') * 100);
    const impressions = parseInt((row.impressions as string) || '0', 10);
    const clicks = parseInt((row.clicks as string) || '0', 10);
    const frequency = parseFloat((row.frequency as string) || '0');

    // Extract purchases/conversions from actions array
    const actions = (row.actions as Array<{ action_type: string; value: string }>) ?? [];
    const conversions = actions
      .filter(a => a.action_type === 'purchase' || a.action_type === 'omni_purchase')
      .reduce((s, a) => s + parseInt(a.value, 10), 0);

    const actionValues = (row.action_values as Array<{ action_type: string; value: string }>) ?? [];
    const conversionValueCents = Math.round(
      actionValues
        .filter(a => a.action_type === 'purchase' || a.action_type === 'omni_purchase')
        .reduce((s, a) => s + parseFloat(a.value), 0) * 100,
    );

    const ctr = clicks > 0 && impressions > 0 ? clicks / impressions : 0;
    const cpc = clicks > 0 ? spendCents / clicks / 100 : 0;
    const cpa = conversions > 0 ? spendCents / conversions / 100 : 0;
    const roas = spendCents > 0 ? conversionValueCents / spendCents : 0;

    return {
      externalId: row.campaign_id as string,
      name: row.campaign_name as string,
      impressions,
      clicks,
      spendCents,
      conversions,
      conversionValueCents,
      ctr,
      cpc,
      cpa,
      roas,
      frequency,
      dateKey: (row.date_start as string) ?? endDate,
    };
  });
}

// ─── Execute actions ──────────────────────────────────────────────────────────

export async function pauseCampaign(creds: MetaCredentials, externalId: string): Promise<unknown> {
  return metaPost(`/${externalId}`, creds.accessToken, { status: 'PAUSED' });
}

export async function resumeCampaign(creds: MetaCredentials, externalId: string): Promise<unknown> {
  return metaPost(`/${externalId}`, creds.accessToken, { status: 'ACTIVE' });
}

export async function updateCampaignBudget(
  creds: MetaCredentials,
  externalId: string,
  dailyBudgetCents: number,
): Promise<unknown> {
  // Meta takes daily_budget as cents (integer string)
  return metaPost(`/${externalId}`, creds.accessToken, {
    daily_budget: String(dailyBudgetCents),
  });
}

export async function pauseAdSet(creds: MetaCredentials, externalId: string): Promise<unknown> {
  return metaPost(`/${externalId}`, creds.accessToken, { status: 'PAUSED' });
}

export function mapMetaStatus(status: string): CampaignStatus {
  const map: Record<string, CampaignStatus> = {
    ACTIVE: CampaignStatus.ACTIVE,
    PAUSED: CampaignStatus.PAUSED,
    ARCHIVED: CampaignStatus.ARCHIVED,
    DELETED: CampaignStatus.DELETED,
  };
  return map[status] ?? CampaignStatus.PENDING;
}
