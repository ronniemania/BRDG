/**
 * Minimal structured logger. JSON in production, pretty in dev.
 * Intentionally zero-dep to avoid pulling pino until the team is ready.
 * Swap to pino later without touching call sites.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN_LEVEL: number = LEVELS[(process.env.LOG_LEVEL as Level) || 'info'] ?? LEVELS.info;
const JSON_OUTPUT = process.env.NODE_ENV === 'production';

function emit(level: Level, msg: string, ctx?: Record<string, unknown>) {
  if (LEVELS[level] < MIN_LEVEL) return;
  const record = { t: new Date().toISOString(), level, msg, ...(ctx || {}) };
  if (JSON_OUTPUT) {
    // eslint-disable-next-line no-console
    (level === 'error' ? console.error : console.log)(JSON.stringify(record));
  } else {
    const tag = `[${level.toUpperCase()}]`;
    // eslint-disable-next-line no-console
    (level === 'error' ? console.error : console.log)(tag, msg, ctx ?? '');
  }
}

export const log = {
  debug: (m: string, ctx?: Record<string, unknown>) => emit('debug', m, ctx),
  info:  (m: string, ctx?: Record<string, unknown>) => emit('info',  m, ctx),
  warn:  (m: string, ctx?: Record<string, unknown>) => emit('warn',  m, ctx),
  error: (m: string, ctx?: Record<string, unknown>) => emit('error', m, ctx),
  /** Scope a child logger to a subsystem (e.g. component name). */
  scope: (component: string) => ({
    debug: (m: string, ctx?: Record<string, unknown>) => emit('debug', m, { component, ...ctx }),
    info:  (m: string, ctx?: Record<string, unknown>) => emit('info',  m, { component, ...ctx }),
    warn:  (m: string, ctx?: Record<string, unknown>) => emit('warn',  m, { component, ...ctx }),
    error: (m: string, ctx?: Record<string, unknown>) => emit('error', m, { component, ...ctx }),
  }),
};

/**
 * Backward-compat alias for older server-side files that import { logger }.
 * New code should use `log` directly.
 */
export const logger = log;

/** Backward-compat child logger factory. */
export function childLogger(bindings: Record<string, unknown>) {
  const component = String(bindings.component ?? bindings.module ?? 'unknown');
  return log.scope(component);
}
