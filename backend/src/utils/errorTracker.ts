/**
 * Lightweight error tracking shim.
 *
 * Goals:
 *   • Zero hard dependency. Sentry is optional — if SENTRY_DSN is unset,
 *     every call here is a no-op. We never break a deploy because the
 *     observability vendor isn't installed.
 *   • Single integration point. The whole app calls captureException()
 *     and breadcrumb(). The decision of where the data goes lives here.
 *   • Self-installing globals. The shim wires up unhandledRejection and
 *     uncaughtException once on import, with a guard so unit tests
 *     can require the module without leaking listeners.
 *
 * To enable real reporting, install the official SDK and flip the
 * `SENTRY_DSN` env var. The integration point is intentionally tiny so
 * swapping vendors (Sentry → Highlight → Raygun → ...) is a one-file
 * change. Until then we get structured logs in the existing pipeline,
 * which is enough for early public testing.
 */

import { log } from './logger';

const DSN = process.env.SENTRY_DSN || '';
const ENV = process.env.NODE_ENV || 'development';
const RELEASE = process.env.RELEASE_SHA || 'unknown';

interface SentryLike {
  init: (opts: Record<string, unknown>) => void;
  captureException: (err: unknown, hint?: Record<string, unknown>) => void;
  addBreadcrumb: (b: { category?: string; message?: string; data?: unknown; level?: string }) => void;
  setUser: (u: { id?: string; email?: string } | null) => void;
}

let sentry: SentryLike | null = null;
let initAttempted = false;

/**
 * Late-binds to @sentry/node when DSN is set. Failure to load is
 * recorded once and suppressed thereafter so we don't spam the logs.
 */
async function ensureInit(): Promise<void> {
  if (initAttempted) return;
  initAttempted = true;
  if (!DSN) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod: any = await import('@sentry/node').catch(() => null);
    if (!mod || !mod.init) {
      log.warn('SENTRY_DSN set but @sentry/node not installed — skipping init', { component: 'errorTracker' });
      return;
    }
    mod.init({
      dsn: DSN,
      environment: ENV,
      release: RELEASE,
      // Conservative sample rates — bump per-environment if you actually
      // want traces. We default to errors-only.
      tracesSampleRate: 0,
      profilesSampleRate: 0,
    });
    sentry = mod as SentryLike;
    log.info('error tracking initialized', { component: 'errorTracker', environment: ENV, release: RELEASE });
  } catch (err: any) {
    log.warn('error tracker init failed — continuing without it', {
      component: 'errorTracker', err: err?.message,
    });
  }
}

// Fire-and-forget init at module load. Top-level await isn't safe in
// CommonJS-target builds, so we kick this off and let it resolve.
void ensureInit();

export interface ErrorContext {
  component?: string;
  userId?: string;
  brandId?: string;
  route?: string;
  extra?: Record<string, unknown>;
}

/**
 * Report an error. Always logs locally (so you have signal even when
 * Sentry is offline) and forwards to the SDK if it's configured.
 */
export function captureException(err: unknown, ctx: ErrorContext = {}): void {
  const message = err instanceof Error ? err.message : String(err);
  log.error(`[exception] ${message}`, {
    component: ctx.component ?? 'app',
    userId: ctx.userId,
    brandId: ctx.brandId,
    route: ctx.route,
    err: message,
    ...(err instanceof Error && err.stack ? { stack: err.stack.split('\n').slice(0, 8).join(' | ') } : {}),
    ...ctx.extra,
  });
  if (sentry) {
    try {
      sentry.captureException(err, {
        tags: { component: ctx.component, route: ctx.route },
        user: ctx.userId ? { id: ctx.userId } : undefined,
        extra: { brandId: ctx.brandId, ...ctx.extra },
      } as Record<string, unknown>);
    } catch { /* swallow — error tracker failure must not cascade */ }
  }
}

/** Drop a breadcrumb for richer post-mortem context on the next exception. */
export function breadcrumb(category: string, message: string, data?: Record<string, unknown>): void {
  if (!sentry) return;
  try {
    sentry.addBreadcrumb({ category, message, data, level: 'info' });
  } catch { /* swallow */ }
}

/** Bind the current request's user to the Sentry scope. Call from authMiddleware. */
export function setUser(user: { id?: string; email?: string } | null): void {
  if (!sentry) return;
  try { sentry.setUser(user); } catch { /* swallow */ }
}

// ── Process-wide safety net ─────────────────────────────────────────────────
//
// In Node, an unhandled promise rejection or uncaught exception silently
// crashes the process (or worse, leaves it in an inconsistent state). We
// intercept once, report, and re-throw / exit so the operator at least
// sees what killed the worker.

let signalsInstalled = false;
function installProcessSignals(): void {
  if (signalsInstalled) return;
  signalsInstalled = true;

  process.on('unhandledRejection', (reason) => {
    captureException(reason, { component: 'process', extra: { kind: 'unhandledRejection' } });
  });
  process.on('uncaughtException', (err) => {
    captureException(err, { component: 'process', extra: { kind: 'uncaughtException' } });
    // Best-practice: after an uncaught exception, the process is in an
    // unknown state. Let the orchestrator restart us.
    setTimeout(() => process.exit(1), 250).unref?.();
  });
}
installProcessSignals();
