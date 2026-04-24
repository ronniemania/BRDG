/**
 * Outlook / Microsoft Graph mail sender.
 *
 * Supports two auth paths:
 *   (1) OAuth2 via Microsoft identity platform + Graph /me/sendMail  (preferred)
 *   (2) SMTP fallback via smtp.office365.com:587 (STARTTLS, basic auth / app password)
 *
 * Credentials live in the MailboxConfig table so all admins share a single mailbox.
 */

import repository from '../database/repository';
// nodemailer is optional — only required for the SMTP fallback path.
// We load it lazily so the service compiles and runs without it.

const GRAPH_TOKEN_URL = (tenant: string) =>
  `https://login.microsoftonline.com/${tenant || 'common'}/oauth2/v2.0/token`;
const GRAPH_SENDMAIL_URL = 'https://graph.microsoft.com/v1.0/me/sendMail';

const EXPIRY_BUFFER_MS = 5 * 60 * 1000;

export class OutlookNotConnectedError extends Error {
  readonly code = 'OUTLOOK_NOT_CONNECTED';
  constructor(msg = 'No Outlook mailbox is connected. Ask an admin to link one in Settings.') {
    super(msg); this.name = 'OutlookNotConnectedError';
  }
}

export async function hasOutlookMailbox(): Promise<boolean> {
  const mb = await repository.getDefaultMailbox('outlook');
  return !!mb && mb.status === 'connected';
}

async function refreshOutlookToken(mailboxId: string): Promise<string> {
  const mb = await repository.findMailboxById(mailboxId);
  if (!mb) throw new OutlookNotConnectedError();

  // Still valid?
  if (mb.accessToken && mb.expiresAt && new Date(mb.expiresAt).getTime() - EXPIRY_BUFFER_MS > Date.now()) {
    return mb.accessToken;
  }

  if (!mb.refreshToken) throw new OutlookNotConnectedError('Outlook mailbox missing refresh token — reconnect required');

  const clientId = process.env.OUTLOOK_CLIENT_ID;
  const clientSecret = process.env.OUTLOOK_CLIENT_SECRET;
  if (!clientId) throw new Error('OUTLOOK_CLIENT_ID env var is not set');

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: mb.refreshToken,
    scope: mb.scopes || 'offline_access Mail.Send User.Read',
  });
  if (clientSecret) body.append('client_secret', clientSecret);

  const res = await fetch(GRAPH_TOKEN_URL(mb.tenantId || 'common'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    await repository.updateMailboxConfig(mb.id, { status: 'error', lastError: text.slice(0, 500) });
    throw new Error(`Outlook token refresh failed: ${res.status} ${text}`);
  }
  const tok: any = await res.json();
  const accessToken: string = tok.access_token;
  const refreshToken: string = tok.refresh_token ?? mb.refreshToken;
  const expiresAt = new Date(Date.now() + (tok.expires_in ?? 3600) * 1000);

  await repository.updateMailboxConfig(mb.id, {
    accessToken, refreshToken, expiresAt, status: 'connected', lastError: null,
  });
  return accessToken;
}

async function sendViaGraph(mb: any, to: string, subject: string, html: string): Promise<void> {
  const accessToken = await refreshOutlookToken(mb.id);
  const payload = {
    message: {
      subject,
      body: { contentType: 'HTML', content: html },
      toRecipients: [{ emailAddress: { address: to } }],
    },
    saveToSentItems: true,
  };
  const res = await fetch(GRAPH_SENDMAIL_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (res.status === 202 || res.status === 200) return;
  const text = await res.text();
  if (res.status === 401 || res.status === 403) {
    await repository.updateMailboxConfig(mb.id, { status: 'revoked', lastError: text.slice(0, 500) });
  }
  throw new Error(`Outlook /sendMail failed: ${res.status} ${text}`);
}

async function sendViaSmtp(mb: any, to: string, subject: string, html: string): Promise<void> {
  if (!mb.smtpHost || !mb.smtpUser || !mb.smtpPassword) {
    throw new Error('Outlook SMTP mailbox missing host/user/password');
  }
  let nodemailer: any;
  try {
    // @ts-ignore — optional runtime dep; may not be installed in all envs
    nodemailer = await import('nodemailer');
  } catch {
    throw new Error('SMTP send requires the "nodemailer" package — run `npm i nodemailer` on the VPS, or use OAuth (Graph) instead');
  }
  const createTransport = nodemailer.createTransport || nodemailer.default?.createTransport;
  const transporter = createTransport({
    host: mb.smtpHost,
    port: mb.smtpPort ?? 587,
    secure: mb.smtpSecure === false ? false : mb.smtpPort === 465,
    requireTLS: mb.smtpPort !== 465,
    auth: { user: mb.smtpUser, pass: mb.smtpPassword },
  });
  await transporter.sendMail({
    from: mb.emailAddress,
    to,
    subject,
    html,
  });
}

export async function sendEmailViaOutlook(to: string, subject: string, html: string): Promise<void> {
  const mb = await repository.getDefaultMailbox('outlook');
  if (!mb) throw new OutlookNotConnectedError();

  // SMTP path is preferred when explicit SMTP creds are present (lets you connect a mailbox with just an app password)
  if (mb.smtpHost && mb.smtpUser && mb.smtpPassword) {
    await sendViaSmtp(mb, to, subject, html);
    return;
  }

  if (mb.refreshToken || mb.accessToken) {
    await sendViaGraph(mb, to, subject, html);
    return;
  }

  throw new OutlookNotConnectedError('Outlook mailbox has no SMTP or OAuth credentials');
}
