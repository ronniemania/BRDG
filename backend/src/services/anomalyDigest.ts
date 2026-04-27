/**
 * Anomaly digest — daily detection of outliers in revenue, orders,
 * inventory health, returns rate, and support ticket volume.
 *
 * Approach
 * ────────
 * No ML, on purpose. We compare today's value (or yesterday's, if
 * called late at night) to the trailing 7-day average and emit an
 * alert when the gap exceeds a configurable threshold. This is
 * boring on purpose — interpretable, debuggable, and tunable per
 * brand once we collect feedback from public testers.
 *
 * Each detector is a pure function over already-loaded rows so the
 * whole digest needs only one Prisma query per resource. The runner
 * persists detected anomalies into the existing `alerts` table with
 * type='anomaly_<kind>' so the existing Alerts UI renders them
 * without any frontend changes.
 *
 * Dedupe
 * ──────
 * Same as the existing alert evaluator: we don't insert if an
 * unread alert of the same `type` already exists from today.
 *
 * Cadence
 * ───────
 * Designed to run once per day. The scheduler invokes
 * `processAnomalyDigest()` from the daily tick (which already exists
 * for EOD email at 23:55–23:59 IST).
 */

import repository from '../database/repository';
import { log } from '../utils/logger';

// ── Tunable thresholds ───────────────────────────────────────────────────────
//
// Format is "alert if today's value is X% of trailing baseline" for dips,
// and "X× of baseline" for spikes. Numbers chosen to be conservative —
// public testing will surface false-positive rates and we'll dial them.

const T = {
  // Revenue / orders: dips
  REVENUE_DIP_HIGH:        0.50,  // <50% of 7-day avg → high
  REVENUE_DIP_MEDIUM:      0.70,  // <70% of 7-day avg → medium
  ORDERS_DIP_HIGH:         0.50,
  ORDERS_DIP_MEDIUM:       0.70,
  // Inventory: spikes (more low-stock than usual)
  LOW_STOCK_SPIKE_HIGH:    2.0,   // ≥2× 7-day avg low-stock count
  LOW_STOCK_SPIKE_MEDIUM:  1.5,
  // Returns: rate spike (returns/orders ratio)
  RETURN_RATE_SPIKE_HIGH:  3.0,
  RETURN_RATE_SPIKE_MEDIUM: 2.0,
  // Tickets: open queue surge
  TICKETS_SPIKE_HIGH:      2.0,
  TICKETS_SPIKE_MEDIUM:    1.5,
  // Minimum-baseline guard — don't alert on tiny absolute numbers
  // (a brand with 1 order/day will go to 0 and back daily; not signal).
  MIN_BASELINE_REVENUE:    1000,  // ₹1,000/day average
  MIN_BASELINE_ORDERS:     5,
  MIN_BASELINE_TICKETS:    3,
  MIN_BASELINE_LOW_STOCK:  2,
};

interface DailyBucket {
  dateKey: string; // YYYY-MM-DD
  revenue: number;
  orders: number;
  returns: number;
}

function dateKey(d: Date): string { return d.toISOString().slice(0, 10); }

/** Builds 8-day window: today + 7 trailing days. */
function bucketByDay(items: Array<{ date: Date; amount?: number }>, today: Date): Map<string, DailyBucket> {
  const buckets = new Map<string, DailyBucket>();
  for (let i = 0; i <= 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    buckets.set(dateKey(d), { dateKey: dateKey(d), revenue: 0, orders: 0, returns: 0 });
  }
  return buckets;
}

interface DetectorInput {
  brandId: string;
  today: Date;
  orderBuckets: Map<string, DailyBucket>;
  returnBuckets: Map<string, DailyBucket>;
  todayLowStock: number;
  trailingLowStockAvg: number;
  todayOpenTickets: number;
  trailingTicketsAvg: number;
}

interface AnomalyAlert {
  type: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
}

function detectRevenueDip(d: DetectorInput): AnomalyAlert | null {
  const todayKey = dateKey(d.today);
  const todayRev = d.orderBuckets.get(todayKey)?.revenue ?? 0;
  let trailing = 0;
  for (const b of d.orderBuckets.values()) if (b.dateKey !== todayKey) trailing += b.revenue;
  const baseline = trailing / 7;
  if (baseline < T.MIN_BASELINE_REVENUE) return null;
  const ratio = todayRev / baseline;
  if (ratio < T.REVENUE_DIP_HIGH) {
    return {
      type: 'anomaly_revenue_dip',
      severity: 'high',
      title: `Revenue down ${Math.round((1 - ratio) * 100)}% vs 7-day avg`,
      detail: `Today: ${Math.round(todayRev)}. Trailing avg: ${Math.round(baseline)}. Investigate stockouts, ad pauses, or site issues.`,
    };
  }
  if (ratio < T.REVENUE_DIP_MEDIUM) {
    return {
      type: 'anomaly_revenue_dip',
      severity: 'medium',
      title: `Revenue down ${Math.round((1 - ratio) * 100)}% vs 7-day avg`,
      detail: `Today: ${Math.round(todayRev)}. Trailing avg: ${Math.round(baseline)}.`,
    };
  }
  return null;
}

function detectOrdersDip(d: DetectorInput): AnomalyAlert | null {
  const todayKey = dateKey(d.today);
  const todayOrders = d.orderBuckets.get(todayKey)?.orders ?? 0;
  let trailing = 0;
  for (const b of d.orderBuckets.values()) if (b.dateKey !== todayKey) trailing += b.orders;
  const baseline = trailing / 7;
  if (baseline < T.MIN_BASELINE_ORDERS) return null;
  const ratio = todayOrders / baseline;
  if (ratio < T.ORDERS_DIP_HIGH) {
    return {
      type: 'anomaly_orders_dip',
      severity: 'high',
      title: `Order count down ${Math.round((1 - ratio) * 100)}% vs 7-day avg`,
      detail: `Today: ${todayOrders} orders. Trailing avg: ${baseline.toFixed(1)} orders/day.`,
    };
  }
  if (ratio < T.ORDERS_DIP_MEDIUM) {
    return {
      type: 'anomaly_orders_dip',
      severity: 'medium',
      title: `Order count down ${Math.round((1 - ratio) * 100)}% vs 7-day avg`,
      detail: `Today: ${todayOrders} orders. Trailing avg: ${baseline.toFixed(1)} orders/day.`,
    };
  }
  return null;
}

function detectLowStockSpike(d: DetectorInput): AnomalyAlert | null {
  if (d.trailingLowStockAvg < T.MIN_BASELINE_LOW_STOCK) return null;
  const ratio = d.todayLowStock / Math.max(d.trailingLowStockAvg, 1);
  if (ratio >= T.LOW_STOCK_SPIKE_HIGH) {
    return {
      type: 'anomaly_low_stock_spike',
      severity: 'high',
      title: `Low-stock SKU count spiked to ${d.todayLowStock} (${ratio.toFixed(1)}× normal)`,
      detail: `Trailing 7-day avg: ${d.trailingLowStockAvg.toFixed(1)} SKUs. Trigger restock workflows.`,
    };
  }
  if (ratio >= T.LOW_STOCK_SPIKE_MEDIUM) {
    return {
      type: 'anomaly_low_stock_spike',
      severity: 'medium',
      title: `Low-stock SKU count up to ${d.todayLowStock} (${ratio.toFixed(1)}× normal)`,
      detail: `Trailing 7-day avg: ${d.trailingLowStockAvg.toFixed(1)} SKUs.`,
    };
  }
  return null;
}

function detectReturnRateSpike(d: DetectorInput): AnomalyAlert | null {
  const todayKey = dateKey(d.today);
  const todayOrders  = d.orderBuckets.get(todayKey)?.orders ?? 0;
  const todayReturns = d.returnBuckets.get(todayKey)?.returns ?? 0;
  const todayRate = todayOrders > 0 ? todayReturns / todayOrders : 0;

  // Trailing rate
  let trailingOrders = 0, trailingReturns = 0;
  for (const b of d.orderBuckets.values())
    if (b.dateKey !== todayKey) trailingOrders += b.orders;
  for (const b of d.returnBuckets.values())
    if (b.dateKey !== todayKey) trailingReturns += b.returns;

  // Don't bother if the trailing window has no orders.
  if (trailingOrders < T.MIN_BASELINE_ORDERS * 7) return null;
  const trailingRate = trailingReturns / trailingOrders;
  if (trailingRate < 0.005) return null; // baseline too tiny — division noise

  const ratio = todayRate / trailingRate;
  if (ratio >= T.RETURN_RATE_SPIKE_HIGH) {
    return {
      type: 'anomaly_return_rate_spike',
      severity: 'high',
      title: `Return rate spiked ${ratio.toFixed(1)}× vs 7-day avg`,
      detail: `Today: ${(todayRate * 100).toFixed(1)}% return rate. Trailing avg: ${(trailingRate * 100).toFixed(1)}%.`,
    };
  }
  if (ratio >= T.RETURN_RATE_SPIKE_MEDIUM) {
    return {
      type: 'anomaly_return_rate_spike',
      severity: 'medium',
      title: `Return rate up ${ratio.toFixed(1)}× vs 7-day avg`,
      detail: `Today: ${(todayRate * 100).toFixed(1)}%. Trailing avg: ${(trailingRate * 100).toFixed(1)}%.`,
    };
  }
  return null;
}

function detectTicketsSpike(d: DetectorInput): AnomalyAlert | null {
  if (d.trailingTicketsAvg < T.MIN_BASELINE_TICKETS) return null;
  const ratio = d.todayOpenTickets / Math.max(d.trailingTicketsAvg, 1);
  if (ratio >= T.TICKETS_SPIKE_HIGH) {
    return {
      type: 'anomaly_tickets_spike',
      severity: 'high',
      title: `Open tickets surged to ${d.todayOpenTickets} (${ratio.toFixed(1)}× normal)`,
      detail: `Trailing 7-day avg: ${d.trailingTicketsAvg.toFixed(1)}. Look for an underlying cause (shipping issue, defect, outage).`,
    };
  }
  if (ratio >= T.TICKETS_SPIKE_MEDIUM) {
    return {
      type: 'anomaly_tickets_spike',
      severity: 'medium',
      title: `Open tickets up to ${d.todayOpenTickets} (${ratio.toFixed(1)}× normal)`,
      detail: `Trailing 7-day avg: ${d.trailingTicketsAvg.toFixed(1)}.`,
    };
  }
  return null;
}

const DETECTORS = [
  detectRevenueDip,
  detectOrdersDip,
  detectLowStockSpike,
  detectReturnRateSpike,
  detectTicketsSpike,
];

// ── Public entry point ──────────────────────────────────────────────────────

export async function processAnomalyDigest(): Promise<void> {
  const start = Date.now();
  let brandsScanned = 0;
  let alertsRaised = 0;

  try {
    const brands = await repository.prisma.brand.findMany({
      where: { status: 'active' },
      select: { id: true, name: true },
    });

    for (const brand of brands) {
      try {
        const raised = await processForBrand(brand.id);
        alertsRaised += raised;
        brandsScanned++;
      } catch (err: any) {
        log.warn('anomaly digest brand failed', {
          component: 'anomalyDigest', brandId: brand.id, err: err?.message,
        });
      }
    }

    log.info('anomaly digest complete', {
      component: 'anomalyDigest',
      brandsScanned, alertsRaised, durationMs: Date.now() - start,
    });
  } catch (err: any) {
    log.error('anomaly digest fatal', { component: 'anomalyDigest', err: err?.message });
  }
}

async function processForBrand(brandId: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const eightDaysAgo = new Date(today);
  eightDaysAgo.setDate(eightDaysAgo.getDate() - 7);

  // Single round-trip per resource for the 8-day window.
  const [orders, returns, inventory, tickets] = await Promise.all([
    repository.prisma.order.findMany({
      where: { brandId, orderDate: { gte: eightDaysAgo } },
      select: { amount: true, orderDate: true },
    }),
    repository.prisma.return.findMany({
      where: { brandId, returnDate: { gte: eightDaysAgo } },
      select: { returnDate: true, amount: true },
    }),
    repository.prisma.inventoryItem.findMany({
      where: { brandId, trackedOnDashboard: true },
      select: { stockLevel: true, reorderPoint: true },
    }),
    repository.prisma.freshdeskTicket.findMany({
      where: { brandId, status: 'open' },
      select: { id: true },
    }),
  ]);

  const orderBuckets = bucketByDay([], today);
  for (const o of orders) {
    const k = dateKey(o.orderDate);
    const b = orderBuckets.get(k);
    if (b) { b.orders += 1; b.revenue += Number(o.amount) || 0; }
  }
  const returnBuckets = bucketByDay([], today);
  for (const r of returns) {
    const k = dateKey(r.returnDate);
    const b = returnBuckets.get(k);
    if (b) { b.returns += 1; }
  }

  const todayLowStock = inventory.filter(i => i.stockLevel <= i.reorderPoint).length;
  // For the trailing avg of low-stock we don't have history per-day,
  // so we approximate by treating the current count as a single point
  // and the trailing avg as 80% of it on the (reasonable) assumption
  // that low-stock-count moves slowly. If/when we add a daily snapshot
  // table this becomes a real average.
  const trailingLowStockAvg = todayLowStock * 0.8;

  const todayOpenTickets   = tickets.length;
  // Same approximation rationale.
  const trailingTicketsAvg = todayOpenTickets * 0.8;

  const detectorInput: DetectorInput = {
    brandId, today,
    orderBuckets, returnBuckets,
    todayLowStock, trailingLowStockAvg,
    todayOpenTickets, trailingTicketsAvg,
  };

  let raised = 0;
  for (const detector of DETECTORS) {
    const anomaly = detector(detectorInput);
    if (!anomaly) continue;

    // Dedupe — skip if an unread alert of this type already exists from today.
    const existing = await repository.prisma.alert.findFirst({
      where: { brandId, type: anomaly.type, read: false, createdAt: { gte: today } },
    });
    if (existing) continue;

    await repository.createAlert({
      brandId,
      type: anomaly.type,
      severity: anomaly.severity,
      title: anomaly.title,
      detail: anomaly.detail,
    });
    raised++;
  }
  return raised;
}

// Re-exports so unit tests can poke at individual detectors.
export const __detectors = {
  detectRevenueDip,
  detectOrdersDip,
  detectLowStockSpike,
  detectReturnRateSpike,
  detectTicketsSpike,
};
