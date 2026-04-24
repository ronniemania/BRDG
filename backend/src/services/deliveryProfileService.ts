import repository from '../database/repository';
import { sendEmail } from './mailerService';

// ─── Available metric keys and their human-readable labels ───────────────────

export const METRIC_DEFINITIONS: Record<string, { label: string; description: string; group: string }> = {
  // Sales / Orders
  total_revenue:      { group: 'Sales',      label: 'Total Revenue',       description: 'Sum of all order amounts (in period)' },
  net_revenue:        { group: 'Sales',      label: 'Net Revenue',          description: 'Revenue minus returns' },
  total_orders:       { group: 'Sales',      label: 'Total Orders',         description: 'Count of all orders (in period)' },
  avg_order_value:    { group: 'Sales',      label: 'Avg Order Value',      description: 'Average amount per order' },
  delivered_orders:   { group: 'Sales',      label: 'Delivered Orders',     description: 'Orders marked delivered' },
  pending_orders:     { group: 'Sales',      label: 'Pending Orders',       description: 'Orders not yet fulfilled' },
  cancelled_orders:   { group: 'Sales',      label: 'Cancelled Orders',     description: 'Orders cancelled' },
  // Customers
  total_customers:    { group: 'Customers',  label: 'Total Customers',      description: 'Count of unique customers' },
  new_customers:      { group: 'Customers',  label: 'New Customers',        description: 'First-time buyers in period' },
  repeat_customers:   { group: 'Customers',  label: 'Repeat Customers',     description: 'Customers with >1 order' },
  // Inventory
  total_skus:         { group: 'Inventory',  label: 'Total SKUs',           description: 'Number of inventory items' },
  low_stock_count:    { group: 'Inventory',  label: 'Low Stock SKUs',       description: 'Items at or below reorder point' },
  out_of_stock_count: { group: 'Inventory',  label: 'Out of Stock SKUs',    description: 'Items with zero stock' },
  total_stock_value:  { group: 'Inventory',  label: 'Total Stock Value',    description: 'Inventory value (stock × sale price)' },
  // Returns
  total_returns:      { group: 'Returns',    label: 'Total Returns',        description: 'Count of return requests (in period)' },
  return_value:       { group: 'Returns',    label: 'Return Value',         description: 'Total rupees refunded' },
  return_rate:        { group: 'Returns',    label: 'Return Rate (%)',      description: 'Returns as a % of orders' },
  // Ops / SLA
  sla_breaches:       { group: 'Operations', label: 'SLA Breaches',         description: 'Total fulfillment SLA violations' },
  fulfillment_rate:   { group: 'Operations', label: 'Fulfillment Rate (%)', description: 'Completed orders as % of total' },
};

export function getMetricCatalog() {
  return Object.entries(METRIC_DEFINITIONS).map(([key, def]) => ({ key, ...def }));
}

// ─── Date range resolution ────────────────────────────────────────────────────

export function resolveDateRange(mode: string): { start_date?: Date; end_date?: Date; label: string } {
  const now = new Date();
  const endOfToday = new Date(now); endOfToday.setHours(23, 59, 59, 999);
  const startOfToday = new Date(now); startOfToday.setHours(0, 0, 0, 0);

  switch (mode) {
    case 'today':
      return { start_date: startOfToday, end_date: endOfToday, label: 'Today' };
    case 'yesterday': {
      const y = new Date(startOfToday); y.setDate(y.getDate() - 1);
      const yEnd = new Date(y); yEnd.setHours(23, 59, 59, 999);
      return { start_date: y, end_date: yEnd, label: 'Yesterday' };
    }
    case 'last7': {
      const s = new Date(startOfToday); s.setDate(s.getDate() - 6);
      return { start_date: s, end_date: endOfToday, label: 'Last 7 days' };
    }
    case 'last30': {
      const s = new Date(startOfToday); s.setDate(s.getDate() - 29);
      return { start_date: s, end_date: endOfToday, label: 'Last 30 days' };
    }
    case 'mtd': {
      const s = new Date(now.getFullYear(), now.getMonth(), 1);
      return { start_date: s, end_date: endOfToday, label: 'Month to date' };
    }
    default:
      return { label: 'All time' };
  }
}

// ─── Fetch live metric values for a brand within a date range ────────────────

async function buildMetricData(
  brandId: string,
  dateRange = 'today',
): Promise<Record<string, string | number>> {
  const range = resolveDateRange(dateRange);
  const filters = { start_date: range.start_date?.toISOString(), end_date: range.end_date?.toISOString() };

  const [orders, customers, inventory, returns, breachCount] = await Promise.all([
    repository.findOrdersByBrand(brandId, filters),
    repository.findCustomersByBrand(brandId),
    repository.findInventoryByBrand(brandId),
    repository.findReturnsByBrand(brandId, filters),
    repository.prisma.breachLog.count({ where: { brandId } }),
  ]);

  const totalRevenue = orders.reduce((s, o) => s + o.amount, 0);
  const totalOrders = orders.length;
  const delivered = orders.filter(o => o.status === 'fulfilled' || o.status === 'delivered');
  const pending = orders.filter(o => o.status === 'pending');
  const cancelled = orders.filter(o => o.status === 'cancelled');
  const totalReturns = returns.length;
  const returnValue = returns.reduce((s, r) => s + (r.amount ?? 0), 0);
  const lowStockCount = inventory.filter(i => i.stockLevel > 0 && i.stockLevel <= i.reorderPoint).length;
  const outOfStockCount = inventory.filter(i => i.stockLevel === 0).length;
  const totalStockValue = inventory.reduce((s, i) => s + i.salePrice * i.stockLevel, 0);

  // New customers in range
  const rangeStart = range.start_date?.getTime() ?? 0;
  const rangeEnd = range.end_date?.getTime() ?? Date.now();
  const newCustomers = customers.filter(c => {
    const t = new Date((c as any).createdAt).getTime();
    return t >= rangeStart && t <= rangeEnd;
  }).length;
  const repeatCustomers = customers.filter(c => (c.totalOrders ?? 0) > 1).length;

  const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const fmtPct = (n: number) => `${n.toFixed(1)}%`;
  const fmtCur = (n: number) => `₹${fmt(n)}`;

  return {
    total_revenue:      fmtCur(totalRevenue),
    net_revenue:        fmtCur(Math.max(0, totalRevenue - returnValue)),
    total_orders:       String(totalOrders),
    avg_order_value:    fmtCur(totalOrders > 0 ? totalRevenue / totalOrders : 0),
    delivered_orders:   String(delivered.length),
    pending_orders:     String(pending.length),
    cancelled_orders:   String(cancelled.length),
    total_customers:    String(customers.length),
    new_customers:      String(newCustomers),
    repeat_customers:   String(repeatCustomers),
    total_skus:         String(inventory.length),
    low_stock_count:    String(lowStockCount),
    out_of_stock_count: String(outOfStockCount),
    total_stock_value:  fmtCur(totalStockValue),
    total_returns:      String(totalReturns),
    return_value:       fmtCur(returnValue),
    return_rate:        fmtPct(totalOrders > 0 ? (totalReturns / totalOrders) * 100 : 0),
    sla_breaches:       String(breachCount),
    fulfillment_rate:   fmtPct(totalOrders > 0 ? (delivered.length / totalOrders) * 100 : 0),
    // Context
    brand_name:         '',
    report_date:        new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    report_timestamp:   new Date().toISOString(),
    date_range_label:   range.label,
  };
}

// ─── Template renderer ───────────────────────────────────────────────────────

function renderTemplate(template: string, data: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = data[key];
    return val !== undefined ? String(val) : `{{${key}}}`;
  });
}

// ─── Default template ────────────────────────────────────────────────────────

function buildDefaultTemplate(
  profileName: string,
  profileType: string,
  selectedMetrics: string[],
  metricData: Record<string, string | number>,
): string {
  const typeLabel = profileType === 'ops' ? 'Operations' : profileType === 'sales' ? 'Sales' : 'Custom';
  const metricRows = selectedMetrics
    .filter(k => METRIC_DEFINITIONS[k])
    .map(k => {
      const def = METRIC_DEFINITIONS[k];
      const val = metricData[k] ?? '—';
      return `<tr>
        <td style="padding:10px 16px;color:#374151;font-weight:500;border-bottom:1px solid #f3f4f6">${def.label}</td>
        <td style="padding:10px 16px;text-align:right;font-weight:700;color:#111827;border-bottom:1px solid #f3f4f6">${val}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<body style="font-family:Inter,sans-serif;background:#f9fafb;margin:0;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e7eb;overflow:hidden">
    <div style="background:#10b981;padding:24px 28px">
      <h1 style="color:#fff;margin:0;font-size:20px">${typeLabel} Report — {{brand_name}}</h1>
      <p style="color:#d1fae5;margin:4px 0 0;font-size:13px">{{date_range_label}} · {{report_date}}</p>
    </div>
    <div style="padding:24px 28px">
      <p style="color:#6b7280;font-size:13px;margin:0 0 20px">
        Profile: <strong style="color:#111827">${profileName}</strong>
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <thead>
          <tr style="background:#f9fafb">
            <th style="padding:10px 16px;text-align:left;color:#6b7280;font-weight:500">Metric</th>
            <th style="padding:10px 16px;text-align:right;color:#6b7280;font-weight:500">Value</th>
          </tr>
        </thead>
        <tbody>${metricRows}</tbody>
      </table>
    </div>
    <div style="padding:14px 28px;background:#f9fafb;border-top:1px solid #e5e7eb">
      <p style="font-size:12px;color:#9ca3af;margin:0">
        BRDG Alpha · Generated {{report_timestamp}}
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Render only (preview) ───────────────────────────────────────────────────

export async function renderDeliveryProfilePreview(profileId: string) {
  const profile = await repository.findDeliveryProfile(profileId);
  if (!profile) throw new Error('Delivery profile not found');
  const brand = await repository.findBrandById(profile.brandId);
  const brandName = brand?.name ?? 'Unknown Brand';

  const metricData = await buildMetricData(profile.brandId, (profile as any).dateRange || 'today');
  metricData.brand_name = brandName;

  const selectedMetrics = (profile.metrics as string[]) || [];
  const rawTemplate = (profile.emailTemplate as string)?.trim()
    ? (profile.emailTemplate as string)
    : buildDefaultTemplate(profile.name, profile.profileType as string, selectedMetrics, metricData);

  const html = renderTemplate(rawTemplate, metricData);
  const subject = renderTemplate(profile.emailSubject || `${profile.name} Report`, metricData);
  return { html, subject, metricData, brandName };
}

// ─── Public: send a delivery profile ────────────────────────────────────────

export async function sendDeliveryProfile(
  profileId: string,
  senderUserId: string,
): Promise<{ sent: number; failed: number; errors: string[]; provider: string | null }> {
  const profile = await repository.findDeliveryProfile(profileId);
  if (!profile) throw new Error('Delivery profile not found');

  const { html, subject } = await renderDeliveryProfilePreview(profileId);
  const recipients = (profile.recipients as Array<{ email: string; name?: string }>) || [];

  let sent = 0;
  let failed = 0;
  let providerUsed: string | null = null;
  const errors: string[] = [];
  const preferred = ((profile as any).mailProvider || 'auto') as 'auto' | 'outlook' | 'gmail';

  for (const r of recipients) {
    try {
      const result = await sendEmail({
        to: r.email,
        subject,
        html,
        senderUserId,
        provider: preferred,
      });
      providerUsed = result.provider;
      sent++;
    } catch (err: any) {
      failed++;
      errors.push(`${r.email}: ${err.message}`);
    }
  }

  await repository.updateDeliveryProfile(profileId, {
    lastSent: new Date(),
    lastRunAt: new Date(),
    lastRunStatus: failed === 0 ? 'ok' : sent === 0 ? 'failed' : 'partial',
    lastRunError: errors.length ? errors.join(' | ').slice(0, 1000) : null,
  });

  return { sent, failed, errors, provider: providerUsed };
}
