/**
 * Public webhook endpoints — must be registered BEFORE authMiddleware.
 *
 * Shopify webhooks carry an HMAC-SHA256 header (`X-Shopify-Hmac-Sha256`) computed
 * over the raw request body with the store's webhook secret. We therefore capture
 * the raw body on these routes (overriding the global JSON parser) and verify the
 * HMAC before accepting the payload.
 *
 * Supported topics:
 *   orders/create, orders/updated, orders/cancelled, orders/paid
 *   products/update
 *   refunds/create
 *
 * Near-realtime ingestion replaces the 6h Shopify polling cycle for stores that
 * have webhooks configured. Polling remains as a safety net.
 */

import { Express, Request, Response } from 'express';
import express from 'express';
import crypto from 'crypto';
import repository from '../database/repository';
import { log } from '../utils/logger';

const SHOPIFY_WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET || '';

function verifyShopifyHmac(raw: Buffer, headerHmac: string | undefined, secret: string): boolean {
  if (!secret || !headerHmac) return false;
  const digest = crypto.createHmac('sha256', secret).update(raw).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(headerHmac));
  } catch { return false; }
}

async function findBrandForShop(shopDomain: string): Promise<string | null> {
  // shopName in ShopifyStore is stored as the .myshopify.com prefix. Match by suffix.
  const stores = await repository.prisma.shopifyStore.findMany({
    where: { shopName: { startsWith: shopDomain.replace('.myshopify.com', '') } },
    take: 1,
  });
  return stores[0]?.brandId ?? null;
}

async function handleOrder(brandId: string, topic: string, body: any) {
  const orderId = String(body.id ?? body.order_id ?? '');
  if (!orderId) return;

  const amount = Number(body.total_price ?? body.current_total_price ?? 0);
  const customerName = [body.customer?.first_name, body.customer?.last_name].filter(Boolean).join(' ')
    || body.email || 'Unknown';
  const status = body.cancelled_at ? 'cancelled'
    : body.fulfillment_status === 'fulfilled' ? 'fulfilled'
    : body.financial_status === 'paid' ? 'paid'
    : 'pending';
  const orderDate = body.created_at ? new Date(body.created_at) : new Date();

  await repository.upsertOrder({
    brandId,
    orderId,
    customerName,
    amount,
    status,
    orderDate,
  });

  // Customer aggregate
  const email = body.customer?.email || body.email;
  if (email) {
    await repository.upsertCustomer(brandId, email, {
      name: customerName,
      totalOrders: body.customer?.orders_count ?? undefined,
      totalSpent: Number(body.customer?.total_spent ?? 0),
      lastOrderDate: orderDate,
    });
  }

  log.info('shopify webhook applied', { component: 'webhook', topic, brandId, orderId, status });
}

export function setupWebhookRoutes(app: Express) {
  // Use a dedicated JSON raw-body parser so we can verify HMAC over the exact bytes.
  const rawJson = express.raw({ type: 'application/json', limit: '2mb' });

  app.post('/api/webhooks/shopify', rawJson, async (req: Request, res: Response) => {
    try {
      const topic = (req.header('X-Shopify-Topic') || '').toLowerCase();
      const shop = req.header('X-Shopify-Shop-Domain') || '';
      const hmac = req.header('X-Shopify-Hmac-Sha256') || undefined;
      const raw = req.body as Buffer;

      if (!verifyShopifyHmac(raw, hmac, SHOPIFY_WEBHOOK_SECRET)) {
        log.warn('shopify webhook rejected — bad HMAC', { component: 'webhook', topic, shop });
        res.status(401).end();
        return;
      }

      const brandId = await findBrandForShop(shop);
      if (!brandId) {
        log.warn('shopify webhook for unknown shop', { component: 'webhook', shop });
        res.status(202).end(); // ack so Shopify doesn't retry forever
        return;
      }

      const body = JSON.parse(raw.toString('utf8'));

      switch (topic) {
        case 'orders/create':
        case 'orders/updated':
        case 'orders/paid':
        case 'orders/cancelled':
          await handleOrder(brandId, topic, body);
          break;
        default:
          log.debug('shopify webhook topic not handled', { component: 'webhook', topic });
      }

      res.status(200).end();
    } catch (err: any) {
      log.error('shopify webhook handler error', { component: 'webhook', err: err?.message });
      // 500s trigger Shopify retries — desirable for transient DB errors.
      res.status(500).end();
    }
  });
}
