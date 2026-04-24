import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

export const CSRF_COOKIE_NAME = 'csrfToken';
export const CSRF_HEADER_NAME = 'x-csrf-token';

// Write methods that require CSRF validation
const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Paths exempt from CSRF — no session exists yet, or the request originates from Google
const CSRF_EXEMPT = new Set([
  '/api/auth/login',
  '/api/auth/signup',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/google/callback',
]);

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function setCsrfCookie(res: Response, token: string): void {
  res.cookie(CSRF_COOKIE_NAME, token, {
    httpOnly: false, // Must be readable by JavaScript so the client can send it as a header
    secure: true,
    sameSite: 'strict',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days — matches refresh token lifetime
  });
}

export function csrfMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!WRITE_METHODS.has(req.method)) {
    next();
    return;
  }

  if (CSRF_EXEMPT.has(req.path)) {
    next();
    return;
  }

  const headerToken = req.headers[CSRF_HEADER_NAME] as string | undefined;
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME] as string | undefined;

  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    res.status(403).json({ message: 'CSRF validation failed' });
    return;
  }

  next();
}
