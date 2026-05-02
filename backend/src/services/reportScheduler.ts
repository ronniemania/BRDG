/**
 * Scheduled-report scheduler.
 *
 * - `computeNextRunAt(cfg)` — figure out the next fire time for a profile.
 * - `processDueScheduledReports()` — invoked by the main scheduler loop; finds
 *   profiles whose `nextRunAt <= now`, sends them, and rolls forward.
 *
 * Supports:
 *   schedule = "daily"           → every day at scheduleHour:00
 *   schedule = "weekly"          → every scheduleDow at scheduleHour:00
 *   schedule = "custom" + cron   → minimal cron parser (5 fields, supports *, number, step/N)
 */

import repository from '../database/repository';
import { sendDeliveryProfile } from './deliveryProfileService';
import { log } from '../utils/logger';

const SEND_TIMEOUT_MS = 30_000;
const DEAD_LETTER_AFTER = 3;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

export interface ScheduleConfig {
  schedule: string;
  scheduleCron?: string | null;
  scheduleHour?: number;
  scheduleDow?: number;
}

// ── Minimal cron parser (5 fields: min hour dom mon dow) ─────────────────────

type CronField = (n: number) => boolean;

function parseCronField(field: string, min: number, max: number): CronField {
  if (field === '*' || field === '?') return () => true;
  if (field.startsWith('*/')) {
    const step = parseInt(field.slice(2), 10);
    if (!step || step <= 0) return () => false;
    return (n) => (n - min) % step === 0;
  }
  if (field.includes(',')) {
    const values = field.split(',').map(v => parseInt(v, 10)).filter(n => !isNaN(n));
    return (n) => values.includes(n);
  }
  if (field.includes('-')) {
    const [a, b] = field.split('-').map(v => parseInt(v, 10));
    return (n) => n >= a && n <= b;
  }
  const v = parseInt(field, 10);
  if (isNaN(v) || v < min || v > max) return () => false;
  return (n) => n === v;
}

function matchCron(expr: string, d: Date): boolean {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return false;
  const [mi, hr, dom, mo, dow] = parts;
  return parseCronField(mi, 0, 59)(d.getMinutes())
    && parseCronField(hr, 0, 23)(d.getHours())
    && parseCronField(dom, 1, 31)(d.getDate())
    && parseCronField(mo, 1, 12)(d.getMonth() + 1)
    && parseCronField(dow, 0, 6)(d.getDay());
}

function nextCronMatch(expr: string, after: Date): Date | null {
  // Brute-force minute step up to 366 days (safe cap)
  const d = new Date(after.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  for (let i = 0; i < 366 * 24 * 60; i++) {
    if (matchCron(expr, d)) return new Date(d);
    d.setMinutes(d.getMinutes() + 1);
  }
  return null;
}

// ── Public: compute next fire time ───────────────────────────────────────────

export function computeNextRunAt(cfg: ScheduleConfig, after = new Date()): Date | null {
  const hour = Math.max(0, Math.min(23, cfg.scheduleHour ?? 7));
  const dow = Math.max(0, Math.min(6, cfg.scheduleDow ?? 1));

  if (cfg.schedule === 'daily') {
    const d = new Date(after);
    d.setSeconds(0, 0); d.setMinutes(0); d.setHours(hour);
    if (d.getTime() <= after.getTime()) d.setDate(d.getDate() + 1);
    return d;
  }
  if (cfg.schedule === 'weekly') {
    const d = new Date(after);
    d.setSeconds(0, 0); d.setMinutes(0); d.setHours(hour);
    const diff = (dow - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + diff);
    if (d.getTime() <= after.getTime()) d.setDate(d.getDate() + 7);
    return d;
  }
  if (cfg.schedule === 'custom' && cfg.scheduleCron) {
    return nextCronMatch(cfg.scheduleCron, after);
  }
  return null;
}

// ── Scheduler tick: find due profiles, dispatch, roll forward ────────────────

export async function processDueScheduledReports(): Promise<void> {
  const now = new Date();
  const due = await repository.findScheduledDueProfiles(now);
  if (!due.length) return;

  log.info('scheduled reports due', { component: 'reportScheduler', count: due.length });

  for (const profile of due) {
    if ((profile as any).paused) continue;
    try {
      const senderUserId = profile.createdBy || await pickAdminUserId();
      if (!senderUserId) {
        log.warn('no sender user for profile — skipping', { component: 'reportScheduler', profileId: profile.id });
        continue;
      }

      const result = await withTimeout(
        sendDeliveryProfile(profile.id, senderUserId),
        SEND_TIMEOUT_MS,
        `send profile=${profile.id}`,
      );

      // Total-failure (zero sent) counts against the streak just like a thrown error,
      // so a profile with only bad recipients eventually dead-letters.
      if (result.sent === 0 && result.failed > 0) {
        throw new Error(`all ${result.failed} recipient(s) failed: ${result.errors.slice(0, 3).join(' | ')}`);
      }

      const next = computeNextRunAt({
        schedule: profile.schedule,
        scheduleCron: (profile as any).scheduleCron,
        scheduleHour: (profile as any).scheduleHour,
        scheduleDow: (profile as any).scheduleDow,
      }, new Date());

      // Reset failure streak on any successful (or partial-success) dispatch.
      await repository.updateDeliveryProfile(profile.id, {
        nextRunAt: next,
        consecutiveFailures: 0,
      } as any);
      log.info('scheduled profile sent', {
        component: 'reportScheduler',
        profileId: profile.id,
        sent: result.sent,
        failed: result.failed,
        next: next?.toISOString(),
      });
    } catch (err: any) {
      const streak = ((profile as any).consecutiveFailures ?? 0) + 1;
      const shouldDeadLetter = streak >= DEAD_LETTER_AFTER;
      log.error('scheduled profile failed', {
        component: 'reportScheduler',
        profileId: profile.id,
        streak,
        deadLettered: shouldDeadLetter,
        err: err?.message,
      });
      await repository.updateDeliveryProfile(profile.id, {
        lastRunAt: new Date(),
        lastRunStatus: 'failed',
        lastRunError: String(err.message).slice(0, 1000),
        consecutiveFailures: streak,
        paused: shouldDeadLetter,
        // Roll forward anyway unless dead-lettered
        nextRunAt: shouldDeadLetter ? null : computeNextRunAt({
          schedule: profile.schedule,
          scheduleCron: (profile as any).scheduleCron,
          scheduleHour: (profile as any).scheduleHour,
          scheduleDow: (profile as any).scheduleDow,
        }, new Date()),
      } as any);
    }
  }
}

async function pickAdminUserId(): Promise<string | null> {
  const admin = await repository.prisma.user.findFirst({
    where: { role: { in: ['boss', 'admin'] }, status: 'approved' },
  });
  return admin?.id ?? null;
}
