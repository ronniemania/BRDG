import repository from '../database/repository';
import { refreshGoogleAccessToken, OAuthRevokedError } from './googleOAuthService';

const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

// Refresh the token this many ms before it actually expires (buffer for clock skew + latency)
const EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Ensures the stored Google OAuth token for `userId` is fresh.
 * Refreshes automatically if it is expired or within the buffer window.
 * Throws `OAuthRevokedError` if Google rejects the refresh token.
 * Throws `GmailNotConnectedError` if no OAuth token is stored.
 *
 * Returns the valid access token.
 */
async function getValidGoogleToken(userId: string): Promise<string> {
  const stored = await repository.findOAuthToken(userId, 'google');

  if (!stored) {
    throw new GmailNotConnectedError('No Gmail connection found. Please connect your Google account.');
  }

  const isExpired = new Date(stored.expiresAt).getTime() - EXPIRY_BUFFER_MS < Date.now();

  if (!isExpired) {
    return stored.accessToken;
  }

  // Token is expired — refresh it
  try {
    const refreshed = await refreshGoogleAccessToken(stored.refreshToken);

    // Persist the new access token and updated expiry
    await repository.saveOAuthToken({
      userId,
      provider: 'google',
      accessToken: refreshed.accessToken,
      refreshToken: stored.refreshToken, // Refresh token doesn't change on refresh
      expiresAt: refreshed.expiresAt,
      scopes: stored.scopes,
    });

    return refreshed.accessToken;
  } catch (err) {
    if (err instanceof OAuthRevokedError) {
      // Token was revoked — remove it from DB so we stop trying
      await repository.deleteOAuthToken(userId, 'google');
      throw err; // Re-throw for the caller to handle graceful degradation
    }
    throw err;
  }
}

/**
 * Sends an email on behalf of `userId` using their connected Gmail account.
 *
 * @param userId  - Dashboard user ID (used to look up stored OAuth tokens)
 * @param to      - Recipient email address
 * @param subject - Email subject
 * @param html    - HTML body of the email
 */
export async function sendEmailViaGmail(
  userId: string,
  to: string,
  subject: string,
  html: string,
): Promise<void> {
  const accessToken = await getValidGoogleToken(userId);

  // Build RFC 2822 message
  const rawMessage = buildRfc2822Message({ to, subject, html });

  const res = await fetch(GMAIL_SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: rawMessage }),
  });

  if (!res.ok) {
    const data = await res.json() as any;
    const status = res.status;

    // 401/403 from the Gmail API means the token was revoked after we fetched it,
    // or the required scope is missing — treat both as revocation
    if (status === 401 || status === 403) {
      await repository.deleteOAuthToken(userId, 'google');
      throw new OAuthRevokedError('Gmail access was revoked or insufficient scope');
    }

    throw new Error(data?.error?.message || `Gmail API error: ${status}`);
  }
}

/**
 * Returns whether `userId` has a valid, non-revoked Gmail connection.
 */
export async function hasGmailConnection(userId: string): Promise<boolean> {
  const token = await repository.findOAuthToken(userId, 'google');
  return token !== null;
}

/**
 * Encodes a plain string to base64url (required by Gmail API).
 */
function toBase64Url(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Builds a minimal RFC 2822 email message and base64url-encodes it.
 */
function buildRfc2822Message(opts: {
  to: string;
  subject: string;
  html: string;
}): string {
  const lines = [
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    '',
    opts.html,
  ];
  return toBase64Url(lines.join('\r\n'));
}

/**
 * Thrown when a user has not connected their Google account (no stored OAuth token).
 */
export class GmailNotConnectedError extends Error {
  readonly code = 'GMAIL_NOT_CONNECTED';
  constructor(message: string) {
    super(message);
    this.name = 'GmailNotConnectedError';
  }
}

export { OAuthRevokedError };
