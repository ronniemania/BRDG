import { Express, Request, Response } from 'express';
import repository from '../database/repository';
import { ValidationError, NotFoundError, ForbiddenError } from '../utils/errors';

async function getBrandId(req: Request): Promise<string> {
  const brandId = (req.query.brandId as string) || req.params.brandId;
  if (!brandId) throw new ValidationError('brandId is required');
  const brand = await repository.findBrandById(brandId);
  if (!brand) throw new NotFoundError('Brand not found');
  const userId = (req as any).userId;
  if (!await repository.canAccessBrand(brand.id, userId)) throw new ForbiddenError();
  return brand.id;
}

// Find the Freshdesk data source for a brand
async function findFreshdeskSource(brandId: string) {
  const sources = await repository.findDataSourcesByBrand(brandId);
  return sources.find(s => s.type === 'freshdesk') ?? null;
}

export function setupFreshdeskRoutes(app: Express) {

  // GET /api/freshdesk/status?brandId= — check if credentials are saved
  app.get('/api/freshdesk/status', async (req: Request, res: Response) => {
    try {
      const brandId = await getBrandId(req);
      const source = await findFreshdeskSource(brandId);
      if (!source) {
        return res.json({ connected: false });
      }
      const config = (source.config ?? {}) as Record<string, any>;
      res.json({
        connected: !!(config.domain && config.apiKey),
        domain: config.domain ?? null,
        sourceId: source.id,
        lastSync: source.lastSync,
        recordCount: source.recordCount,
        syncStatus: source.syncStatus,
      });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // POST /api/freshdesk/connect?brandId= — save Freshdesk credentials
  app.post('/api/freshdesk/connect', async (req: Request, res: Response) => {
    try {
      const brandId = await getBrandId(req);
      const { domain, apiKey } = req.body as { domain?: string; apiKey?: string };
      if (!domain || !apiKey) throw new ValidationError('domain and apiKey are required');

      // Validate credentials by hitting the Freshdesk API
      const testUrl = `https://${domain.replace(/\.freshdesk\.com$/, '')}.freshdesk.com/api/v2/tickets?per_page=1`;
      const testRes = await fetch(testUrl, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${apiKey}:X`).toString('base64')}`,
          'Content-Type': 'application/json',
        },
      });

      if (testRes.status === 401) {
        throw new ValidationError('Invalid Freshdesk credentials. Check your API key.');
      }
      if (!testRes.ok && testRes.status !== 429) {
        throw new ValidationError(`Freshdesk returned ${testRes.status}. Check your domain.`);
      }

      // Upsert a DataSource record with the credentials in config
      const existing = await findFreshdeskSource(brandId);
      let source;
      if (existing) {
        source = await repository.prisma.dataSource.update({
          where: { id: existing.id },
          data: { config: { domain, apiKey }, syncStatus: 'pending' },
        });
      } else {
        source = await repository.createDataSource({
          brandId,
          name: 'Freshdesk',
          type: 'freshdesk',
          config: { domain, apiKey },
          syncStatus: 'pending',
        });
      }

      res.json({ message: 'Freshdesk connected successfully', sourceId: source.id });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // DELETE /api/freshdesk/disconnect?brandId= — remove credentials
  app.delete('/api/freshdesk/disconnect', async (req: Request, res: Response) => {
    try {
      const brandId = await getBrandId(req);
      const source = await findFreshdeskSource(brandId);
      if (!source) return res.json({ message: 'Not connected' });
      await repository.prisma.dataSource.delete({ where: { id: source.id } });
      res.json({ message: 'Freshdesk disconnected' });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // POST /api/freshdesk/sync?brandId= — fetch tickets from Freshdesk and store
  app.post('/api/freshdesk/sync', async (req: Request, res: Response) => {
    try {
      const brandId = await getBrandId(req);
      const source = await findFreshdeskSource(brandId);
      if (!source) throw new NotFoundError('Freshdesk not connected. Add credentials first.');

      const config = (source.config ?? {}) as Record<string, any>;
      if (!config.domain || !config.apiKey) {
        throw new ValidationError('Freshdesk credentials incomplete. Reconnect.');
      }

      await repository.updateDataSource(source.id, { syncStatus: 'syncing', lastError: null });
      res.json({ message: 'Sync started' });

      // Run sync in background
      setImmediate(async () => {
        try {
          const subdomain = config.domain.replace(/\.freshdesk\.com$/, '');
          const auth = `Basic ${Buffer.from(`${config.apiKey}:X`).toString('base64')}`;
          let page = 1;
          let totalImported = 0;
          let hasMore = true;

          while (hasMore) {
            const url = `https://${subdomain}.freshdesk.com/api/v2/tickets?per_page=100&page=${page}&include=requester&order_by=created_at&order_type=desc`;
            const ticketRes = await fetch(url, {
              headers: { Authorization: auth, 'Content-Type': 'application/json' },
            });

            if (!ticketRes.ok) break;
            const tickets = (await ticketRes.json()) as any[];
            if (!Array.isArray(tickets) || tickets.length === 0) break;

            for (const t of tickets) {
              // Map Freshdesk status: 2=open,3=pending,4=resolved,5=closed
              const statusMap: Record<number, string> = { 2: 'open', 3: 'pending', 4: 'resolved', 5: 'closed' };
              const priorityMap: Record<number, string> = { 1: 'low', 2: 'medium', 3: 'high', 4: 'urgent' };

              const resolvedAt = t.stats?.resolved_at ? new Date(t.stats.resolved_at) : null;
              const createdAt  = new Date(t.created_at);
              const responseTimeHours = resolvedAt
                ? (resolvedAt.getTime() - createdAt.getTime()) / 3600000
                : null;

              await repository.prisma.freshdeskTicket.upsert({
                where: { id: String(t.id) },
                update: {
                  subject: t.subject ?? '(no subject)',
                  status: statusMap[t.status] ?? 'open',
                  priority: priorityMap[t.priority] ?? 'medium',
                  resolvedAt,
                  responseTimeHours,
                },
                create: {
                  id: String(t.id),
                  brandId,
                  subject: t.subject ?? '(no subject)',
                  status: statusMap[t.status] ?? 'open',
                  priority: priorityMap[t.priority] ?? 'medium',
                  createdAt,
                  resolvedAt: resolvedAt ?? undefined,
                  responseTimeHours: responseTimeHours ?? undefined,
                },
              });
              totalImported++;
            }

            hasMore = tickets.length === 100;
            page++;
            if (page > 50) break; // safety cap at 5000 tickets
          }

          await repository.updateDataSource(source.id, {
            syncStatus: 'active',
            lastSync: new Date(),
            recordCount: totalImported,
            lastError: null,
          });
          await repository.createSyncLog({
            brandId,
            dataSourceId: source.id,
            status: 'completed',
            recordCount: totalImported,
          });
        } catch (err: any) {
          await repository.updateDataSource(source.id, {
            syncStatus: 'error',
            lastError: err.message,
          });
          await repository.createSyncLog({
            brandId,
            dataSourceId: source.id,
            status: 'error',
            recordCount: 0,
            error: err.message,
          });
        }
      });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });
}
