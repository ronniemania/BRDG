import cron from 'node-cron';
import { getActiveAdsAccounts } from '../database/adsRepository';
import { runDailyOptimizationWorkflow, checkStaleApprovalQueue } from '../services/adsWorkflowService';

let initialized = false;

export function initAdsScheduler(): void {
  if (initialized) return;
  initialized = true;

  // Daily Optimization — runs at 06:00 UTC every day
  // Fetches fresh metrics, runs analyst → decision → executor → reporter
  cron.schedule('0 6 * * *', async () => {
    console.log('[ads-scheduler] Starting daily optimization for all active accounts...');
    try {
      const accounts = await getActiveAdsAccounts();
      console.log(`[ads-scheduler] ${accounts.length} active ads accounts found`);

      for (const account of accounts) {
        try {
          await runDailyOptimizationWorkflow(account.brandId, account.id);
        } catch (err: unknown) {
          console.error(
            `[ads-scheduler] Workflow failed for account ${account.id}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      console.log('[ads-scheduler] Daily optimization complete');
    } catch (err: unknown) {
      console.error(`[ads-scheduler] Fatal error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, { timezone: 'UTC' });

  // Stale approval queue reminder — runs every 4 hours
  // Emits a warning log if any approval items have been waiting > 8 hours
  cron.schedule('0 */4 * * *', async () => {
    try {
      await checkStaleApprovalQueue();
    } catch (err: unknown) {
      console.error(`[ads-scheduler] Stale queue check failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, { timezone: 'UTC' });

  console.log('[ads-scheduler] Initialized — daily optimization at 06:00 UTC, stale queue check every 4h');
}
