import https from 'https';
import { CampaignStatus } from '@prisma/client';
import { GoogleCredentials } from './adsCredentialService';

const GOOGLE_ADS_API_VERSION = 'v14';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GoogleCampaignMetrics {
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
  dateKey: string;
}

export interface GoogleCampaignSummary {
  externalId: string;
  name: string;
  status: CampaignStatus;
  dailyBudgetCents: number | null;
}

// ─── OAuth2 token cache ───────────────────────────────────────────────────────

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

const tokenCache = new Map<string, TokenCache>();

async function getAccessToken(creds: GoogleCredentials): Promise<string> {
  const cacheKey = creds.refreshToken.slice(-16);
  const cached = tokenCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) return cached.accessToken;

  const body = new URLSearchParams({
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    refresh_token: creds.refreshToken,
    grant_type: 'refresh_token',
  }).toString();

  const result = await new Promise<{ access_token: string; expires_in: number }>((resolve, reject) => {
    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try {
          resolve(JSON.parse(buf));
        } catch {
          reject(new Error(`OAuth2 parse error: ${buf.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });

  if (!result.access_token) throw new Error('Failed to obtain Google access token');

  tokenCache.set(cacheKey, {
    accessToken: result.access_token,
    expiresAt: Date.now() + (result.expires_in - 60) * 1000,
  });

  return result.access_token;
}

// ─── GAQL search ─────────────────────────────────────────────────────────────

async function gaqlSearch(
  creds: GoogleCredentials,
  customerId: string,
  query: string,
): Promise<Record<string, unknown>[]> {
  const accessToken = await getAccessToken(creds);
  const body = JSON.stringify({ query });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'googleads.googleapis.com',
      path: `/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/googleAds:search`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': creds.developerToken,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(buf);
          if (parsed.error) {
            reject(new Error(`Google Ads API error: ${JSON.stringify(parsed.error)}`));
            return;
          }
          resolve(parsed.results ?? []);
        } catch {
          reject(new Error(`Google Ads parse error: ${buf.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Mutate helper ────────────────────────────────────────────────────────────

async function gaqlMutate(
  creds: GoogleCredentials,
  customerId: string,
  resource: string,
  operations: Record<string, unknown>[],
): Promise<unknown> {
  const accessToken = await getAccessToken(creds);
  const body = JSON.stringify({ operations });

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'googleads.googleapis.com',
      path: `/${GOOGLE_ADS_API_VERSION}/customers/${customerId}/${resource}:mutate`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': creds.developerToken,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(buf);
          if (parsed.error) {
            reject(new Error(`Google Ads mutate error: ${JSON.stringify(parsed.error)}`));
          } else {
            resolve(parsed);
          }
        } catch {
          reject(new Error(`Google Ads mutate parse error: ${buf.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Campaign fetch ───────────────────────────────────────────────────────────

export async function fetchCampaignMetrics(
  creds: GoogleCredentials,
  lookbackDays: number,
): Promise<GoogleCampaignMetrics[]> {
  const endDate = new Date().toISOString().slice(0, 10);
  const startDate = new Date(Date.now() - lookbackDays * 86_400_000).toISOString().slice(0, 10);
  const customerId = creds.customerId.replace(/-/g, '');

  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      metrics.impressions,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value,
      segments.date
    FROM campaign
    WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'
      AND campaign.status != 'REMOVED'
    ORDER BY segments.date DESC
    LIMIT 500
  `.trim();

  const rows = await gaqlSearch(creds, customerId, query);

  return rows.map(row => {
    const campaign = row.campaign as Record<string, unknown>;
    const metrics = row.metrics as Record<string, unknown>;
    const segments = row.segments as Record<string, unknown>;

    const costMicros = parseInt(String(metrics.cost_micros ?? 0), 10);
    const spendCents = Math.round(costMicros / 10_000);
    const impressions = parseInt(String(metrics.impressions ?? 0), 10);
    const clicks = parseInt(String(metrics.clicks ?? 0), 10);
    const conversions = parseFloat(String(metrics.conversions ?? 0));
    const conversionValue = parseFloat(String(metrics.conversions_value ?? 0));
    const conversionValueCents = Math.round(conversionValue * 100);

    const ctr = impressions > 0 ? clicks / impressions : 0;
    const cpc = clicks > 0 ? spendCents / clicks / 100 : 0;
    const cpa = conversions > 0 ? spendCents / conversions / 100 : 0;
    const roas = spendCents > 0 ? conversionValueCents / spendCents : 0;

    return {
      externalId: String(campaign.id),
      name: String(campaign.name),
      impressions,
      clicks,
      spendCents,
      conversions: Math.round(conversions),
      conversionValueCents,
      ctr,
      cpc,
      cpa,
      roas,
      dateKey: String(segments.date),
    };
  });
}

export async function fetchCampaigns(creds: GoogleCredentials): Promise<GoogleCampaignSummary[]> {
  const customerId = creds.customerId.replace(/-/g, '');
  const query = `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      campaign_budget.amount_micros
    FROM campaign
    WHERE campaign.status != 'REMOVED'
    LIMIT 500
  `.trim();

  const rows = await gaqlSearch(creds, customerId, query);
  return rows.map(row => {
    const campaign = row.campaign as Record<string, unknown>;
    const budget = row.campaignBudget as Record<string, unknown> | undefined;
    const amountMicros = parseInt(String(budget?.amountMicros ?? 0), 10);
    const dailyBudgetCents = amountMicros > 0 ? Math.round(amountMicros / 10_000) : null;

    return {
      externalId: String(campaign.id),
      name: String(campaign.name),
      status: mapGoogleStatus(String(campaign.status ?? 'PAUSED')),
      dailyBudgetCents,
    };
  });
}

// ─── Execute actions ──────────────────────────────────────────────────────────

export async function pauseCampaign(creds: GoogleCredentials, externalId: string): Promise<unknown> {
  const customerId = creds.customerId.replace(/-/g, '');
  return gaqlMutate(creds, customerId, 'campaigns', [{
    update: {
      resourceName: `customers/${customerId}/campaigns/${externalId}`,
      status: 'PAUSED',
    },
    updateMask: 'status',
  }]);
}

export async function updateCampaignBudget(
  creds: GoogleCredentials,
  budgetResourceName: string,
  dailyBudgetCents: number,
): Promise<unknown> {
  const customerId = creds.customerId.replace(/-/g, '');
  const amountMicros = dailyBudgetCents * 10_000;
  return gaqlMutate(creds, customerId, 'campaignBudgets', [{
    update: { resourceName: budgetResourceName, amountMicros: String(amountMicros) },
    updateMask: 'amountMicros',
  }]);
}

export async function pauseAdGroup(creds: GoogleCredentials, externalId: string): Promise<unknown> {
  const customerId = creds.customerId.replace(/-/g, '');
  return gaqlMutate(creds, customerId, 'adGroups', [{
    update: {
      resourceName: `customers/${customerId}/adGroups/${externalId}`,
      status: 'PAUSED',
    },
    updateMask: 'status',
  }]);
}

export function mapGoogleStatus(status: string): CampaignStatus {
  const map: Record<string, CampaignStatus> = {
    ENABLED: CampaignStatus.ACTIVE,
    PAUSED: CampaignStatus.PAUSED,
    REMOVED: CampaignStatus.ARCHIVED,
  };
  return map[status] ?? CampaignStatus.PENDING;
}
