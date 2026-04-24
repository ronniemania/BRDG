import repository from '../database/repository';

interface ShopifyOrder {
  id: number;
  name: string;
  total_price: string;
  financial_status: string;
  created_at: string;
  customer?: { first_name?: string; last_name?: string; email?: string };
  fulfillments?: Array<{ created_at: string }>;
}

interface ShopifyProduct {
  id: number;
  title: string;
  status: string; // 'active' | 'draft' | 'archived'
  variants: Array<{ sku: string; inventory_quantity: number; price: string; compare_at_price?: string }>;
  product_type: string;
}

export class ShopifyService {
  private async shopifyFetch(shopName: string, apiKey: string, apiPassword: string, endpoint: string): Promise<any> {
    const url = `https://${apiKey}:${apiPassword}@${shopName}.myshopify.com/admin/api/2024-01/${endpoint}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Shopify API error: ${res.status} ${res.statusText}`);
    return res.json();
  }

  async syncStore(storeId: string): Promise<{ orders: number; products: number; errors: string[] }> {
    // Use repository so credentials are automatically decrypted
    const store = await repository.findShopifyStoreById(storeId);
    if (!store) throw new Error('Store not found');

    const errors: string[] = [];
    let ordersSync = 0;
    let productsSync = 0;

    // Sync orders
    try {
      const data = await this.shopifyFetch(store.shopName, store.apiKey, store.apiPassword, 'orders.json?limit=250&status=any');
      const orders: ShopifyOrder[] = data.orders || [];

      for (const o of orders) {
        try {
          const customerName = o.customer
            ? `${o.customer.first_name || ''} ${o.customer.last_name || ''}`.trim() || 'Unknown'
            : 'Unknown';

          const dispatchDate = o.fulfillments?.[0]?.created_at ? new Date(o.fulfillments[0].created_at) : undefined;
          const orderDate = new Date(o.created_at);
          const hoursToDispatch = dispatchDate
            ? (dispatchDate.getTime() - orderDate.getTime()) / 3600000
            : undefined;

          await repository.upsertOrder({
            brandId: store.brandId,
            orderId: String(o.id),
            customerName,
            amount: parseFloat(o.total_price),
            status: this.mapShopifyStatus(o.financial_status),
            orderDate,
            dispatchDate,
            hoursToDispatch,
          });

          // ── Seed / update fulfillment pipeline ──────────────────────────
          try {
            const existingFF = await repository.prisma.fulfillmentOrder.findUnique({
              where: { brandId_orderId: { brandId: store.brandId, orderId: String(o.id) } },
              select: { orderTriggerAt: true, connectedToCourierAt: true },
            });
            if (!existingFF) {
              await repository.upsertFulfillmentOrder({
                brandId: store.brandId,
                orderId: String(o.id),
                orderTriggerAt: orderDate,
                ...(dispatchDate ? { connectedToCourierAt: dispatchDate, currentStep: 6, status: 'completed' } : { currentStep: 1, status: 'in_progress' }),
              });
            } else {
              const updates: Record<string, any> = {};
              if (!existingFF.orderTriggerAt) updates.orderTriggerAt = orderDate;
              if (!existingFF.connectedToCourierAt && dispatchDate) {
                updates.connectedToCourierAt = dispatchDate;
                updates.currentStep = 6;
                updates.status = 'completed';
              }
              if (Object.keys(updates).length > 0) {
                await repository.prisma.fulfillmentOrder.update({
                  where: { brandId_orderId: { brandId: store.brandId, orderId: String(o.id) } },
                  data: { ...updates, updatedAt: new Date() },
                });
              }
            }
          } catch (_ffErr) { /* non-fatal — order sync still counted */ }

          ordersSync++;
        } catch (err: any) {
          errors.push(`Order ${o.id} failed: ${err.message}`);
        }
      }
    } catch (err: any) {
      errors.push(`Orders sync failed: ${err.message}`);
    }

    // Sync products / inventory
    try {
      const data = await this.shopifyFetch(store.shopName, store.apiKey, store.apiPassword, 'products.json?limit=250&status=any');
      const products: ShopifyProduct[] = data.products || [];

      for (const p of products) {
        for (const variant of p.variants) {
          try {
            const sku = variant.sku || `shopify-${p.id}-${variant.price}`;
            const stockQty = variant.inventory_quantity || 0;
            await repository.upsertInventoryItem({
              brandId: store.brandId,
              sku,
              name: p.title,
              stockLevel: stockQty,
              category: p.product_type || 'General',
              salePrice: parseFloat(variant.price) || 0,
              costPrice: variant.compare_at_price ? parseFloat(variant.compare_at_price) : 0,
              status: stockQty === 0 ? 'out_of_stock' : 'in_stock',
              shopifyStatus: p.status || 'active',
            });

            productsSync++;
          } catch (err: any) {
            errors.push(`Product ${p.id} variant failed: ${err.message}`);
          }
        }
      }
    } catch (err: any) {
      errors.push(`Products sync failed: ${err.message}`);
    }

    // Update store metrics
    await repository.prisma.shopifyMetrics.create({
      data: {
        storeId: store.id,
        brandId: store.brandId,
        ordersCount: ordersSync,
        totalRevenue: 0,
      },
    }).catch(() => {});

    return { orders: ordersSync, products: productsSync, errors };
  }

  private mapShopifyStatus(financialStatus: string): string {
    switch (financialStatus) {
      case 'paid': return 'confirmed';
      case 'pending': return 'pending';
      case 'refunded': return 'returned';
      case 'voided': return 'cancelled';
      default: return 'pending';
    }
  }

  async syncAllBrandStores(brandId: string) {
    const stores = await repository.findShopifyStoresByBrand(brandId);
    const results = [];
    for (const store of stores) {
      try {
        const result = await this.syncStore(store.id);
        results.push({ storeId: store.id, shopName: store.shopName, ...result });
        await repository.createSyncLog({
          brandId,
          dataSourceId: store.id,
          status: 'completed',
          recordCount: result.orders + result.products,
        });
      } catch (err: any) {
        results.push({ storeId: store.id, shopName: store.shopName, error: err.message });
        await repository.createSyncLog({
          brandId,
          dataSourceId: store.id,
          status: 'error',
          error: err.message,
        });
      }
    }
    return results;
  }
}

export default new ShopifyService();
