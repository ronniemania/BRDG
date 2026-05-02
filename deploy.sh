#!/bin/bash
# ─── BRDG Alpha — Deploy changed files to VPS ────────────────────────────────
# Run this from Git Bash or WSL on Windows:
#   bash deploy.sh
#
# Prerequisites: SSH key auth configured for the VPS.
# Set VPS_USER and VPS_HOST below before running.

VPS_USER="claude-deploy"     # change if you use a different SSH user
VPS_HOST="95.111.239.171"    # e.g. 192.168.1.1 or yourdomain.com
VPS_ROOT="/var/www/optisync"
LOCAL_ROOT="$(cd "$(dirname "$0")" && pwd)"

SCP="scp -i ~/.ssh/vps_key -o StrictHostKeyChecking=no"
SSH="ssh -i ~/.ssh/vps_key -o StrictHostKeyChecking=no"

echo "=== BRDG Alpha Deploy ==="
echo "Target: ${VPS_USER}@${VPS_HOST}:${VPS_ROOT}"
echo ""

# ─── Helper: copy a single file, creating the remote dir first ───────────────
deploy_file() {
  local src="$1"   # relative to LOCAL_ROOT
  local dst="$2"   # full remote path
  local dir
  dir=$(dirname "$dst")
  $SSH "${VPS_USER}@${VPS_HOST}" "mkdir -p '${dir}'"
  $SCP "${LOCAL_ROOT}/${src}" "${VPS_USER}@${VPS_HOST}:${dst}"
  echo "  ✓ ${src}"
}

# ─── 1. Backend — new / added files ──────────────────────────────────────────
echo "[1/5] Deploying new backend files..."

deploy_file "backend/src/routes/businessHealth.ts" \
  "${VPS_ROOT}/backend/src/routes/businessHealth.ts"

deploy_file "backend/src/routes/alerts.ts" \
  "${VPS_ROOT}/backend/src/routes/alerts.ts"

deploy_file "backend/src/routes/preferences.ts" \
  "${VPS_ROOT}/backend/src/routes/preferences.ts"

deploy_file "backend/src/routes/sharedData.ts" \
  "${VPS_ROOT}/backend/src/routes/sharedData.ts"

deploy_file "backend/src/routes/fulfillment.ts" \
  "${VPS_ROOT}/backend/src/routes/fulfillment.ts"

deploy_file "backend/src/routes/search.ts" \
  "${VPS_ROOT}/backend/src/routes/search.ts"

deploy_file "backend/src/routes/sync.ts" \
  "${VPS_ROOT}/backend/src/routes/sync.ts"

deploy_file "backend/src/routes/rbac.ts" \
  "${VPS_ROOT}/backend/src/routes/rbac.ts"

deploy_file "backend/src/routes/deliveryProfiles.ts" \
  "${VPS_ROOT}/backend/src/routes/deliveryProfiles.ts"

deploy_file "backend/src/routes/mailbox.ts" \
  "${VPS_ROOT}/backend/src/routes/mailbox.ts"

deploy_file "backend/src/routes/freshdesk.ts" \
  "${VPS_ROOT}/backend/src/routes/freshdesk.ts"

deploy_file "backend/src/routes/ads.ts" \
  "${VPS_ROOT}/backend/src/routes/ads.ts"

deploy_file "backend/src/routes/strategy.ts" \
  "${VPS_ROOT}/backend/src/routes/strategy.ts"

deploy_file "backend/src/services/deliveryProfileService.ts" \
  "${VPS_ROOT}/backend/src/services/deliveryProfileService.ts"

deploy_file "backend/src/services/reportScheduler.ts" \
  "${VPS_ROOT}/backend/src/services/reportScheduler.ts"

deploy_file "backend/src/services/slackService.ts" \
  "${VPS_ROOT}/backend/src/services/slackService.ts"

deploy_file "backend/src/services/strategyService.ts" \
  "${VPS_ROOT}/backend/src/services/strategyService.ts"

deploy_file "backend/src/services/adsCredentialService.ts" \
  "${VPS_ROOT}/backend/src/services/adsCredentialService.ts"

deploy_file "backend/src/services/adsGuardrailService.ts" \
  "${VPS_ROOT}/backend/src/services/adsGuardrailService.ts"

deploy_file "backend/src/services/adsWorkflowService.ts" \
  "${VPS_ROOT}/backend/src/services/adsWorkflowService.ts"

deploy_file "backend/src/services/metaAdsService.ts" \
  "${VPS_ROOT}/backend/src/services/metaAdsService.ts"

deploy_file "backend/src/services/googleAdsService.ts" \
  "${VPS_ROOT}/backend/src/services/googleAdsService.ts"

deploy_file "backend/src/services/clawbotService.ts" \
  "${VPS_ROOT}/backend/src/services/clawbotService.ts"

deploy_file "backend/src/database/adsRepository.ts" \
  "${VPS_ROOT}/backend/src/database/adsRepository.ts"

deploy_file "backend/src/database/prismaClient.ts" \
  "${VPS_ROOT}/backend/src/database/prismaClient.ts"

deploy_file "backend/src/routes/clawbot.ts" \
  "${VPS_ROOT}/backend/src/routes/clawbot.ts"

deploy_file "backend/src/routes/health.ts" \
  "${VPS_ROOT}/backend/src/routes/health.ts"

deploy_file "backend/src/routes/webhooks.ts" \
  "${VPS_ROOT}/backend/src/routes/webhooks.ts"

deploy_file "backend/src/routes/agents.ts" \
  "${VPS_ROOT}/backend/src/routes/agents.ts"

deploy_file "backend/src/routes/etl.ts" \
  "${VPS_ROOT}/backend/src/routes/etl.ts"

deploy_file "backend/src/schedulers/adsScheduler.ts" \
  "${VPS_ROOT}/backend/src/schedulers/adsScheduler.ts"

deploy_file "backend/src/utils/logger.ts" \
  "${VPS_ROOT}/backend/src/utils/logger.ts"

deploy_file "backend/src/utils/errors.ts" \
  "${VPS_ROOT}/backend/src/utils/errors.ts"

deploy_file "backend/src/utils/rateLimit.ts" \
  "${VPS_ROOT}/backend/src/utils/rateLimit.ts"

deploy_file "backend/src/utils/encryption.ts" \
  "${VPS_ROOT}/backend/src/utils/encryption.ts"

deploy_file "backend/src/config/csrf.ts" \
  "${VPS_ROOT}/backend/src/config/csrf.ts"

deploy_file "backend/src/config/middleware.ts" \
  "${VPS_ROOT}/backend/src/config/middleware.ts"

deploy_file "backend/src/config/modelCatalog.ts" \
  "${VPS_ROOT}/backend/src/config/modelCatalog.ts"

deploy_file "backend/src/etl/types.ts" \
  "${VPS_ROOT}/backend/src/etl/types.ts"

deploy_file "backend/src/etl/pipeline.ts" \
  "${VPS_ROOT}/backend/src/etl/pipeline.ts"

deploy_file "backend/src/etl/audit.ts" \
  "${VPS_ROOT}/backend/src/etl/audit.ts"

deploy_file "backend/src/etl/watermarks.ts" \
  "${VPS_ROOT}/backend/src/etl/watermarks.ts"

deploy_file "backend/src/etl/deadletter.ts" \
  "${VPS_ROOT}/backend/src/etl/deadletter.ts"

deploy_file "backend/src/etl/rawStore.ts" \
  "${VPS_ROOT}/backend/src/etl/rawStore.ts"

deploy_file "backend/src/etl/connectors/ads.ts" \
  "${VPS_ROOT}/backend/src/etl/connectors/ads.ts"

deploy_file "backend/src/etl/connectors/freshdesk.ts" \
  "${VPS_ROOT}/backend/src/etl/connectors/freshdesk.ts"

# ─── 2. Backend — modified files ─────────────────────────────────────────────
echo "[2/5] Deploying modified backend files..."

deploy_file "backend/prisma/schema.prisma" \
  "${VPS_ROOT}/backend/prisma/schema.prisma"

deploy_file "backend/src/database/repository.ts" \
  "${VPS_ROOT}/backend/src/database/repository.ts"

deploy_file "backend/src/etl/connectors/shopify.ts" \
  "${VPS_ROOT}/backend/src/etl/connectors/shopify.ts"

deploy_file "backend/src/routes/dashboard.ts" \
  "${VPS_ROOT}/backend/src/routes/dashboard.ts"

deploy_file "backend/src/routes/reports.ts" \
  "${VPS_ROOT}/backend/src/routes/reports.ts"

deploy_file "backend/src/routes/insights.ts" \
  "${VPS_ROOT}/backend/src/routes/insights.ts"

deploy_file "backend/src/routes/ecommerce.ts" \
  "${VPS_ROOT}/backend/src/routes/ecommerce.ts"

deploy_file "backend/src/routes/inventory.ts" \
  "${VPS_ROOT}/backend/src/routes/inventory.ts"

deploy_file "backend/src/routes/dataSources.ts" \
  "${VPS_ROOT}/backend/src/routes/dataSources.ts"

deploy_file "backend/src/routes/email.ts" \
  "${VPS_ROOT}/backend/src/routes/email.ts"

deploy_file "backend/src/routes/files.ts" \
  "${VPS_ROOT}/backend/src/routes/files.ts"

deploy_file "backend/src/routes/auth.ts" \
  "${VPS_ROOT}/backend/src/routes/auth.ts"

deploy_file "backend/src/routes/admin.ts" \
  "${VPS_ROOT}/backend/src/routes/admin.ts"

deploy_file "backend/src/routes/brands.ts" \
  "${VPS_ROOT}/backend/src/routes/brands.ts"

deploy_file "backend/src/services/authService.ts" \
  "${VPS_ROOT}/backend/src/services/authService.ts"

deploy_file "backend/src/services/driveFolderService.ts" \
  "${VPS_ROOT}/backend/src/services/driveFolderService.ts"

deploy_file "backend/src/services/shopifyService.ts" \
  "${VPS_ROOT}/backend/src/services/shopifyService.ts"

deploy_file "backend/src/config/authMiddleware.ts" \
  "${VPS_ROOT}/backend/src/config/authMiddleware.ts"

deploy_file "backend/src/config/constants.ts" \
  "${VPS_ROOT}/backend/src/config/constants.ts"

deploy_file "backend/src/server.ts" \
  "${VPS_ROOT}/backend/src/server.ts"

deploy_file "backend/src/scheduler.ts" \
  "${VPS_ROOT}/backend/src/scheduler.ts"

# ─── 3. Frontend — new & modified files ──────────────────────────────────────
echo "[3/5] Deploying frontend files..."

# Ensure remote dirs exist
$SSH "${VPS_USER}@${VPS_HOST}" "mkdir -p \
  ${VPS_ROOT}/frontend/src/app/modules/marketing \
  ${VPS_ROOT}/frontend/src/app/modules/supply-chain \
  ${VPS_ROOT}/frontend/src/app/modules/ops \
  ${VPS_ROOT}/frontend/src/app/modules/shared \
  ${VPS_ROOT}/frontend/src/app/hooks \
  ${VPS_ROOT}/frontend/src/app/components/ui \
  ${VPS_ROOT}/frontend/src/app/context \
  ${VPS_ROOT}/frontend/src/app/pages"

# Contexts
deploy_file "frontend/src/app/context/SyncContext.tsx" \
  "${VPS_ROOT}/frontend/src/app/context/SyncContext.tsx"

deploy_file "frontend/src/app/context/RBACContext.tsx" \
  "${VPS_ROOT}/frontend/src/app/context/RBACContext.tsx"

deploy_file "frontend/src/app/context/BrandContext.tsx" \
  "${VPS_ROOT}/frontend/src/app/context/BrandContext.tsx"

deploy_file "frontend/src/app/context/AuthContext.tsx" \
  "${VPS_ROOT}/frontend/src/app/context/AuthContext.tsx"

deploy_file "frontend/src/app/context/DateRangeContext.tsx" \
  "${VPS_ROOT}/frontend/src/app/context/DateRangeContext.tsx"

# Shared modules
deploy_file "frontend/src/app/modules/shared/DeliveryProfiles.tsx" \
  "${VPS_ROOT}/frontend/src/app/modules/shared/DeliveryProfiles.tsx"

deploy_file "frontend/src/app/modules/shared/Insights.tsx" \
  "${VPS_ROOT}/frontend/src/app/modules/shared/Insights.tsx"

deploy_file "frontend/src/app/modules/shared/DataSources.tsx" \
  "${VPS_ROOT}/frontend/src/app/modules/shared/DataSources.tsx"

deploy_file "frontend/src/app/modules/shared/Touchpoints.tsx" \
  "${VPS_ROOT}/frontend/src/app/modules/shared/Touchpoints.tsx"

deploy_file "frontend/src/app/modules/shared/Reports.tsx" \
  "${VPS_ROOT}/frontend/src/app/modules/shared/Reports.tsx"

deploy_file "frontend/src/app/modules/shared/BrandReports.tsx" \
  "${VPS_ROOT}/frontend/src/app/modules/shared/BrandReports.tsx"

deploy_file "frontend/src/app/modules/shared/Alerts.tsx" \
  "${VPS_ROOT}/frontend/src/app/modules/shared/Alerts.tsx"

deploy_file "frontend/src/app/modules/shared/TeamData.tsx" \
  "${VPS_ROOT}/frontend/src/app/modules/shared/TeamData.tsx"

# Marketing modules
deploy_file "frontend/src/app/modules/marketing/Analytics.tsx" \
  "${VPS_ROOT}/frontend/src/app/modules/marketing/Analytics.tsx"

deploy_file "frontend/src/app/modules/marketing/MetricsPage.tsx" \
  "${VPS_ROOT}/frontend/src/app/modules/marketing/MetricsPage.tsx"

# Supply chain modules
deploy_file "frontend/src/app/modules/supply-chain/InventoryPage.tsx" \
  "${VPS_ROOT}/frontend/src/app/modules/supply-chain/InventoryPage.tsx"

deploy_file "frontend/src/app/modules/supply-chain/OrdersPage.tsx" \
  "${VPS_ROOT}/frontend/src/app/modules/supply-chain/OrdersPage.tsx"

deploy_file "frontend/src/app/modules/supply-chain/FulfillmentPage.tsx" \
  "${VPS_ROOT}/frontend/src/app/modules/supply-chain/FulfillmentPage.tsx"

# Ops modules
deploy_file "frontend/src/app/modules/ops/CustomersPage.tsx" \
  "${VPS_ROOT}/frontend/src/app/modules/ops/CustomersPage.tsx"

deploy_file "frontend/src/app/modules/ops/ReturnsPage.tsx" \
  "${VPS_ROOT}/frontend/src/app/modules/ops/ReturnsPage.tsx"

# ─── 4. Frontend — core files ─────────────────────────────────────────────────
echo "[4/5] Deploying modified frontend core files..."

deploy_file "frontend/src/app/lib/apiClient.ts" \
  "${VPS_ROOT}/frontend/src/app/lib/apiClient.ts"

deploy_file "frontend/src/app/components/DateRangePicker.tsx" \
  "${VPS_ROOT}/frontend/src/app/components/DateRangePicker.tsx"

deploy_file "frontend/src/app/components/ui/calendar.tsx" \
  "${VPS_ROOT}/frontend/src/app/components/ui/calendar.tsx"

deploy_file "frontend/src/app/components/ui/popover.tsx" \
  "${VPS_ROOT}/frontend/src/app/components/ui/popover.tsx"

deploy_file "frontend/src/app/components/ReportManager.tsx" \
  "${VPS_ROOT}/frontend/src/app/components/ReportManager.tsx"

deploy_file "frontend/src/app/components/Toast.tsx" \
  "${VPS_ROOT}/frontend/src/app/components/Toast.tsx"

deploy_file "frontend/src/app/lib/format.ts" \
  "${VPS_ROOT}/frontend/src/app/lib/format.ts"

deploy_file "frontend/src/app/hooks/useDateRangeQuery.ts" \
  "${VPS_ROOT}/frontend/src/app/hooks/useDateRangeQuery.ts"

deploy_file "frontend/src/app/hooks/useMetricSelection.ts" \
  "${VPS_ROOT}/frontend/src/app/hooks/useMetricSelection.ts"

deploy_file "frontend/src/app/ProtectedLayout.tsx" \
  "${VPS_ROOT}/frontend/src/app/ProtectedLayout.tsx"

deploy_file "frontend/src/app/pages/Dashboard.tsx" \
  "${VPS_ROOT}/frontend/src/app/pages/Dashboard.tsx"

deploy_file "frontend/src/app/pages/RBACSettings.tsx" \
  "${VPS_ROOT}/frontend/src/app/pages/RBACSettings.tsx"

deploy_file "frontend/src/app/pages/AdminPanel.tsx" \
  "${VPS_ROOT}/frontend/src/app/pages/AdminPanel.tsx"

deploy_file "frontend/src/app/pages/Settings.tsx" \
  "${VPS_ROOT}/frontend/src/app/pages/Settings.tsx"

deploy_file "frontend/src/app/pages/ModulesPage.tsx" \
  "${VPS_ROOT}/frontend/src/app/pages/ModulesPage.tsx"

deploy_file "frontend/src/app/pages/Login.tsx" \
  "${VPS_ROOT}/frontend/src/app/pages/Login.tsx"

deploy_file "frontend/src/app/pages/Signup.tsx" \
  "${VPS_ROOT}/frontend/src/app/pages/Signup.tsx"

deploy_file "frontend/src/app/routes.tsx" \
  "${VPS_ROOT}/frontend/src/app/routes.tsx"

deploy_file "frontend/src/app/App.tsx" \
  "${VPS_ROOT}/frontend/src/app/App.tsx"

# Ads & Clawbot pages
$SSH "${VPS_USER}@${VPS_HOST}" "mkdir -p \
  ${VPS_ROOT}/frontend/src/app/store \
  ${VPS_ROOT}/frontend/src/app/components/ads"

deploy_file "frontend/src/app/store/adsStore.ts" \
  "${VPS_ROOT}/frontend/src/app/store/adsStore.ts"

deploy_file "frontend/src/app/store/strategyStore.ts" \
  "${VPS_ROOT}/frontend/src/app/store/strategyStore.ts"

deploy_file "frontend/src/app/components/ads/WorkflowStatusTimeline.tsx" \
  "${VPS_ROOT}/frontend/src/app/components/ads/WorkflowStatusTimeline.tsx"

deploy_file "frontend/src/app/components/ads/CampaignMetricsCard.tsx" \
  "${VPS_ROOT}/frontend/src/app/components/ads/CampaignMetricsCard.tsx"

deploy_file "frontend/src/app/components/ads/ActionApprovalPanel.tsx" \
  "${VPS_ROOT}/frontend/src/app/components/ads/ActionApprovalPanel.tsx"

deploy_file "frontend/src/app/components/ads/GuardrailConfigPanel.tsx" \
  "${VPS_ROOT}/frontend/src/app/components/ads/GuardrailConfigPanel.tsx"

deploy_file "frontend/src/app/pages/AdsManagement.tsx" \
  "${VPS_ROOT}/frontend/src/app/pages/AdsManagement.tsx"

deploy_file "frontend/src/app/pages/AdsActionLog.tsx" \
  "${VPS_ROOT}/frontend/src/app/pages/AdsActionLog.tsx"

deploy_file "frontend/src/app/pages/Strategy.tsx" \
  "${VPS_ROOT}/frontend/src/app/pages/Strategy.tsx"

deploy_file "frontend/src/app/pages/AdCreator.tsx" \
  "${VPS_ROOT}/frontend/src/app/pages/AdCreator.tsx"

deploy_file "frontend/src/app/pages/ClawbotPage.tsx" \
  "${VPS_ROOT}/frontend/src/app/pages/ClawbotPage.tsx"

# ─── 5. Remote post-deploy steps ─────────────────────────────────────────────
echo "[5/5] Running post-deploy steps on VPS..."

$SSH "${VPS_USER}@${VPS_HOST}" bash << 'REMOTE'
set -e

cd /var/www/optisync/backend

echo "  → Applying incremental schema changes..."
cat > /tmp/schema_delta.sql << 'SQLEOF'
-- ─── Phase 3 (idempotent) ─────────────────────────────────────────────────────
ALTER TABLE brands
  ADD COLUMN IF NOT EXISTS features JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE users
   SET role = 'boss', status = 'approved'
 WHERE email = 'ronniemania@gmail.com';

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS "binType" TEXT NOT NULL DEFAULT 'sellable',
  ADD COLUMN IF NOT EXISTS "trackedOnDashboard" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS breach_logs (
  id            TEXT PRIMARY KEY,
  "brandId"     TEXT NOT NULL REFERENCES brands(id),
  "orderId"     TEXT NOT NULL,
  "stepIndex"   INTEGER NOT NULL,
  "stepName"    TEXT NOT NULL,
  "elapsedMins" INTEGER NOT NULL,
  "slaMins"     INTEGER NOT NULL,
  "breachedAt"  TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS breach_logs_brandid_idx       ON breach_logs("brandId");
CREATE INDEX IF NOT EXISTS breach_logs_brandid_step_idx  ON breach_logs("brandId", "stepIndex");

CREATE TABLE IF NOT EXISTS fulfillment_orders (
  id                     TEXT PRIMARY KEY,
  "brandId"              TEXT NOT NULL REFERENCES brands(id),
  "orderId"              TEXT NOT NULL,
  "orderTriggerAt"       TIMESTAMP,
  "picklistGeneratedAt"  TIMESTAMP,
  "picklistCompleteAt"   TIMESTAMP,
  "moveToPacklistAt"     TIMESTAMP,
  "awbGeneratedAt"       TIMESTAMP,
  "connectedToCourierAt" TIMESTAMP,
  "currentStep"          INTEGER NOT NULL DEFAULT 0,
  status                 TEXT NOT NULL DEFAULT 'pending',
  "createdAt"            TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"            TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT fulfillment_orders_brandid_orderid_key UNIQUE("brandId", "orderId")
);

CREATE TABLE IF NOT EXISTS fulfillment_sla_config (
  id          TEXT PRIMARY KEY,
  "brandId"   TEXT NOT NULL,
  "step1Mins" INTEGER NOT NULL DEFAULT 30,
  "step2Mins" INTEGER NOT NULL DEFAULT 60,
  "step3Mins" INTEGER NOT NULL DEFAULT 15,
  "step4Mins" INTEGER NOT NULL DEFAULT 30,
  "step5Mins" INTEGER NOT NULL DEFAULT 15,
  CONSTRAINT fulfillment_sla_config_brandid_key UNIQUE("brandId")
);

-- ─── Phase 4 (idempotent) ─────────────────────────────────────────────────────

ALTER TABLE brand_members
  ADD COLUMN IF NOT EXISTS team        TEXT,
  ADD COLUMN IF NOT EXISTS department  TEXT;

CREATE TABLE IF NOT EXISTS rbac_policies (
  id               TEXT PRIMARY KEY,
  "brandId"        TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  team             TEXT,
  department       TEXT,
  "allowedModules" JSONB NOT NULL DEFAULT '[]'::jsonb,
  "createdAt"      TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Delivery profiles base table
CREATE TABLE IF NOT EXISTS delivery_profiles (
  id               TEXT PRIMARY KEY,
  "brandId"        TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  "profileType"    TEXT NOT NULL DEFAULT 'custom',
  metrics          JSONB NOT NULL DEFAULT '[]'::jsonb,
  recipients       JSONB NOT NULL DEFAULT '[]'::jsonb,
  "emailSubject"   TEXT NOT NULL DEFAULT 'Report',
  "emailTemplate"  TEXT NOT NULL DEFAULT '',
  schedule         TEXT NOT NULL DEFAULT 'manual',
  "lastSent"       TIMESTAMP,
  "createdAt"      TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Delivery profiles — extended columns (idempotent; safe to run on both old and new tables)
ALTER TABLE delivery_profiles
  ADD COLUMN IF NOT EXISTS "scheduleCron"         TEXT,
  ADD COLUMN IF NOT EXISTS "scheduleHour"         INTEGER     NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS "scheduleDow"          INTEGER     NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "dateRange"            TEXT        NOT NULL DEFAULT 'today',
  ADD COLUMN IF NOT EXISTS "isShared"             BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "createdBy"            TEXT,
  ADD COLUMN IF NOT EXISTS "createdByEmail"       TEXT,
  ADD COLUMN IF NOT EXISTS "mailProvider"         TEXT        NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS "lastRunAt"            TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "nextRunAt"            TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "lastRunStatus"        TEXT,
  ADD COLUMN IF NOT EXISTS "lastRunError"         TEXT,
  ADD COLUMN IF NOT EXISTS "consecutiveFailures"  INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "paused"               BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "slackWebhookUrl"      TEXT;

CREATE INDEX IF NOT EXISTS delivery_profiles_nextruna_idx ON delivery_profiles("nextRunAt");
CREATE INDEX IF NOT EXISTS delivery_profiles_isshared_idx ON delivery_profiles("isShared");

-- Mailbox configs (shared OAuth/SMTP sender mailboxes)
CREATE TABLE IF NOT EXISTS mailbox_configs (
  id              TEXT PRIMARY KEY,
  provider        TEXT        NOT NULL,
  "displayName"   TEXT        NOT NULL DEFAULT '',
  "emailAddress"  TEXT        NOT NULL,
  "isDefault"     BOOLEAN     NOT NULL DEFAULT false,
  "isShared"      BOOLEAN     NOT NULL DEFAULT true,
  "accessToken"   TEXT,
  "refreshToken"  TEXT,
  "expiresAt"     TIMESTAMP,
  "tenantId"      TEXT,
  scopes          TEXT,
  "smtpHost"      TEXT,
  "smtpPort"      INTEGER,
  "smtpUser"      TEXT,
  "smtpPassword"  TEXT,
  "smtpSecure"    BOOLEAN     NOT NULL DEFAULT true,
  "createdById"   TEXT,
  status          TEXT        NOT NULL DEFAULT 'connected',
  "lastError"     TEXT,
  "createdAt"     TIMESTAMP   NOT NULL DEFAULT NOW(),
  "updatedAt"     TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- Orders — extended columns (idempotent)
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS "sourceOrderNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "customerEmail"     TEXT;

-- ─── Phase 6 — Ads system (idempotent) ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS ads_accounts (
  id               TEXT PRIMARY KEY,
  "brandId"        TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  platform         TEXT NOT NULL,
  "accountId"      TEXT NOT NULL,
  "accountName"    TEXT NOT NULL,
  "encryptedCreds" TEXT NOT NULL DEFAULT '',
  status           TEXT NOT NULL DEFAULT 'active',
  "createdAt"      TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ads_accounts_brandid_platform_accountid ON ads_accounts("brandId", platform, "accountId");

CREATE TABLE IF NOT EXISTS campaigns (
  id             TEXT PRIMARY KEY,
  "adsAccountId" TEXT NOT NULL REFERENCES ads_accounts(id) ON DELETE CASCADE,
  "externalId"   TEXT NOT NULL,
  name           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'ACTIVE',
  objective      TEXT,
  "dailyBudget"  DECIMAL(10,2),
  "createdAt"    TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"    TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS campaigns_adsaccountid_externalid ON campaigns("adsAccountId", "externalId");

CREATE TABLE IF NOT EXISTS ad_sets (
  id             TEXT PRIMARY KEY,
  "campaignId"   TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  "externalId"   TEXT NOT NULL,
  name           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'ACTIVE',
  targeting      JSONB,
  "dailyBudget"  DECIMAL(10,2),
  "createdAt"    TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"    TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ads (
  id           TEXT PRIMARY KEY,
  "adSetId"    TEXT NOT NULL REFERENCES ad_sets(id) ON DELETE CASCADE,
  "externalId" TEXT NOT NULL,
  name         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'ACTIVE',
  creative     JSONB,
  "createdAt"  TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"  TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS performance_metrics (
  id             TEXT PRIMARY KEY,
  "campaignId"   TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  "externalId"   TEXT NOT NULL,
  "dateKey"      TEXT NOT NULL,
  impressions    INTEGER     NOT NULL DEFAULT 0,
  clicks         INTEGER     NOT NULL DEFAULT 0,
  spend          DECIMAL(10,2) NOT NULL DEFAULT 0,
  conversions    INTEGER     NOT NULL DEFAULT 0,
  revenue        DECIMAL(10,2) NOT NULL DEFAULT 0,
  "avgFrequency" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "createdAt"    TIMESTAMP   NOT NULL DEFAULT NOW(),
  "updatedAt"    TIMESTAMP   NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS perf_metrics_campaign_date ON performance_metrics("campaignId", "dateKey");

CREATE TABLE IF NOT EXISTS action_logs (
  id             TEXT PRIMARY KEY,
  "brandId"      TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  "adsAccountId" TEXT,
  "agentId"      TEXT NOT NULL,
  "actionType"   TEXT NOT NULL,
  payload        JSONB       NOT NULL DEFAULT '{}',
  status         TEXT        NOT NULL DEFAULT 'AWAITING_HUMAN',
  "approvedBy"   TEXT,
  "executedAt"   TIMESTAMP,
  result         JSONB,
  error          TEXT,
  confidence     DECIMAL(4,3),
  reasoning      TEXT,
  "createdAt"    TIMESTAMP   NOT NULL DEFAULT NOW(),
  "updatedAt"    TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS agent_decisions (
  id            TEXT PRIMARY KEY,
  "brandId"     TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  "actionLogId" TEXT REFERENCES action_logs(id),
  "agentId"     TEXT NOT NULL,
  decision      TEXT NOT NULL,
  reasoning     TEXT,
  confidence    DECIMAL(4,3),
  "inputData"   JSONB,
  "outputData"  JSONB,
  "createdAt"   TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ads_agent_configs (
  id                       TEXT PRIMARY KEY,
  "adsAccountId"           TEXT NOT NULL UNIQUE REFERENCES ads_accounts(id) ON DELETE CASCADE,
  "manualApprovalMode"     BOOLEAN     NOT NULL DEFAULT false,
  "confidenceThreshold"    DECIMAL(4,3) NOT NULL DEFAULT 0.75,
  "maxDailyBudgetIncrPct"  INTEGER     NOT NULL DEFAULT 20,
  "minSpendThresholdCents" INTEGER     NOT NULL DEFAULT 5000,
  "cooldownHours"          INTEGER     NOT NULL DEFAULT 24,
  "allowedActions"         JSONB       NOT NULL DEFAULT '[]',
  "blockedCampaignIds"     JSONB       NOT NULL DEFAULT '[]',
  "createdAt"              TIMESTAMP   NOT NULL DEFAULT NOW(),
  "updatedAt"              TIMESTAMP   NOT NULL DEFAULT NOW()
);

-- ─── Phase 7 — Clawbot (idempotent) ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS brand_strategies (
  id               TEXT PRIMARY KEY,
  "brandId"        TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  version          INTEGER     NOT NULL DEFAULT 1,
  title            TEXT        NOT NULL,
  objective        TEXT        NOT NULL,
  "targetAudience" JSONB       NOT NULL DEFAULT '{}',
  "budgetRec"      JSONB       NOT NULL DEFAULT '{}',
  channels         JSONB       NOT NULL DEFAULT '{}',
  "keyMessages"    JSONB       NOT NULL DEFAULT '[]',
  kpis             JSONB       NOT NULL DEFAULT '{}',
  "rawInput"       JSONB       NOT NULL DEFAULT '{}',
  "createdAt"      TIMESTAMP   NOT NULL DEFAULT NOW(),
  "updatedAt"      TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_briefs (
  id                  TEXT PRIMARY KEY,
  "brandId"           TEXT NOT NULL REFERENCES brands(id) ON DELETE CASCADE,
  "strategyId"        TEXT REFERENCES brand_strategies(id),
  name                TEXT        NOT NULL,
  platform            TEXT        NOT NULL DEFAULT 'META',
  objective           TEXT        NOT NULL,
  budget              DECIMAL(10,2) NOT NULL DEFAULT 0,
  "startDate"         TIMESTAMP,
  "endDate"           TIMESTAMP,
  "targetAudience"    JSONB       NOT NULL DEFAULT '{}',
  "creativeDirection" JSONB       NOT NULL DEFAULT '{}',
  status              TEXT        NOT NULL DEFAULT 'DRAFT',
  "createdAt"         TIMESTAMP   NOT NULL DEFAULT NOW(),
  "updatedAt"         TIMESTAMP   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_cost_logs (
  id             TEXT PRIMARY KEY,
  "brandId"      TEXT REFERENCES brands(id),
  provider       TEXT        NOT NULL,
  model          TEXT        NOT NULL,
  operation      TEXT        NOT NULL,
  "inputTokens"  INTEGER     NOT NULL DEFAULT 0,
  "outputTokens" INTEGER     NOT NULL DEFAULT 0,
  "costUsd"      DECIMAL(10,6) NOT NULL DEFAULT 0,
  metadata       JSONB,
  "createdAt"    TIMESTAMP   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS api_cost_logs_brandid_createdat ON api_cost_logs("brandId", "createdAt");

SQLEOF
npx prisma db execute --file /tmp/schema_delta.sql 2>&1 | head -5 || true
rm -f /tmp/schema_delta.sql

echo "  → Regenerating Prisma client from updated schema..."
npx prisma generate 2>&1 | tail -3

echo "  → Building backend..."
npm run build 2>&1 | tail -10

echo "  → Restarting backend (pm2)..."
sudo kill -9 $(sudo lsof -ti:3000) 2>/dev/null || true
sudo fuser -k 3000/tcp 2>/dev/null || true
npx pm2 delete brdg-api 2>/dev/null || true
sleep 1
npx pm2 start dist/server.js --name brdg-api
npx pm2 save

echo "  → Rebuilding frontend..."
cd /var/www/optisync/frontend
npm run build 2>&1 | tail -20

echo ""
echo "Deploy complete."
REMOTE

echo ""
echo "=== Done ==="
echo "All files deployed and VPS restarted."
