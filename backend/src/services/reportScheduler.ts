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
 *   schedule = "custom" + cron   → minimal cron parser (5 fields, supports *, number, */N)
 */

import repository from '../database/repository';
import { sendDeliveryProfile } from './deliveryProfileService';

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

  console.log(`[ReportScheduler] ${due.length} scheduled report(s) due`);

  for (const profile of due) {
    try {
      const senderUserId = profile.createdBy || await pickAdminUserId();
      if (!senderUserId) {
        console.warn(`[ReportScheduler] no sender user for profile ${profile.id} — skipping`);
        continue;
      }

      const result = await sendDeliveryProfile(profile.id, senderUserId);

      const next = computeNextRunAt({
        schedule: profile.schedule,
        scheduleCron: (profile as any).scheduleCron,
        scheduleHour: (profile as any).scheduleHour,
        scheduleDow: (profile as any).scheduleDow,
      }, new Date());

      await repository.updateDeliveryProfile(profile.id, {
        nextRunAt: next,
      });
      console.log(`[ReportScheduler] profile=${profile.id} sent=${result.sent} failed=${result.failed} next=${next?.toISOString()}`);
    } catch (err: any) {
      console.error(`[ReportScheduler] profile=${profile.id} failed:`, err.message);
      await repository.updateDeliveryProfile(profile.id, {
        lastRunAt: new Date(),
        lastRunStatus: 'failed',
        lastRunError: String(err.message).slice(0, 1000),
        // Roll forward anyway to avoid a stuck schedule
        nextRunAt: computeNextRunAt({
          schedule: profile.schedule,
          scheduleCron: (profile as any).scheduleCron,
          scheduleHour: (profile as any).scheduleHour,
          scheduleDow: (profile as any).scheduleDow,
        }, new Date()),
      });
    }
  }
}

async function pickAdminUserId(): Promise<string | null> {
  const admin = await repository.prisma.user.findFirst({
    where: { role: { in: ['boss', 'admin'] }, status: 'approved' },
  });
  return admin?.id ?? null;
}
