/**
 * Mailbox routes — manage the shared Outlook (or Gmail) mailbox used to
 * dispatch scheduled reports on behalf of the whole admin team.
 *
 * GET    /api/mailboxes                 — list configured mailboxes
 * POST   /api/mailboxes/outlook/smtp    — connect an Outlook mailbox via SMTP (app password)
 * POST   /api/mailboxes/outlook/oauth/start  — begin Microsoft OAuth consent flow (returns URL)
 * GET    /api/mailboxes/outlook/oauth/callback  — OAuth callback from Microsoft
 * PATCH  /api/mailboxes/:id             — update (set default, toggle shared, etc.)
 * DELETE /api/mailboxes/:id             — disconnect
 * POST   /api/mailboxes/:id/test        — send a test email to the connected mailbox itself
 */

import { Express, Request, Response } from 'express';
import { AuthRequest } from '../config/authMiddleware';
import repository from '../database/repository';
import { ValidationError, NotFoundError, ForbiddenError } from '../utils/errors';
import { ADMIN_EMAILS } from '../config/constants';
import { sendEmail } from '../services/mailerService';
import { rateLimit } from '../utils/rateLimit';

const testLimiter = rateLimit('mailbox-test', { capacity: 3, refillPerSec: 3 / 60 }); // 3 test sends / min / user

async function requireAdmin(req: Request): Promise<string> {
  const userId = (req as AuthRequest).userId;
  if (!userId) throw new ForbiddenError('Not authenticated');
  const user = await repository.findUserById(userId);
  if (!user) throw new ForbiddenError('Not authenticated');
  const email = (user.email || '').toLowerCase();
  const isAdminByRole = user.role === 'admin' || user.role === 'boss';
  const isAdminByEmail = !!email && ADMIN_EMAILS.map(e => e.toLowerCase()).includes(email);
  if (!isAdminByRole && !isAdminByEmail) throw new ForbiddenError('Admin access required');
  return userId;
}

const OUTLOOK_SCOPE = 'offline_access Mail.Send User.Read';

export function setupMailboxRoutes(app: Express) {
  // List all configured mailboxes (admin only — credentials redacted)
  app.get('/api/mailboxes', async (req: Request, res: Response) => {
    try {
      await requireAdmin(req);
      const list = await repository.listMailboxConfigs();
      const safe = list.map(m => ({
        id: m.id,
        provider: m.provider,
        emailAddress: m.emailAddress,
        displayName: m.displayName,
        isDefault: m.isDefault,
        isShared: m.isShared,
        status: m.status,
        lastError: m.lastError,
        hasSmtp: !!m.smtpHost,
        hasOAuth: !!m.refreshToken,
        createdAt: m.createdAt,
        updatedAt: m.updatedAt,
      }));
      res.json({ mailboxes: safe });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // Connect Outlook via SMTP / app password — simplest path, no consent flow.
  app.post('/api/mailboxes/outlook/smtp', async (req: Request, res: Response) => {
    try {
      const userId = await requireAdmin(req);
      const {
        emailAddress, smtpUser, smtpPassword, smtpHost, smtpPort, smtpSecure,
        displayName, isDefault, isShared,
      } = req.body || {};
      if (!emailAddress || !smtpPassword) {
        throw new ValidationError('emailAddress and smtpPassword are required');
      }
      const mb = await repository.upsertMailboxConfig({
        provider: 'outlook',
        emailAddress,
        displayName: displayName ?? emailAddress,
        isDefault: isDefault ?? true,
        isShared: isShared ?? true,
        smtpHost: smtpHost || 'smtp.office365.com',
        smtpPort: smtpPort ?? 587,
        smtpUser: smtpUser || emailAddress,
        smtpPassword,
        smtpSecure: smtpSecure ?? false,
        createdById: userId,
        status: 'connected',
      });
      res.status(201).json({ mailbox: { id: mb.id, provider: mb.provider, emailAddress: mb.emailAddress } });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // Outlook OAuth — start
  app.post('/api/mailboxes/outlook/oauth/start', async (req: Request, res: Response) => {
    try {
      await requireAdmin(req);
      const clientId = process.env.OUTLOOK_CLIENT_ID;
      if (!clientId) throw new ValidationError('OUTLOOK_CLIENT_ID is not configured on the server');
      const tenant = process.env.OUTLOOK_TENANT_ID || 'common';
      const redirect = process.env.OUTLOOK_REDIRECT_URI
        || `${req.protocol}://${req.get('host')}/api/mailboxes/outlook/oauth/callback`;
      const params = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        redirect_uri: redirect,
        response_mode: 'query',
        scope: OUTLOOK_SCOPE,
        prompt: 'select_account',
      });
      const url = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}`;
      res.json({ url });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // Outlook OAuth — callback (exchange code for tokens, then upsert mailbox)
  app.get('/api/mailboxes/outlook/oauth/callback', async (req: Request, res: Response) => {
    try {
      const { code, error, error_description } = req.query as Record<string, string>;
      if (error) {
        res.status(400).send(`<html><body><h2>Outlook connection failed</h2><p>${error}: ${error_description || ''}</p></body></html>`);
        return;
      }
      if (!code) throw new ValidationError('Missing OAuth code');

      const clientId = process.env.OUTLOOK_CLIENT_ID;
      const clientSecret = process.env.OUTLOOK_CLIENT_SECRET;
      if (!clientId) throw new ValidationError('OUTLOOK_CLIENT_ID is not configured');
      const tenant = process.env.OUTLOOK_TENANT_ID || 'common';
      const redirect = process.env.OUTLOOK_REDIRECT_URI
        || `${req.protocol}://${req.get('host')}/api/mailboxes/outlook/oauth/callback`;

      const body = new URLSearchParams({
        client_id: clientId,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirect,
        scope: OUTLOOK_SCOPE,
      });
      if (clientSecret) body.append('client_secret', clientSecret);

      const tokenRes = await fetch(
        `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
        { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: body.toString() },
      );
      if (!tokenRes.ok) {
        const t = await tokenRes.text();
        throw new Error(`Token exchange failed: ${tokenRes.status} ${t}`);
      }
      const tok: any = await tokenRes.json();

      // Look up the user's email from Graph /me
      const meRes = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${tok.access_token}` },
      });
      const me: any = meRes.ok ? await meRes.json() : {};
      const emailAddress = me.mail || me.userPrincipalName || 'unknown@outlook.com';

      const mb = await repository.upsertMailboxConfig({
        provider: 'outlook',
        emailAddress,
        displayName: me.displayName || emailAddress,
        isDefault: true,
        isShared: true,
        accessToken: tok.access_token,
        refreshToken: tok.refresh_token,
        expiresAt: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000),
        tenantId: tenant,
        scopes: OUTLOOK_SCOPE,
        status: 'connected',
      });

      res.send(`<html><body style="font-family:sans-serif;padding:40px;text-align:center">
        <h2 style="color:#10b981">Outlook mailbox connected</h2>
        <p><strong>${mb.emailAddress}</strong> is now the default sender for scheduled reports.</p>
        <p><a href="/settings">Back to settings</a></p>
        <script>setTimeout(()=>{window.close();},2000)</script>
      </body></html>`);
    } catch (err: any) {
      res.status(err.status || 500).send(`<html><body><h2>Outlook connection failed</h2><pre>${err.message}</pre></body></html>`);
    }
  });

  // Patch mailbox (e.g. set default)
  app.patch('/api/mailboxes/:id', async (req: Request, res: Response) => {
    try {
      await requireAdmin(req);
      const existing = await repository.findMailboxById(req.params.id);
      if (!existing) throw new NotFoundError('Mailbox not found');
      const allowed: any = {};
      for (const k of ['displayName', 'isDefault', 'isShared', 'smtpHost', 'smtpPort', 'smtpSecure']) {
        if (req.body[k] !== undefined) allowed[k] = req.body[k];
      }
      if (req.body.smtpPassword) allowed.smtpPassword = req.body.smtpPassword;
      const updated = await repository.updateMailboxConfig(req.params.id, allowed);
      res.json({ mailbox: { id: updated.id } });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // Delete / disconnect
  app.delete('/api/mailboxes/:id', async (req: Request, res: Response) => {
    try {
      await requireAdmin(req);
      const existing = await repository.findMailboxById(req.params.id);
      if (!existing) throw new NotFoundError('Mailbox not found');
      await repository.deleteMailboxConfig(req.params.id);
      res.json({ message: 'Mailbox disconnected' });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });

  // Test send — mails the connected address from itself
  app.post('/api/mailboxes/:id/test', testLimiter, async (req: Request, res: Response) => {
    try {
      const userId = await requireAdmin(req);
      const mb = await repository.findMailboxById(req.params.id);
      if (!mb) throw new NotFoundError('Mailbox not found');
      const html = `<p>This is a test email from BRDG Alpha.</p>
        <p>Mailbox: <strong>${mb.emailAddress}</strong> (${mb.provider})</p>
        <p>Sent at: ${new Date().toISOString()}</p>`;
      const result = await sendEmail({
        to: mb.emailAddress,
        subject: 'BRDG Alpha — mailbox test',
        html,
        senderUserId: userId,
        provider: mb.provider as any,
      });
      res.json({ message: `Test sent via ${result.provider}` });
    } catch (err: any) {
      res.status(err.status || 500).json({ message: err.message });
    }
  });
}
