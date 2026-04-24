import { AUTO_SYNC_INTERVAL, DEFAULT_GDRIVE_FOLDER } from './config/constants';
import { initAdsScheduler } from './schedulers/adsScheduler';
import { syncDriveFolder } from './services/driveFolderService';
import { ShopifyService } from './services/shopifyService';
import { sendEmail } from './services/mailerService';
import { processDueScheduledReports } from './services/reportScheduler';
import repository from './database/repository';

const shopifyService = new ShopifyService();

let schedulerRunning = false;
let lastEodDate = '';  // tracks last date we sent EOD email (format: 'YYYY-MM-DD')

// ─── Alert evaluation ─────────────────────────────────────────────────────────

const ALERT_THRESHOLDS = {
  LOW_STOCK_ITEMS: 5,       // alert when this many SKUs are at/below reorder point
  OPEN_TICKETS: 10,         // alert when open ticket count exceeds this
  PENDING_RETURNS: 8,       // alert when pending returns exceed this
  PENDING_ORDERS: 20,       // alert when pending orders exceed this
};

async function evaluateAlerts(brandId: string): Promise<void> {
  try {
    const [inventory, tickets, returns, orders] = await Promise.all([
      repository.findInventoryByBrand(brandId),
      repository.findTicketsByBrand(brandId),
      repository.findReturnsByBrand(brandId),
      repository.findOrdersByBrand(brandId),
    ]);

    // Clean up alerts older than 30 days
    await repository.deleteOldAlerts(brandId, 30);

    const lowStockCount = inventory.filter(i => i.stockLevel <= i.reorderPoint).length;
    const openTickets = tickets.filter(t => t.status === 'open').length;
    const pendingReturns = returns.filter(r => r.status === 'requested').length;
    const pendingOrders = orders.filter(o => o.status === 'pending').length;

    interface AlertDef {
      condition: boolean;
      type: string;
      severity: 'high' | 'medium' | 'low';
      title: string;
      detail: string;
    }

    const alertDefs: AlertDef[] = [
      {
        condition: lowStockCount >= ALERT_THRESHOLDS.LOW_STOCK_ITEMS,
        type: 'low_stock',
        severity: lowStockCount >= ALERT_THRESHOLDS.LOW_STOCK_ITEMS * 2 ? 'high' : 'medium',
        title: `${lowStockCount} SKUs at or below reorder point`,
        detail: 'Review inventory and trigger restocking',
      },
      {
        condition: openTickets >= ALERT_THRESHOLDS.OPEN_TICKETS,
        type: 'open_tickets',
        severity: openTickets >= ALERT_THRESHOLDS.OPEN_TICKETS * 2 ? 'high' : 'medium',
        title: `${openTickets} open support tickets`,
        detail: 'Support queue needs attention',
      },
      {
        condition: pendingReturns >= ALERT_THRESHOLDS.PENDING_RETURNS,
        type: 'high_returns',
        severity: 'medium',
        title: `${pendingReturns} returns awaiting action`,
        detail: 'Process or review pending returns',
      },
      {
        condition: pendingOrders >= ALERT_THRESHOLDS.PENDING_ORDERS,
        type: 'pending_orders',
        severity: pendingOrders >= ALERT_THRESHOLDS.PENDING_ORDERS * 2 ? 'high' : 'medium',
        title: `${pendingOrders} orders still pending`,
        detail: 'Fulfil or investigate delayed orders',
      },
    ];

    for (const def of alertDefs) {
      if (!def.condition) continue;

      // Avoid duplicate alerts: skip if an unread alert of this type already exists today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const existing = await repository.prisma.alert.findFirst({
        where: {
          brandId,
          type: def.type,
          read: false,
          createdAt: { gte: today },
        },
      });

      if (!existing) {
        await repository.createAlert({
          brandId,
          type: def.type,
          severity: def.severity,
          title: def.title,
          detail: def.detail,
        });
      }
    }
  } catch (err: any) {
    console.error(`[Scheduler] Alert evaluation failed for brand ${brandId}:`, err.message);
  }
}

// ─── SLA Breach Evaluation ────────────────────────────────────────────────────

const BREACH_STEP_NAMES = ['', 'Order → Picklist', 'Picklist → Complete', 'Complete → Packlist', 'Packlist → AWB', 'AWB → Courier'];
type StepPair = [string, string];
const STEP_PAIRS: StepPair[] = [
  ['orderTriggerAt',      'picklistGeneratedAt'],
  ['picklistGeneratedAt', 'picklistCompleteAt'],
  ['picklistCompleteAt',  'moveToPacklistAt'],
  ['moveToPacklistAt',    'awbGeneratedAt'],
  ['awbGeneratedAt',      'connectedToCourierAt'],
];

async function runBreachEvaluation(brandId: string): Promise<void> {
  try {
    const [orders, slaConfig] = await Promise.all([
      repository.findFulfillmentByBrand(brandId, { status: 'in_progress' }),
      repository.getFulfillmentSLA(brandId),
    ]);

    const slaMins = [
      slaConfig?.step1Mins ?? 30,
      slaConfig?.step2Mins ?? 60,
      slaConfig?.step3Mins ?? 15,
      slaConfig?.step4Mins ?? 30,
      slaConfig?.step5Mins ?? 15,
    ];

    const now = new Date();

    for (const order of orders) {
      let orderBreached = false;

      for (let i = 0; i < 5; i++) {
        const startTime = (order as any)[STEP_PAIRS[i][0]] as Date | null;
        const endTime   = (order as any)[STEP_PAIRS[i][1]] as Date | null;

        if (!startTime) continue; // step not yet started

        const elapsed = ((endTime || now).getTime() - startTime.getTime()) / 60000;
        if (elapsed <= slaMins[i]) continue; // within SLA

        // Avoid duplicate breach log for same order+step
        const existing = await repository.prisma.breachLog.findFirst({
          where: { brandId, orderId: order.orderId, stepIndex: i + 1 },
        });
        if (existing) { orderBreached = true; continue; }

        await repository.prisma.breachLog.create({
          data: {
            id: `bl_${order.orderId}_${i + 1}_${Date.now()}`,
            brandId,
            orderId: order.orderId,
            stepIndex: i + 1,
            stepName: BREACH_STEP_NAMES[i + 1],
            elapsedMins: Math.round(elapsed),
            slaMins: slaMins[i],
          },
        });
        orderBreached = true;
      }

      // Mark order as breach if any step is breached
      if (orderBreached && order.status !== 'breach' && order.status !== 'completed') {
        await repository.prisma.fulfillmentOrder.update({
          where: { brandId_orderId: { brandId, orderId: order.orderId } },
          data: { status: 'breach', updatedAt: now },
        });
      }
    }
  } catch (err: any) {
    console.error(`[Scheduler] Breach evaluation failed for brand ${brandId}:`, err.message);
  }
}

// ─── EOD Email ────────────────────────────────────────────────────────────────

function buildEodHtml(firstName: string, data: {
  revenue: number; orders: number; breaches: number;
  topSkus: Array<{ name: string; sku: string; revenue: number }>;
  date: string;
}): string {
  const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  const skuRows = data.topSkus.map((s, i) =>
    `<tr style="border-bottom:1px solid #f0f0f0">
      <td style="padding:8px 12px;color:#6b7280">${i + 1}</td>
      <td style="padding:8px 12px;font-weight:500">${s.name}</td>
      <td style="padding:8px 12px;color:#6b7280">${s.sku}</td>
      <td style="padding:8px 12px;text-align:right;font-weight:600;color:#10b981">${fmt(s.revenue)}</td>
    </tr>`
  ).join('');

  return `<!DOCTYPE html><html><body style="font-family:Inter,sans-serif;background:#f9fafb;margin:0;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden">
    <div style="background:#10b981;padding:24px 28px">
      <h1 style="color:#fff;margin:0;font-size:20px">BRDG Daily Summary</h1>
      <p style="color:#d1fae5;margin:4px 0 0;font-size:13px">${data.date}</p>
    </div>
    <div style="padding:24px 28px">
      <p style="color:#374151;font-size:14px;margin-bottom:20px">Hi ${firstName}, here's your EOD snapshot:</p>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:24px">
        <div style="background:#f0fdf4;border-radius:8px;padding:16px;text-align:center">
          <p style="font-size:22px;font-weight:700;color:#10b981;margin:0">${fmt(data.revenue)}</p>
          <p style="font-size:12px;color:#6b7280;margin:4px 0 0">Today's Revenue</p>
        </div>
        <div style="background:#eff6ff;border-radius:8px;padding:16px;text-align:center">
          <p style="font-size:22px;font-weight:700;color:#3b82f6;margin:0">${data.orders}</p>
          <p style="font-size:12px;color:#6b7280;margin:4px 0 0">Orders Today</p>
        </div>
        <div style="background:${data.breaches > 0 ? '#fef2f2' : '#f0fdf4'};border-radius:8px;padding:16px;text-align:center">
          <p style="font-size:22px;font-weight:700;color:${data.breaches > 0 ? '#ef4444' : '#10b981'};margin:0">${data.breaches}</p>
          <p style="font-size:12px;color:#6b7280;margin:4px 0 0">SLA Breaches</p>
        </div>
      </div>
      ${skuRows ? `
      <h3 style="font-size:14px;font-weight:600;color:#111827;margin-bottom:12px">Top SKUs Today</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:#f9fafb">
          <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:500">#</th>
          <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:500">Product</th>
          <th style="padding:8px 12px;text-align:left;color:#6b7280;font-weight:500">SKU</th>
          <th style="padding:8px 12px;text-align:right;color:#6b7280;font-weight:500">Revenue</th>
        </tr></thead>
        <tbody>${skuRows}</tbody>
      </table>` : ''}
    </div>
    <div style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb">
      <p style="font-size:12px;color:#9ca3af;margin:0">BRDG Alpha · You're receiving this because EOD summary is enabled in Settings · <a href="#" style="color:#10b981">Manage</a></p>
    </div>
  </div>
</body></html>`;
}

async function runEodEmail(): Promise<void> {
  const now = new Date();
  // Only trigger between 23:55–23:59
  if (now.getHours() !== 23 || now.getMinutes() < 55) return;

  const todayKey = now.toISOString().slice(0, 10); // 'YYYY-MM-DD'
  if (lastEodDate === todayKey) return; // already sent today
  lastEodDate = todayKey;

  console.log('[Scheduler] Running EOD email...');

  try {
    // Find all boss/admin users with eodEmail: true
    const users = await repository.prisma.user.findMany({
      where: { role: { in: ['boss', 'admin'] }, status: 'approved' },
    });

    const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);

    for (const user of users) {
      const prefs = (user.preferences ?? {}) as Record<string, any>;
      if (!prefs.eodEmail) continue;

      try {
        const brands = await repository.prisma.brand.findMany({ where: { ownerId: user.id }, take: 1 });
        if (!brands.length) continue;
        const brandId = brands[0].id;

        const [todayOrders, todayBreaches, inventory] = await Promise.all([
          repository.prisma.order.findMany({ where: { brandId, orderDate: { gte: todayStart } } }),
          repository.prisma.breachLog.count({ where: { brandId, breachedAt: { gte: todayStart } } }),
          repository.prisma.inventoryItem.findMany({ where: { brandId }, select: { sku: true, name: true, salePrice: true } }),
        ]);

        const todayRevenue = todayOrders.reduce((s, o) => s + o.amount, 0);

        // Top 3 SKUs by order count × price (approximation since no order line items)
        const skuMap: Record<string, { name: string; sku: string; revenue: number }> = {};
        for (const inv of inventory) skuMap[inv.sku] = { sku: inv.sku, name: inv.name, revenue: 0 };
        // Spread today's revenue across SKUs evenly as rough estimate
        const skuCount = Object.keys(skuMap).length;
        if (skuCount > 0) {
          const perSku = todayRevenue / skuCount;
          for (const k of Object.keys(skuMap)) skuMap[k].revenue = perSku;
        }
        const topSkus = Object.values(skuMap).sort((a, b) => b.revenue - a.revenue).slice(0, 3);

        const html = buildEodHtml(user.firstName, {
          revenue: todayRevenue,
          orders: todayOrders.length,
          breaches: todayBreaches,
          topSkus,
          date: now.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        });

        await sendEmail({
          to: user.email,
          subject: `BRDG Daily Summary — ${now.toLocaleDateString('en-IN')}`,
          html,
          senderUserId: user.id,
          provider: 'auto',
        });
        console.log(`[Scheduler] EOD email sent to ${user.email}`);
      } catch (err: any) {
        console.error(`[Scheduler] EOD email failed for ${user.email}:`, err.message);
      }
    }
  } catch (err: any) {
    console.error('[Scheduler] EOD email run failed:', err.message);
  }
}

// ─── Drive sync ───────────────────────────────────────────────────────────────

async function runDriveSync(brand: { id: string; name: string }) {
  const sources = await repository.findDataSourcesByBrand(brand.id);
  const driveSources = sources.filter(s => s.type === 'google_drive_folder' && s.syncStatus !== 'disabled');

  for (const source of driveSources) {
    const config = (source.config ?? {}) as Record<string, any>;
    const folderPath = config.folderPath || DEFAULT_GDRIVE_FOLDER;

    if (!folderPath) {
      console.warn(`[Scheduler] Drive source "${source.name}" (${source.id}) has no folderPath — skipping`);
      continue;
    }

    try {
      await repository.updateDataSource(source.id, { syncStatus: 'syncing', lastError: null });
      const result = await syncDriveFolder(source.id, brand.id, folderPath);

      await repository.updateDataSource(source.id, {
        syncStatus: 'active',
        lastSync: new Date(),
        recordCount: (source.recordCount || 0) + result.totalRecords,
      });

      await repository.createSyncLog({
        brandId: brand.id,
        dataSourceId: source.id,
        status: 'completed',
        recordCount: result.totalRecords,
      });

      console.log(`[Scheduler] Drive sync "${source.name}": processed=${result.filesProcessed} skipped=${result.filesSkipped} records=${result.totalRecords}`);
    } catch (err: any) {
      await repository.updateDataSource(source.id, { syncStatus: 'error', lastError: err.message });
      await repository.createSyncLog({
        brandId: brand.id,
        dataSourceId: source.id,
        status: 'error',
        error: err.message,
      });
      console.error(`[Scheduler] Drive sync error for "${source.name}":`, err.message);
    }
  }
}

// ─── Shopify sync ─────────────────────────────────────────────────────────────

async function runShopifySync(brand: { id: string; name: string }) {
  const stores = await repository.findShopifyStoresByBrand(brand.id);
  const activeStores = stores.filter(s => s.syncStatus === 'active');

  for (const store of activeStores) {
    try {
      const result = await shopifyService.syncStore(store.id);

      // Create a synthetic data-source-less sync log using the brand's first data source
      // If no data source exists, skip the sync log to avoid FK constraint issues
      const sources = await repository.findDataSourcesByBrand(brand.id);
      const shopifySource = sources.find(s => s.type === 'shopify');

      if (shopifySource) {
        await repository.createSyncLog({
          brandId: brand.id,
          dataSourceId: shopifySource.id,
          status: result.errors.length > 0 ? 'partial' : 'completed',
          recordCount: result.orders + result.products,
          error: result.errors.length > 0 ? result.errors.join('; ') : undefined,
        });

        await repository.updateDataSource(shopifySource.id, {
          syncStatus: 'active',
          lastSync: new Date(),
          recordCount: (shopifySource.recordCount || 0) + result.orders + result.products,
        });
      }

      console.log(`[Scheduler] Shopify sync "${store.shopName}" (brand: ${brand.name}): orders=${result.orders} products=${result.products}`);
    } catch (err: any) {
      console.error(`[Scheduler] Shopify sync error for "${store.shopName}":`, err.message);
    }
  }
}

// ─── Main sync cycle ──────────────────────────────────────────────────────────

async function runSyncCycle() {
  console.log(`[Scheduler] Sync cycle started at ${new Date().toISOString()}`);

  const allBrands = await repository.prisma.brand.findMany({ where: { status: 'active' } });

  for (const brand of allBrands) {
    await runDriveSync(brand);
    await runShopifySync(brand);
    // Evaluate alerts after each brand's data is refreshed
    await evaluateAlerts(brand.id);
    // Evaluate SLA breaches for all in-progress fulfillment orders
    await runBreachEvaluation(brand.id);
  }

  console.log(`[Scheduler] Sync cycle completed at ${new Date().toISOString()}`);
}

// ─── On-demand sync for specific brands (called by /api/sync/all) ─────────────

export async function runSyncForBrands(brandIds: string[]): Promise<void> {
  const brands = await repository.prisma.brand.findMany({
    where: { id: { in: brandIds }, status: 'active' },
    select: { id: true, name: true },
  });

  console.log(`[Scheduler] Manual sync started for ${brands.length} brand(s)`);

  for (const brand of brands) {
    await runDriveSync(brand);
    await runShopifySync(brand);
    await evaluateAlerts(brand.id);
    await runBreachEvaluation(brand.id);
  }

  console.log(`[Scheduler] Manual sync completed for ${brands.length} brand(s)`);
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export function startScheduler() {
  if (schedulerRunning) return;
  schedulerRunning = true;

  console.log(`[Scheduler] Started — auto-sync every ${AUTO_SYNC_INTERVAL / 3600000}h`);

  // Run once on startup after a short delay
  setTimeout(() => {
    runSyncCycle().catch(err => console.error('[Scheduler] Sync error:', err));
  }, 10000);

  // Then on interval
  setInterval(() => {
    runSyncCycle().catch(err => console.error('[Scheduler] Sync error:', err));
  }, AUTO_SYNC_INTERVAL);

  // Ads management cron jobs (daily optimization + stale queue alerts)
  initAdsScheduler();

  // Minute tick — EOD email window + scheduled reports dispatch
  setInterval(() => {
    runEodEmail().catch(err => console.error('[Scheduler] EOD tick failed:', err.message));
    processDueScheduledReports().catch(err =>
      console.error('[Scheduler] Scheduled reports tick failed:', err.message),
    );
  }, 60 * 1000);
}

export function stopScheduler() {
  schedulerRunning = false;
}
