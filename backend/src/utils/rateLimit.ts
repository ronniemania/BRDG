/**
 * In-memory token-bucket rate limiter.
 *
 * Good enough for a single-node deployment. If/when you scale horizontally,
 * replace the Map with a Redis-backed store — the public signature is stable.
 */

import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../config/authMiddleware';

interface Bucket { tokens: number; updatedAt: number }

const buckets = new Map<string, Bucket>();

export interface RateLimitOpts {
  /** Bucket size (burst). */
  capacity: number;
  /** Tokens refilled per second. */
  refillPerSec: number;
  /** Cache key resolver. Defaults to `${route}:${userId || ip}`. */
  keyFn?: (req: Request) => string;
}

export function rateLimit(route: string, opts: RateLimitOpts) {
  const { capacity, refillPerSec } = opts;
  return (req: Request, res: Response, next: NextFunction) => {
    const userId = (req as AuthRequest).userId;
    const id = opts.keyFn ? opts.keyFn(req) : `${route}:${userId || req.ip}`;
    const now = Date.now();
    const b = buckets.get(id) ?? { tokens: capacity, updatedAt: now };
    const elapsed = (now - b.updatedAt) / 1000;
    b.tokens = Math.min(capacity, b.tokens + elapsed * refillPerSec);
    b.updatedAt = now;
    if (b.tokens < 1) {
      res.setHeader('Retry-After', String(Math.ceil((1 - b.tokens) / refillPerSec)));
      res.status(429).json({ message: 'Too many requests — please wait a moment and try again.' });
      return;
    }
    b.tokens -= 1;
    buckets.set(id, b);
    next();
  };
}

// Periodic GC so the map doesn't grow unbounded in long-running processes.
// A bucket is safe to drop once it has been idle for 10+ minutes — any later
// request simply starts a fresh full bucket.
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, v] of buckets) if (v.updatedAt < cutoff) buckets.delete(k);
}, 5 * 60 * 1000).unref?.();
