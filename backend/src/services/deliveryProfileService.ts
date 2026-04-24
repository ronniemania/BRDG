import repository from '../database/repository';
import { sendEmailViaGmail } from './gmailService';

// ─── Available metric keys and their human-readable labels ───────────────────

export const METRIC_DEFINITIONS: Record<string, { label: string; description: string }> = {
  total_revenue:      { label: 'Total Revenue',      description: 'Sum of all order amounts' },
  total_orders:       { label: 'Total Orders',        description: 'Count of all orders' },
  avg_order_value:    { label: 'Avg Order Value',     description: 'Average amount per order' },
  pending_orders:     { label: 'Pending Orders',      description: 'Orders not yet fulfilled' },
  total_customers:    { label: 'Total Customers',     description: 'Count of unique customers' },
  total_returns:      { label: 'Total Returns',       description: 'Count of return requests' },
  return_rate:        { label: 'Return Rate (%)',      description: 'Returns as a % of orders' },
  low_stock_count:    { label: 'Low Stock SKUs',       description: 'Items at or below reorder point' },
  total_stock_value:  { label: 'Total Stock Value',   description: 'Inventory value (stock × sale price)' },
  sla_breaches:       { label: 'SLA Breaches',        description: 'Total fulfillment SLA violations' },
  fulfillment_rate:   { label: 'Fulfillment Rate (%)', description: 'Completed orders as % of total' },
};

// ─── Fetch live metric values for a brand ────────────────────────────────────

async function buildMetricData(brandId: string): Promise<Record<string, number | string>> {
  const [orders, customers, inventory, returns, breachCount] = await Promise.all([
    repository.findOrdersByBrand(brandId),
    repository.findCustomersByBrand(brandId),
    repository.findInventoryByBrand(brandId),
    repository.findReturnsByBrand(brandId),
    repository.prisma.breachLog.count({ where: { brandId } }),
  ]);

  const totalRevenue = orders.reduce((s, o) => s + o.amount, 0);
  const totalOrders = orders.length;
  const completedOrders = orders.filter(o => o.status === 'fulfilled' || o.status === 'delivered').length;
  const pendingOrders = orders.filter(o => o.status === 'pending').length;
  const totalReturns = returns.length;
  const lowStockCount = inventory.filter(i => i.stockLevel <= i.reorderPoint).length;
  const totalStockValue = inventory.reduce((s, i) => s + i.salePrice * i.stockLevel, 0);

  const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const fmtPct = (n: number) => `${n.toFixed(1)}%`;
  const fmtCur = (n: number) => `₹${fmt(n)}`;

  return {
    total_revenue:      fmtCur(totalRevenue),
    total_orders:       String(totalOrders),
    avg_order_value:    fmtCur(totalOrders > 0 ? totalRevenue / totalOrders : 0),
    pending_orders:     String(pendingOrders),
    total_customers:    String(customers.length),
    total_returns:      String(totalReturns),
    return_rate:        fmtPct(totalOrders > 0 ? (totalReturns / totalOrders) * 100 : 0),
    low_stock_count:    String(lowStockCount),
    total_stock_value:  fmtCur(totalStockValue),
    sla_breaches:       String(breachCount),
    fulfillment_rate:   fmtPct(totalOrders > 0 ? (completedOrders / totalOrders) * 100 : 0),
    // Convenience aliases usable in templates
    brand_name:         '', // filled per-brand below
    report_date:        new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
    report_timestamp:   new Date().toISOString(),
  };
}

// ─── Template renderer ───────────────────────────────────────────────────────

function renderTemplate(template: string, data: Record<string, string | number>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = data[key];
    return val !== undefined ? String(val) : `{{${key}}}`;
  });
}

// ─── Default template (used when emailTemplate is empty) ─────────────────────

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
      <h1 style="color:#fff;margin:0;font-size:20px">BRDG ${typeLabel} Report</h1>
      <p style="color:#d1fae5;margin:4px 0 0;font-size:13px">{{report_date}}</p>
    </div>
    <div style="padding:24px 28px">
      <p style="color:#6b7280;font-size:13px;margin:0 0 20px">
        Delivery Profile: <strong style="color:#111827">${profileName}</strong> &nbsp;·&nbsp; {{brand_name}}
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
        BRDG Alpha · Delivery Profile · Generated {{report_timestamp}}
      </p>
    </div>
  </div>
</body>
</html>`;
}

// ─── Public: send a delivery profile ────────────────────────────────────────

export async function sendDeliveryProfile(
  profileId: string,
  senderUserId: string,
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const profile = await repository.findDeliveryProfile(profileId);
  if (!profile) throw new Error('Delivery profile not found');

  // Fetch brand name
  const brand = await repository.findBrandById(profile.brandId);
  const brandName = brand?.name ?? 'Unknown Brand';

  // Build metric data
  const metricData = await buildMetricData(profile.brandId);
  metricData.brand_name = brandName;

  const selectedMetrics = (profile.metrics as string[]) || [];

  // Resolve email template (custom or auto-generated default)
  const rawTemplate = (profile.emailTemplate as string)?.trim()
    ? (profile.emailTemplate as string)
    : buildDefaultTemplate(profile.name, profile.profileType as string, selectedMetrics, metricData);

  const renderedHtml = renderTemplate(rawTemplate, metricData);
  const renderedSubject = renderTemplate(profile.emailSubject as string || `${profile.name} Report`, metricData);

  const recipients = (profile.recipients as Array<{ email: string; name?: string }>) || [];

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const recipient of recipients) {
    try {
      await sendEmailViaGmail(senderUserId, recipient.email, renderedSubject, renderedHtml);
      sent++;
    } catch (err: any) {
      failed++;
      errors.push(`${recipient.email}: ${err.message}`);
    }
  }

  // Update lastSent timestamp
  await repository.updateDeliveryProfile(profileId, { lastSent: new Date() });

  return { sent, failed, errors };
}
