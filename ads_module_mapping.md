# Bottech Ads Module Mapping (Meta + Analytics + Agent Feedback)

Generated: 2026-04-24
Workspace: C:\Users\ronni_xwasy9\Claude2

## 1) Scope Mapped

This mapping covers:
- Ads backend engine (accounts, campaigns, metrics, workflow, approvals, guardrails)
- Meta/Google connector services
- Strategy/insights layer used by strategy bots
- Clawbot marketing agentic network interfaces
- Ads frontend pages + stores

Core files inspected:
- Backend: `backend/src/routes/ads.ts`, `backend/src/services/adsWorkflowService.ts`, `backend/src/database/adsRepository.ts`, `backend/src/services/metaAdsService.ts`, `backend/src/services/googleAdsService.ts`, `backend/src/services/adsGuardrailService.ts`, `backend/src/services/strategyService.ts`, `backend/src/routes/strategy.ts`, `backend/src/routes/clawbot.ts`, `backend/src/services/clawbotService.ts`, `backend/src/schedulers/adsScheduler.ts`, `backend/prisma/schema.prisma`
- Frontend: `frontend/src/app/store/adsStore.ts`, `frontend/src/app/store/strategyStore.ts`, `frontend/src/app/pages/AdsManagement.tsx`, `frontend/src/app/pages/AdsActionLog.tsx`, `frontend/src/app/pages/AdCreator.tsx`, `frontend/src/app/pages/Strategy.tsx`, `frontend/src/app/pages/ClawbotPage.tsx`

---

## 2) Backend Function Map

### 2.1 Data/Repository Layer (`backend/src/database/adsRepository.ts`)

Accounts + config:
- `createAdsAccount(data)`
- `getAdsAccount(id)`
- `getActiveAdsAccounts()`
- `getAdsAccountsByBrand(brandId)`
- `updateAdsAccount(id, data)`
- `upsertAdsAgentConfig(adsAccountId, data)`
- `getAdsAgentConfig(adsAccountId)`

Campaign structure + metrics:
- `upsertCampaign(data)`
- `getCampaignsByBrand(brandId)`
- `getCampaignsByAccount(adsAccountId)`
- `upsertAdSet(data)`
- `upsertPerformanceMetric(data)`
- `getMetricsByCampaign(campaignId, days)`
- `getMetricsByAccount(adsAccountId, lookbackDays)`

Actioning + workflow logs:
- `createActionLog(data)`
- `updateActionLogStatus(id, data)`
- `getActionLogsByBrand(brandId, opts)`
- `getRecentActionsByEntity(entityId, hours)`
- `getHumanApprovalQueue(brandId)`
- `getStaleApprovalItems(olderThanHours)`
- `createAgentDecision(data)`
- `getWorkflowRuns(brandId, limit)`

### 2.2 Ads API Layer (`backend/src/routes/ads.ts`)

Endpoints:
- `GET /api/ads/accounts/:brandId`
- `POST /api/ads/accounts`
- `GET /api/ads/campaigns/:brandId`
- `GET /api/ads/metrics/:campaignId`
- `GET /api/ads/action-log/:brandId`
- `GET /api/ads/approval-queue/:brandId`
- `POST /api/ads/approval-queue/:actionId/approve`
- `POST /api/ads/approval-queue/:actionId/reject`
- `GET /api/ads/guardrails/:adsAccountId`
- `PATCH /api/ads/guardrails/:adsAccountId`
- `POST /api/ads/workflow/:brandId/trigger`
- `GET /api/ads/workflow-runs/:brandId`

### 2.3 Workflow Orchestration (`backend/src/services/adsWorkflowService.ts`)

Bridge + orchestration functions:
- `bridgePost(path, body)`
- `bridgeGet(path)`
- `sleep(ms)`
- `bridgeTask(agentId, payload)`
- `fetchAndStoreMetrics(adsAccountId, platform, lookbackDays)`
- `executeApprovedActions(actions, brandId, adsAccountId, workflowRunId, platform)`
- `runDailyOptimizationWorkflow(brandId, adsAccountId, dryRun)`
- `runCreativeRefreshWorkflow(brandId, adsAccountId, fatigueActions, workflowRunId, platform)`
- `checkStaleApprovalQueue()`

Actual workflow stages implemented:
1. Load account + guardrail config
2. Fetch metrics from platform API (if not dry run)
3. Build analyst input from DB
4. Call `agent-ads-analyst` via bridge
5. Call `agent-ads-decision` via bridge
6. Re-verify actions with server guardrails
7. Queue `AWAITING_HUMAN` actions
8. Execute approved actions via Meta/Google services
9. Trigger creative refresh flow on fatigue flags
10. Call `agent-ads-reporter`

### 2.4 Guardrails (`backend/src/services/adsGuardrailService.ts`)

Functions:
- `evaluateAction(action, config, recentActions, spendRecords)`
- `verifyApprovedActions(approvedActions, config, recentActions, spendRecords)`

Checks enforced:
- Allowed action allowlist
- Blocked entity list
- Confidence threshold
- Cooldown window
- Minimum spend threshold for budget/bid actions
- Budget increase cap (clamps instead of reject)
- Manual approval override
- High-impact actions always human-gated

### 2.5 Platform Connectors

Meta (`backend/src/services/metaAdsService.ts`):
- `fetchCampaigns(creds)`
- `fetchCampaignInsights(creds, lookbackDays)` (campaign-level, daily)
- `pauseCampaign(creds, externalId)`
- `resumeCampaign(creds, externalId)`
- `updateCampaignBudget(creds, externalId, dailyBudgetCents)`
- `pauseAdSet(creds, externalId)`
- `mapMetaStatus(status)`

Google (`backend/src/services/googleAdsService.ts`):
- `fetchCampaignMetrics(creds, lookbackDays)`
- `pauseCampaign(creds, externalId)`
- `updateCampaignBudget(creds, budgetResourceName, dailyBudgetCents)`
- `pauseAdGroup(creds, externalId)`
- `mapGoogleStatus(status)`

Credentials (`backend/src/services/adsCredentialService.ts`):
- `encryptCredentials(creds)`
- `decryptCredentials(encrypted)`
- `getMetaCredentials(adsAccountId)`
- `getGoogleCredentials(adsAccountId)`

### 2.6 Strategy Layer for Strategy Bots

Strategy routes (`backend/src/routes/strategy.ts`):
- `GET /api/strategy/scores/:brandId`
- `POST /api/strategy/recommendations/:brandId`
- `POST /api/strategy/copy-variants`
- `POST /api/strategy/auto-rules/evaluate/:brandId`
- `POST /api/strategy/quick-action/:brandId`

Strategy service (`backend/src/services/strategyService.ts`):
- `scoreCampaigns(campaigns)`
- `generateRecommendations(scores, accountPlatform)`
- `generateCopyVariants(input)`
- `evaluateAutoRules(scores, rules)`
- `getCampaignScores(brandId)`

### 2.7 Marketing Agentic Network Interfaces

Clawbot routes (`backend/src/routes/clawbot.ts`):
- Strategy generation, campaign brief generation, network status, strategy/brief history, cost endpoints.

Clawbot service (`backend/src/services/clawbotService.ts`):
- `generateBrandStrategy(...)`
- `generateCampaignBrief(...)`
- `getAgentStatus(brandId)`
- Cost logging/reporting functions.

Agent registry (`backend/src/services/agentRegistry.ts`):
- Defines strategic/intelligence/decision/execution/control agents and model runtime configs.

### 2.8 Scheduling

- `initAdsScheduler()` in `backend/src/schedulers/adsScheduler.ts`
  - Daily run at `06:00 UTC`
  - Stale queue check every `4 hours`
- Hooked from `startScheduler()` in `backend/src/scheduler.ts`

---

## 3) Frontend Feature Map

### Ads module frontend capabilities

State + API adapters:
- `frontend/src/app/store/adsStore.ts`
  - Fetch campaigns/action logs/approval queue/guardrails/workflow runs
  - Approve/reject actions
  - Trigger workflow
  - Submit draft (`/ads/drafts/:brandId` expected)

Screens:
- `AdsManagement.tsx`
  - KPI overview (spend/ROAS/conversions/active campaigns)
  - Workflow run timeline
  - Campaign cards
  - Approval queue panel
  - Guardrail config panel
  - Manual “Run Now” trigger
- `AdsActionLog.tsx`
  - Action history by agent layer/status, filters, export UX
- `AdCreator.tsx`
  - AI copy generation (Meta/Google variants)
  - Campaign context selection
  - Submit-for-approval UX

### Strategy frontend capabilities

State + API adapters:
- `frontend/src/app/store/strategyStore.ts`
  - Fetch scores
  - Generate recommendations
  - Generate copy variants
  - Evaluate auto rules
  - Quick action queueing

Screen:
- `Strategy.tsx`
  - AI insights tab
  - Performance cards
  - Auto-rules tab
  - Quick actions (queue to approval)

### Agent network UI

- `ClawbotPage.tsx`
  - Brand data intake
  - Strategy generation
  - Agent network visualization
  - Cost panel

---

## 4) Data Model Coverage (`backend/prisma/schema.prisma`)

Implemented entities:
- `AdsAccount`
- `Campaign`
- `AdSet`
- `Ad`
- `PerformanceMetric`
- `ActionLog`
- `AgentDecision`
- `AdsAgentConfig`
- Clawbot-side: `BrandStrategy`, `CampaignBrief`, `ApiCostLog`

Enums:
- `AdsPlatform`: `META`, `GOOGLE`
- `CampaignStatus`: `ACTIVE`, `PAUSED`, `ARCHIVED`, `DELETED`, `PENDING`
- `ActionStatus`: `PENDING`, `APPROVED`, `REJECTED`, `EXECUTED`, `FAILED`, `AWAITING_HUMAN`

---

## 5) Current End-to-End Flow (Implemented)

1. Account credentials are manually stored via `POST /api/ads/accounts`
2. Workflow triggered by scheduler or manual trigger route
3. Metrics pull from Meta/Google campaign-level APIs into `PerformanceMetric`
4. Analyst and decision agents called through bridge
5. Server guardrails enforce hard checks
6. Approved actions execute against platform APIs
7. Human-required actions are queued
8. Reporter agent runs with action log + metrics
9. UI surfaces campaigns, approvals, logs, guardrails, strategy insights

---

## 6) Critical Gaps vs Intended Meta + Analytics + Learning Loop

### A) Meta integration gaps

- No OAuth connect flow in ads module (manual credential payload only)
- No webhook ingestion (status changes, spend anomalies, learning events)
- No automatic campaign/adset/ad object sync path calling `upsertCampaign`/`upsertAdSet` from platform data
  - `fetchCampaigns()` exists but is not wired into any sync pipeline
- No ad-level insights ingestion (current workflow is campaign-level)

### B) Analytics integration gaps

- Ads metrics are siloed in `performance_metrics`; no explicit attribution join with orders/conversions from broader analytics datasets
- No unified cross-channel attribution model wired into ads workflow decisions
- Insights routes are business KPI-focused; not ads-specific diagnostics by campaign/adset/ad dimensions
- No freshness/latency SLA tracking for ads ingestion

### C) Learning-to-strategy bot feedback gaps

- Creative refresh workflow uses placeholder feedback (`topPerformingHooks: []`, static underperforming patterns)
- Clawbot strategy generation is not automatically fed from latest ads performance insights
- No persisted “learning memory” object for:
  - winning hooks
  - failed patterns
  - audience saturation markers
  - recommendation outcomes vs realized outcomes
- No closed-loop retraining cadence from action outcome -> next strategy prompt context

### D) Product/implementation gaps observed in current module

- Frontend calls `/ads/drafts/:brandId` but backend has no matching route (draft submission path appears missing)
- Ads/Strategy stores expose `setSelectedBrand(...)`, but no call sites found wiring active brand/account into these stores
  - risk: Ads/Strategy pages may remain unbound unless set externally by code not present here
- `approve` endpoint marks approved but does not execute immediately (deferred to next workflow cycle)

---

## 7) Functionality Status Matrix

Implemented:
- Ads account storage + encrypted credentials
- Workflow orchestration with agent stages
- Guardrails + human approval queue
- Campaign-level metric ingestion (Meta/Google)
- Action logs + workflow history
- Strategy scoring/recommendations/copy variants endpoints
- Scheduler automation

Partially implemented:
- Meta integration (API calls exist, but account/campaign sync and webhook/event model incomplete)
- Strategy learning loop (signals exist but no persistent learning memory/automated reuse)
- Creative refresh (agent call exists but fed by placeholder learning context)

Missing (for target intent):
- OAuth account connection + token lifecycle management
- Campaign/adset/ad sync jobs + reconciliation
- Ads analytics attribution bridge to revenue outcomes
- Learning memory + recommendation outcome tracking
- Deterministic feedback pipeline from ads performance -> strategy bots
- Missing `/api/ads/drafts/:brandId` backend implementation

---

## 8) Target Closed-Loop Architecture (Recommended)

1. Connect
- OAuth for Meta account binding
- Secure token refresh + permission checks

2. Ingest
- Scheduled pulls (campaign/adset/ad)
- Webhooks for near-real-time updates
- Data quality + freshness monitors

3. Unify
- Join ads data with order/revenue events
- Compute channel/campaign/adset/ad attribution views

4. Learn
- Persist structured learnings per brand/account:
  - creative winners/losers
  - audience performance segments
  - budget move outcomes
  - confidence calibration

5. Direct strategy bots
- Inject latest learning summaries into:
  - strategy generation
  - campaign briefing
  - copy variant generation
  - auto-rule thresholds

6. Govern
- Human approvals for high-risk actions
- Guardrail policy versioning + auditability

---

## 9) Implementation Plan (Phased)

### Phase 1: Integration Reliability (2-3 weeks)
- Add Meta OAuth + token refresh management
- Implement campaign/adset/ad sync jobs using existing repository upserts
- Add `/api/ads/drafts/:brandId` backend route + persistence
- Add ingestion health metrics (freshness, failure counts, rate-limit events)

### Phase 2: Analytics + Attribution (2-4 weeks)
- Build ads-to-order attribution tables and daily materialized views
- Add ads-specific analytics endpoints + dashboard cards
- Extend workflow inputs with attributed revenue/CAC/LTV features

### Phase 3: Learning Memory + Strategy Direction (3-5 weeks)
- Create `ads_learning_insights` store (or equivalent)
- Persist action outcomes and realized deltas
- Feed learning snapshots into Clawbot + strategy prompts automatically
- Add confidence scoring and recommendation quality monitoring

### Phase 4: Autonomous Optimization Hardening (2-3 weeks)
- Add policy versioning + rollback for guardrails
- Add outcome-based auto-rule tuning
- Add alerting for model/decision drift

---

## 10) Immediate Next Build Items (High Priority)

1. Wire campaign sync path:
- call Meta `fetchCampaigns()` and persist via `upsertCampaign`
- add Google campaign metadata sync equivalent

2. Fix missing API for ad draft submission:
- implement backend route consumed by `frontend/src/app/store/adsStore.ts`

3. Add learning payload contract between ads workflow and strategy:
- define schema for `topPerformingHooks`, `underperformingPatterns`, `audienceSignals`, `budgetOutcomeSignals`

4. Add brand/account binding for ads and strategy stores in frontend:
- ensure selected brand + ads account are actually injected into both stores from global brand context

---

## 11) Notes

- Sensitive credentials were detected in the external access note you shared; they are not reproduced in this document.
- This map reflects current implementation in code, not intended behavior in product decks.
