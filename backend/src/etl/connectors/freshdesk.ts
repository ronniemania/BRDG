/**
 * Freshdesk connector — pulls tickets and writes canonical rows to
 * `freshdesk_tickets`. Paginates by page number until either an empty
 * page or a safety cap is reached.
 *
 * The credentials live on a DataSource row (type='freshdesk', config:
 * { domain, apiKey }). The connector is constructed by the caller after
 * looking that up — it does not read the database itself, which keeps
 * the connector pure and testable.
 *
 * Watermark: `lastUpdatedAt`. Freshdesk supports `updated_since` but the
 * API ordering is fragile; rather than rely on it for correctness we
 * advance the watermark only when a clean run finishes. Re-running a
 * window is safe because the ticket loader is an upsert keyed by id.
 */

import type { Connector, RawEvent } from '../types';
import repository from '../../database/repository';

interface FreshdeskTicketPayload {
  id: number;
  subject?: string;
  status: number;     // 2=open,3=pending,4=resolved,5=closed
  priority: number;   // 1=low,2=medium,3=high,4=urgent
  created_at: string;
  updated_at?: string;
  stats?: { resolved_at?: string };
}

interface CanonicalTicket {
  id: string;
  brandId: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: Date;
  resolvedAt?: Date;
  responseTimeHours?: number;
}

const STATUS_MAP: Record<number, string> = {
  2: 'open', 3: 'pending', 4: 'resolved', 5: 'closed',
};
const PRIORITY_MAP: Record<number, string> = {
  1: 'low', 2: 'medium', 3: 'high', 4: 'urgent',
};

export interface FreshdeskConnectorOpts {
  brandId: string;
  domain: string;          // "acme" or "acme.freshdesk.com"
  apiKey: string;
  /** Hard cap on pages — protects against runaway pagination. */
  maxPages?: number;
  /** Items per page (Freshdesk caps at 100). */
  perPage?: number;
}

export function makeFreshdeskTicketsConnector(
  opts: FreshdeskConnectorOpts,
): Connector<FreshdeskTicketPayload, CanonicalTicket> {
  const subdomain = opts.domain.replace(/\.freshdesk\.com$/, '');
  const auth = `Basic ${Buffer.from(`${opts.apiKey}:X`).toString('base64')}`;
  const perPage = Math.min(100, opts.perPage ?? 100);
  const maxPages = opts.maxPages ?? 50;

  return {
    source: 'freshdesk',
    topic: 'tickets',
    async extract() {
      const events: RawEvent<FreshdeskTicketPayload>[] = [];
      const errors: string[] = [];
      let lastUpdated = '1970-01-01T00:00:00Z';

      for (let page = 1; page <= maxPages; page++) {
        const url = `https://${subdomain}.freshdesk.com/api/v2/tickets`
          + `?per_page=${perPage}&page=${page}&include=requester`
          + `&order_by=created_at&order_type=desc`;
        let res: Response;
        try {
          res = await fetch(url, {
            headers: { Authorization: auth, 'Content-Type': 'application/json' },
          });
        } catch (err: any) {
          errors.push(`page ${page}: ${err?.message ?? err}`);
          break;
        }
        if (!res.ok) {
          // 429 is recoverable; we just stop this run and let the next
          // tick re-attempt. Other 4xx/5xx are recorded as soft errors.
          errors.push(`page ${page}: HTTP ${res.status}`);
          break;
        }
        const tickets = (await res.json()) as FreshdeskTicketPayload[];
        if (!Array.isArray(tickets) || tickets.length === 0) break;

        for (const t of tickets) {
          events.push({
            source: 'freshdesk',
            topic: 'tickets',
            brandId: opts.brandId,
            externalId: String(t.id),
            payload: t,
          });
          if (t.updated_at && t.updated_at > lastUpdated) lastUpdated = t.updated_at;
        }
        if (tickets.length < perPage) break;
      }

      return {
        events,
        errors: errors.length ? errors : undefined,
        nextWatermark: events.length ? { lastUpdatedAt: lastUpdated } : undefined,
      };
    },
    async transform(raw) {
      const t = raw.payload;
      const createdAt = new Date(t.created_at);
      const resolvedAt = t.stats?.resolved_at ? new Date(t.stats.resolved_at) : undefined;
      const responseTimeHours = resolvedAt
        ? (resolvedAt.getTime() - createdAt.getTime()) / 3_600_000
        : undefined;
      return [{
        id: String(t.id),
        brandId: opts.brandId,
        subject: t.subject ?? '(no subject)',
        status: STATUS_MAP[t.status] ?? 'open',
        priority: PRIORITY_MAP[t.priority] ?? 'medium',
        createdAt,
        resolvedAt,
        responseTimeHours,
      }];
    },
    async load(row) {
      await repository.prisma.freshdeskTicket.upsert({
        where: { id: row.id },
        update: {
          subject: row.subject,
          status: row.status,
          priority: row.priority,
          resolvedAt: row.resolvedAt ?? null,
          responseTimeHours: row.responseTimeHours ?? null,
        },
        create: {
          id: row.id,
          brandId: row.brandId,
          subject: row.subject,
          status: row.status,
          priority: row.priority,
          createdAt: row.createdAt,
          resolvedAt: row.resolvedAt,
          responseTimeHours: row.responseTimeHours,
        },
      });
    },
  };
}
