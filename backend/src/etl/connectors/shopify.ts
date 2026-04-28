/**
 * Shopify connectors — orders, products. One Connector per topic so a
 * failure on the products endpoint doesn't poison the orders sync.
 *
 * The connectors are deliberately thin wrappers around the existing
 * Shopify HTTP shape (REST 2024-01). All API I/O lives here; the
 * transforms below are pure and testable.
 *
 * Watermark strategy
 * ──────────────────
 * Orders: `updated_at_min` cursor. Shopify guarantees orders are returned
 * in `updated_at` ASC order when we pass that filter, so we advance to
 * the max(updated_at) we've seen + 1ms.
 *
 * Products: `updated_at_min` likewise.
 *
 * If a watermark is missing (first run) we pull a sensible default
 * window (last 30 days for orders, all-active for products).
 */

import type { Connector, RawEvent } from '../types';
import repository from '../../database/repository';

// ── Raw payload shapes (subset of the Shopify Admin API REST 2024-01) ────────

export interface ShopifyOrderPayload {
  id: number;
  name?: string;
  total_price?: string;
  current_total_price?: string;
  financial_status?: string;
  fulfillment_status?: string | null;
  cancelled_at?: string | null;
  email?: string;
  created_at?: string;
  updated_at?: string;
  customer?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    orders_count?: number;
    total_spent?: string;
  };
  fulfillments?: Array<{ created_at: string }>;
}

export interface ShopifyProductPayload {
  id: number;
  title: string;
  status: string;
  product_type?: string;
  updated_at?: string;
  variants: Array<{
    sku?: string;
    inventory_quantity?: number;
    price?: string;
    compare_at_price?: string | null;
  }>;
}

// ── Canonical (post-transform) shapes ────────────────────────────────────────

export interface CanonicalOrder {
  brandId: string;
  orderId: string;
  /** Raw external ID (e.g. Shopify numeric ID) kept for cross-reference. */
  sourceOrderNumber?: string;
  customerName: string;
  customerEmail?: string;
  amount: number;
  status: string;
  orderDate: Date;
  dispatchDate?: Date;
  hoursToDispatch?: number;
}

export interface CanonicalCustomerUpsert {
  brandId: string;
  email: string;
  name: string;
  totalOrders?: number;
  totalSpent?: number;
  lastOrderDate?: Date;
}

export interface CanonicalInventoryItem {
  brandId: string;
  sku: string;
  name: string;
  stockLevel: number;
  category: string;
  salePrice: number;
  costPrice: number;
  status: string;
  shopifyStatus: string;
}

// ── Status mapping ───────────────────────────────────────────────────────────

export function mapShopifyOrderStatus(p: ShopifyOrderPayload): string {
  // Map to the app's canonical statuses so every frontend STATUS_COLORS
  // map renders the correct badge colour. Raw Shopify values ('fulfilled',
  // 'paid') were leaking through before and showing as unstyled grey.
  if (p.cancelled_at) return 'cancelled';
  if (p.fulfillment_status === 'fulfilled') return 'delivered';  // fully dispatched
  if (p.financial_status === 'refunded') return 'returned';
  if (p.financial_status === 'voided') return 'cancelled';
  if (p.financial_status === 'paid') return 'confirmed';         // paid, awaiting fulfilment
  return 'pending';
}

// ── HTTP helper ──────────────────────────────────────────────────────────────

async function shopifyGet<T>(
  shopName: string, apiKey: string, apiPassword: string, endpoint: string,
): Promise<T> {
  // Basic auth via URL is the legacy private-app pattern; we keep it for
  // compatibility with the existing ShopifyStore credential storage. New
  // installs should migrate to OAuth scoped tokens but that's a separate
  // change — out of scope for the ETL refactor.
  const url = `https://${apiKey}:${apiPassword}@${shopName}.myshopify.com/admin/api/2024-01/${endpoint}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Shopify ${endpoint} → ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

// ── Pure transforms (no I/O) ─────────────────────────────────────────────────

export function transformOrder(brandId: string, p: ShopifyOrderPayload): CanonicalOrder {
  const customerName = [p.customer?.first_name, p.customer?.last_name]
    .filter(Boolean).join(' ').trim() || p.email || 'Unknown';
  const orderDate = p.created_at ? new Date(p.created_at) : new Date();
  const dispatchDate = p.fulfillments?.[0]?.created_at ? new Date(p.fulfillments[0].created_at) : undefined;
  const hoursToDispatch = dispatchDate
    ? (dispatchDate.getTime() - orderDate.getTime()) / 3_600_000
    : undefined;
  const amount = Number(p.total_price ?? p.current_total_price ?? 0);

  return {
    brandId,
    // p.name is the human-readable Shopify order number (#1034).
    // p.id is the internal numeric ID (5678901234567). We always
    // prefer name for display; fall back only if Shopify omits it
    // (which never happens in practice for real orders).
    orderId: p.name || `#${p.id}`,
    sourceOrderNumber: String(p.id),
    customerName,
    customerEmail: p.customer?.email || p.email,
    amount: Number.isFinite(amount) ? amount : 0,
    status: mapShopifyOrderStatus(p),
    orderDate,
    dispatchDate,
    hoursToDispatch,
  };
}

export function transformCustomer(brandId: string, p: ShopifyOrderPayload): CanonicalCustomerUpsert | null {
  const email = p.customer?.email || p.email;
  if (!email) return null;
  const name = [p.customer?.first_name, p.customer?.last_name]
    .filter(Boolean).join(' ').trim() || email;
  return {
    brandId,
    email,
    name,
    totalOrders: p.customer?.orders_count,
    totalSpent: Number(p.customer?.total_spent ?? 0),
    lastOrderDate: p.created_at ? new Date(p.created_at) : undefined,
  };
}

export function transformProductVariants(brandId: string, p: ShopifyProductPayload): CanonicalInventoryItem[] {
  return (p.variants || []).map(v => {
    const sku = v.sku || `shopify-${p.id}-${v.price ?? 'na'}`;
    const stockQty = v.inventory_quantity ?? 0;
    return {
      brandId,
      sku,
      name: p.title,
      stockLevel: stockQty,
      category: p.product_type || 'General',
      salePrice: Number(v.price) || 0,
      costPrice: Number(v.compare_at_price ?? 0) || 0,
      status: stockQty === 0 ? 'out_of_stock' : 'in_stock',
      shopifyStatus: p.status || 'active',
    };
  });
}

// ── Connector: orders ────────────────────────────────────────────────────────

export interface ShopifyOrdersConnectorOpts {
  brandId: string;
  shopName: string;
  apiKey: string;
  apiPassword: string;
  /** Look back this many days when no watermark exists. */
  initialLookbackDays?: number;
}

export function makeShopifyOrdersConnector(
  opts: ShopifyOrdersConnectorOpts,
): Connector<ShopifyOrderPayload, CanonicalOrder | CanonicalCustomerUpsert> {
  return {
    source: 'shopify',
    topic: 'orders',
    async extract(_ctx, watermark) {
      const since = (watermark?.updatedAtMin as string | undefined)
        ?? new Date(Date.now() - (opts.initialLookbackDays ?? 30) * 86_400_000).toISOString();

      const data = await shopifyGet<{ orders?: ShopifyOrderPayload[] }>(
        opts.shopName, opts.apiKey, opts.apiPassword,
        `orders.json?status=any&limit=250&updated_at_min=${encodeURIComponent(since)}`,
      );
      const orders = data.orders ?? [];

      // Compute next watermark = max(updated_at) + 1ms
      let maxUpdated = since;
      for (const o of orders) {
        if (o.updated_at && o.updated_at > maxUpdated) maxUpdated = o.updated_at;
      }
      const nextWatermark = orders.length
        ? { updatedAtMin: new Date(new Date(maxUpdated).getTime() + 1).toISOString() }
        : undefined;

      const events: RawEvent<ShopifyOrderPayload>[] = orders.map(o => ({
        source: 'shopify',
        topic: 'orders/sync',
        brandId: opts.brandId,
        externalId: String(o.id),
        payload: o,
      }));
      return { events, nextWatermark };
    },
    transform(raw) {
      // Emit the canonical Order PLUS (when present) the canonical Customer.
      // The loader fans out by row.kind below.
      const order = transformOrder(opts.brandId, raw.payload);
      const customer = transformCustomer(opts.brandId, raw.payload);
      const rows: Array<CanonicalOrder | CanonicalCustomerUpsert> = [order];
      if (customer) rows.push(customer);
      return rows;
    },
    async load(row) {
      // Discriminate by presence of orderId (Order) vs email (Customer).
      if ('orderId' in row) {
        await repository.upsertOrder({
          brandId: row.brandId,
          orderId: row.orderId,
          sourceOrderNumber: row.sourceOrderNumber,
          customerName: row.customerName,
          customerEmail: row.customerEmail,
          amount: row.amount,
          status: row.status,
          orderDate: row.orderDate,
          dispatchDate: row.dispatchDate,
          hoursToDispatch: row.hoursToDispatch,
        });

        // Seed/refresh fulfillment row — non-fatal.
        try {
          const existing = await repository.prisma.fulfillmentOrder.findUnique({
            where: { brandId_orderId: { brandId: row.brandId, orderId: row.orderId } },
            select: { orderTriggerAt: true, connectedToCourierAt: true },
          });
          if (!existing) {
            await repository.upsertFulfillmentOrder({
              brandId: row.brandId,
              orderId: row.orderId,
              orderTriggerAt: row.orderDate,
              ...(row.dispatchDate
                ? { connectedToCourierAt: row.dispatchDate, currentStep: 6, status: 'completed' }
                : { currentStep: 1, status: 'in_progress' }),
            });
          } else {
            const updates: Record<string, any> = {};
            if (!existing.orderTriggerAt) updates.orderTriggerAt = row.orderDate;
            if (!existing.connectedToCourierAt && row.dispatchDate) {
              updates.connectedToCourierAt = row.dispatchDate;
              updates.currentStep = 6;
              updates.status = 'completed';
            }
            if (Object.keys(updates).length) {
              await repository.prisma.fulfillmentOrder.update({
                where: { brandId_orderId: { brandId: row.brandId, orderId: row.orderId } },
                data: { ...updates, updatedAt: new Date() },
              });
            }
          }
        } catch { /* fulfillment is decorative — never fail the order load */ }
      } else {
        await repository.upsertCustomer(row.brandId, row.email, {
          name: row.name,
          totalOrders: row.totalOrders,
          totalSpent: row.totalSpent,
          lastOrderDate: row.lastOrderDate,
        });
      }
    },
  };
}

// ── Connector: products / inventory ──────────────────────────────────────────

export function makeShopifyProductsConnector(opts: {
  brandId: string;
  shopName: string;
  apiKey: string;
  apiPassword: string;
}): Connector<ShopifyProductPayload, CanonicalInventoryItem> {
  return {
    source: 'shopify',
    topic: 'products',
    async extract(_ctx, watermark) {
      const since = watermark?.updatedAtMin as string | undefined;
      const path = since
        ? `products.json?status=any&limit=250&updated_at_min=${encodeURIComponent(since)}`
        : `products.json?status=any&limit=250`;
      const data = await shopifyGet<{ products?: ShopifyProductPayload[] }>(
        opts.shopName, opts.apiKey, opts.apiPassword, path,
      );
      const products = data.products ?? [];

      let maxUpdated = since ?? '1970-01-01T00:00:00Z';
      for (const p of products) {
        if (p.updated_at && p.updated_at > maxUpdated) maxUpdated = p.updated_at;
      }
      const nextWatermark = products.length
        ? { updatedAtMin: new Date(new Date(maxUpdated).getTime() + 1).toISOString() }
        : undefined;

      const events: RawEvent<ShopifyProductPayload>[] = products.map(p => ({
        source: 'shopify',
        topic: 'products/sync',
        brandId: opts.brandId,
        externalId: String(p.id),
        payload: p,
      }));
      return { events, nextWatermark };
    },
    transform(raw) {
      return transformProductVariants(opts.brandId, raw.payload);
    },
    async load(row) {
      await repository.upsertInventoryItem(row);
    },
  };
}

// ── Webhook connector: a single order delivered by Shopify ───────────────────
//
// Used by ingestEvent() in the webhook handler. extract() is a no-op
// because the payload is already in hand; we just need transform + load.

export function makeShopifyOrderWebhookConnector(brandId: string):
  Connector<ShopifyOrderPayload, CanonicalOrder | CanonicalCustomerUpsert> {
  // We reuse makeShopifyOrdersConnector's transform/load by composing a
  // minimal connector that doesn't call the API.
  const real = makeShopifyOrdersConnector({
    brandId, shopName: '', apiKey: '', apiPassword: '',
  });
  return {
    source: 'shopify',
    topic: 'orders/webhook',
    async extract(): Promise<{ events: RawEvent<ShopifyOrderPayload>[] }> {
      return { events: [] }; // unused — webhook path uses ingestEvent()
    },
    transform: real.transform,
    load: real.load,
  };
}

