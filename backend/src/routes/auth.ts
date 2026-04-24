import crypto from 'crypto';
import { Express, Request, Response } from 'express';
import authService from '../services/authService';
import repository from '../database/repository';
import { ValidationError } from '../utils/errors';
import { REFRESH_COOKIE_MAX_AGE, ADMIN_EMAILS, FRONTEND_BASE_URL } from '../config/constants';
import { generateCsrfToken, setCsrfCookie } from '../config/csrf';
import {
  getAuthUrl,
  exchangeCode,
  getGoogleUserInfo,
} from '../services/googleOAuthService';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax' as const,
  path: '/api/auth',
  maxAge: REFRESH_COOKIE_MAX_AGE,
};

export function setupAuthRoutes(app: Express) {
  app.post('/api/auth/register', async (req: Request, res: Response) => {
    try {
      const { email, password, firstName, lastName } = req.body;
      if (!email || !password || !firstName || !lastName) {
        throw new ValidationError('Missing required fields');
      }
      const user = await authService.register(email, password, firstName, lastName);
      res.status(201).json({ message: 'User registered', user });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/auth/signup', async (req: Request, res: Response) => {
    try {
      const { email, password, firstName, lastName } = req.body;
      if (!email || !password || !firstName || !lastName) {
        throw new ValidationError('Missing required fields');
      }
      const user = await authService.register(email, password, firstName, lastName);
      res.status(201).json({ message: 'Account created', user, pending: true });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        throw new ValidationError('Email and password required');
      }
      const result = await authService.login(email, password);

      // Set refresh token as HttpOnly cookie
      res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);

      // Set CSRF token as a readable (non-HttpOnly) cookie
      setCsrfCookie(res, generateCsrfToken());

      // Return access token + user in body (no refresh token in body)
      res.json({
        user: result.user,
        accessToken: result.accessToken,
      });
    } catch (error: any) {
      res.status(401).json({ message: error.message });
    }
  });

  app.post('/api/auth/refresh', async (req: Request, res: Response) => {
    try {
      const refreshToken = req.cookies?.refreshToken;
      if (!refreshToken) {
        return res.status(401).json({ message: 'No refresh token' });
      }

      const result = await authService.refresh(refreshToken);

      // Rotate refresh cookie
      res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);

      // Rotate CSRF token alongside refresh token
      setCsrfCookie(res, generateCsrfToken());

      res.json({
        accessToken: result.accessToken,
        user: result.user,
      });
    } catch (error: any) {
      // Clear invalid cookie
      res.clearCookie('refreshToken', { path: '/api/auth' });
      res.status(401).json({ message: 'Session expired' });
    }
  });

  app.post('/api/auth/logout', async (req: Request, res: Response) => {
    try {
      // Extract user from access token if available
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const decoded = authService.verifyToken(token);
        if (decoded) {
          await authService.logout(decoded.userId);
        }
      }
    } catch {
      // Best-effort logout
    }

    // Always clear the cookie
    res.clearCookie('refreshToken', { path: '/api/auth' });
    res.json({ message: 'Logged out' });
  });

  app.post('/api/auth/change-password', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Missing authorization' });
      }
      const token = authHeader.substring(7);
      const decoded = authService.verifyToken(token);
      if (!decoded) return res.status(401).json({ message: 'Invalid token' });

      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: 'Current and new passwords are required' });
      }
      if (newPassword.length < 8) {
        return res.status(400).json({ message: 'New password must be at least 8 characters' });
      }
      await authService.changePassword(decoded.userId, currentPassword, newPassword);
      res.json({ message: 'Password changed successfully' });
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  });

  app.get('/api/auth/me', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'Missing authorization' });
      }
      const token = authHeader.substring(7);
      const decoded = authService.verifyToken(token);
      if (!decoded) return res.status(401).json({ message: 'Invalid token' });

      const user = await authService.getCurrentUser(decoded.userId);
      res.json({ user });
    } catch (error: any) {
      res.status(401).json({ message: error.message });
    }
  });

  // ─── Google OAuth ──────────────────────────────────────────────────────────

  // Step 1: Redirect the browser to Google's consent screen
  app.get('/api/auth/google', (req: Request, res: Response) => {
    const state = crypto.randomBytes(16).toString('hex');

    // Store state in a short-lived HttpOnly cookie so we can verify it on callback
    res.cookie('oauthState', state, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000, // 10 minutes
      path: '/api/auth/google',
    });

    res.redirect(getAuthUrl(state));
  });

  // Step 2: Google redirects back here with code + state
  app.get('/api/auth/google/callback', async (req: Request, res: Response) => {
    const frontendBase = FRONTEND_BASE_URL;

    try {
      const { code, state, error } = req.query as Record<string, string>;

      // User denied access
      if (error) {
        return res.redirect(`${frontendBase}/login?error=google_denied`);
      }

      if (!code || !state) {
        return res.redirect(`${frontendBase}/login?error=google_invalid`);
      }

      // Validate state to prevent CSRF on the OAuth flow itself
      const storedState = req.cookies?.oauthState;
      res.clearCookie('oauthState', { path: '/api/auth/google' });
      if (!storedState || storedState !== state) {
        return res.redirect(`${frontendBase}/login?error=google_state_mismatch`);
      }

      // Exchange auth code for Google tokens
      const googleTokens = await exchangeCode(code);

      // Get user's Google profile
      const googleUser = await getGoogleUserInfo(googleTokens.accessToken);

      // Find existing user by email or create a new one
      let user = await repository.findUserByEmail(googleUser.email);
      if (!user) {
        user = await repository.createUser({
          id: 'user-' + Date.now(),
          email: googleUser.email,
          password: '',                     // No password for OAuth-only users
          firstName: googleUser.firstName,
          lastName: googleUser.lastName,
          role: 'member',
          status: ADMIN_EMAILS.includes(googleUser.email) ? 'approved' : 'pending',
        });
      }

      // Store Google OAuth tokens encrypted in DB (upsert — links on re-login)
      await repository.saveOAuthToken({
        userId: user.id,
        provider: 'google',
        accessToken: googleTokens.accessToken,
        refreshToken: googleTokens.refreshToken ?? '',
        expiresAt: googleTokens.expiresAt,
        scopes: googleTokens.scopes,
      });

      // Auto-promote admin emails to boss role
      if (ADMIN_EMAILS.includes(user.email) && user.role !== 'boss') {
        await repository.updateUser(user.id, { role: 'boss' });
        user = { ...user, role: 'boss' };
      }

      // Issue dashboard JWT tokens
      const accessToken = authService.generateAccessToken(user.id, user.role);
      const refreshToken = authService.generateRefreshToken(user.id);
      await repository.updateUser(user.id, {
        lastLogin: new Date(),
        refreshTokenHash: authService.hashToken(refreshToken),
      });

      // Set HttpOnly refresh cookie
      res.cookie('refreshToken', refreshToken, COOKIE_OPTIONS);

      // Set readable CSRF cookie
      setCsrfCookie(res, generateCsrfToken());

      // Pass access token to frontend via a short-lived readable cookie
      // The OAuthCallback page reads it once, stores in memory, then clears it
      res.cookie('oauthAccessToken', accessToken, {
        httpOnly: false,
        secure: true,
        sameSite: 'lax',
        maxAge: 60 * 1000, // 1 minute — frontend must consume this immediately
        path: '/',
      });

      res.redirect(`${frontendBase}/auth/callback`);
    } catch (err: any) {
      console.error('[Google OAuth callback error]', err);
      res.redirect(`${frontendBase}/login?error=google_failed`);
    }
  });
}
