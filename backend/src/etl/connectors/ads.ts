/**
 * Ads connectors — Meta and Google Ads campaign-insights ingestion.
 *
 * The existing services in `services/metaAdsService.ts` and
 * `services/googleAdsService.ts` keep their HTTP code (they're well-tested
 * and call billed APIs — we shouldn't risk a regression in pursuit of
 * "purity"). Instead, the ETL connectors below DELEGATE to those services
 * for the extract step and add the pipeline guarantees on top:
 *
 *   • every insight payload is persisted to raw_events
 *   • transform/load failures land in etl_dead_letters (replayable)
 *   • the run is recorded in etl_runs with success/partial/failed status
 *
 * Watermarks: ad-platform insights use date-partitioned rows. Each
 * canonical PerformanceMetric is keyed by (campaignId, dateKey), so
 * re-running a window simply upserts. We still bookmark the highest
 * dateKey we've successfully loaded so subsequent runs can shorten
 * the lookback window for efficiency, not correctness.
 */

import { AdsPlatform } from '@prisma/client';
import type { Connector, RawEvent } from '../types';
import * as metaAdsService from '../../services/metaAdsService';
import * as googleAdsService from '../../services/googleAdsService';
import { getMetaCredentials, getGoogleCredentials } from '../../services/adsCredentialService';
import { upsertPerformanceMetric, getCampaignsByAccount } from '../../database/adsRepository';

interface AdsCanonicalMetric {
  adsAccountId: string;
  platform: AdsPlatform;
  externalCampaignId: string;
  dateKey: string;
  impressions: number;
  clicks: number;
  spendCents: number;
  conversions: number;
  conversionValueCents: number;
  ctr: number;
  cpc: number;
  cpa: number;
  roas: number;
  frequencyScore?: number;
}

// Resolves an upstream campaign external id to our internal Campaign row.
// Cached per-run to avoid N round-trips when ingesting per-day rows.
function makeCampaignResolver(adsAccountId: string) {
  let cache: Map<string, string> | null = null;
  return async (externalId: string): Promise<string | null> => {
    if (!cache) {
      const rows = await getCampaignsByAccount(adsAccountId);
      cache = new Map(rows.map(r => [r.externalId, r.id]));
    }
    return cache.get(externalId) ?? null;
  };
}

// ─── Meta Ads connector ──────────────────────────────────────────────────────

export function makeMetaAdsConnector(opts: {
  brandId: string;
  adsAccountId: string;
  lookbackDays?: number;
}): Connector<metaAdsService.MetaCampaignMetrics, AdsCanonicalMetric> {
  const lookbackDays = opts.lookbackDays ?? 7;
  const resolve = makeCampaignResolver(opts.adsAccountId);

  return {
    source: 'meta-ads',
    topic: 'campaign-insights',
    async extract() {
      const creds = await getMetaCredentials(opts.adsAccountId);
      const insights = await metaAdsService.fetchCampaignInsights(creds, lookbackDays);
      const events: RawEvent<metaAdsService.MetaCampaignMetrics>[] = insights.map(i => ({
        source: 'meta-ads',
        topic: 'campaign-insights',
        brandId: opts.brandId,
        externalId: `${i.externalId}:${i.dateKey}`,
        payload: i,
      }));
      const maxDateKey = insights.reduce((m, r) => (r.dateKey > m ? r.dateKey : m), '1970-01-01');
      return {
        events,
        nextWatermark: insights.length ? { lastDateKey: maxDateKey } : undefined,
      };
    },
    async transform(raw) {
      const i = raw.payload;
      return [{
        adsAccountId: opts.adsAccountId,
        platform: AdsPlatform.META,
        externalCampaignId: i.externalId,
        dateKey: i.dateKey,
        impressions: i.impressions,
        clicks: i.clicks,
        spendCents: i.spendCents,
        conversions: i.conversions,
        conversionValueCents: i.conversionValueCents,
        ctr: i.ctr,
        cpc: i.cpc,
        cpa: i.cpa,
        roas: i.roas,
        frequencyScore: i.frequency,
      }];
    },
    async load(row) {
      const campaignId = await resolve(row.externalCampaignId);
      // Skip silently when the campaign isn't in our catalog yet — the
      // catalog sync runs first, but if a brand-new campaign appears
      // mid-window we'd rather drop the metric than write an orphan row.
      if (!campaignId) return;
      await upsertPerformanceMetric({
        campaignId,
        platform: row.platform,
        dateKey: row.dateKey,
        impressions: row.impressions,
        clicks: row.clicks,
        spendCents: row.spendCents,
        conversions: row.conversions,
        conversionValueCents: row.conversionValueCents,
        ctr: row.ctr,
        cpc: row.cpc,
        cpa: row.cpa,
        roas: row.roas,
        frequencyScore: row.frequencyScore,
      });
    },
  };
}

// ─── Google Ads connector ────────────────────────────────────────────────────

export function makeGoogleAdsConnector(opts: {
  brandId: string;
  adsAccountId: string;
  lookbackDays?: number;
}): Connector<googleAdsService.GoogleCampaignMetrics, AdsCanonicalMetric> {
  const lookbackDays = opts.lookbackDays ?? 7;
  const resolve = makeCampaignResolver(opts.adsAccountId);

  return {
    source: 'google-ads',
    topic: 'campaign-insights',
    async extract() {
      const creds = await getGoogleCredentials(opts.adsAccountId);
      const metrics = await googleAdsService.fetchCampaignMetrics(creds, lookbackDays);
      const events: RawEvent<googleAdsService.GoogleCampaignMetrics>[] = metrics.map(m => ({
        source: 'google-ads',
        topic: 'campaign-insights',
        brandId: opts.brandId,
        externalId: `${m.externalId}:${m.dateKey}`,
        payload: m,
      }));
      const maxDateKey = metrics.reduce((m, r) => (r.dateKey > m ? r.dateKey : m), '1970-01-01');
      return {
        events,
        nextWatermark: metrics.length ? { lastDateKey: maxDateKey } : undefined,
      };
    },
    async transform(raw) {
      const m = raw.payload;
      return [{
        adsAccountId: opts.adsAccountId,
        platform: AdsPlatform.GOOGLE,
        externalCampaignId: m.externalId,
        dateKey: m.dateKey,
        impressions: m.impressions,
        clicks: m.clicks,
        spendCents: m.spendCents,
        conversions: m.conversions,
        conversionValueCents: m.conversionValueCents,
        ctr: m.ctr,
        cpc: m.cpc,
        cpa: m.cpa,
        roas: m.roas,
      }];
    },
    async load(row) {
      const campaignId = await resolve(row.externalCampaignId);
      if (!campaignId) return;
      await upsertPerformanceMetric({
        campaignId,
        platform: row.platform,
        dateKey: row.dateKey,
        impressions: row.impressions,
        clicks: row.clicks,
        spendCents: row.spendCents,
        conversions: row.conversions,
        conversionValueCents: row.conversionValueCents,
        ctr: row.ctr,
        cpc: row.cpc,
        cpa: row.cpa,
        roas: row.roas,
      });
    },
  };
}
