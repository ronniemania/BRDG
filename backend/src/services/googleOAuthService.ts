import {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  GOOGLE_SCOPES,
} from '../config/constants';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
  scopes: string;
}

export interface GoogleUserInfo {
  googleId: string;
  email: string;
  firstName: string;
  lastName: string;
  picture: string;
}

/**
 * Builds the Google OAuth2 authorization URL.
 * The caller should generate a random `state` and store it in a short-lived cookie
 * to protect against CSRF on the OAuth flow itself.
 */
export function getAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',   // Request refresh token
    prompt: 'consent',        // Always show consent to ensure refresh token is issued
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/**
 * Exchanges an authorization code for access + refresh tokens.
 */
export async function exchangeCode(code: string): Promise<GoogleTokens> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: GOOGLE_REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  const data = await res.json() as any;
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Google token exchange failed');
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? null,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
    scopes: data.scope ?? GOOGLE_SCOPES.join(' '),
  };
}

/**
 * Uses a refresh token to obtain a new access token from Google.
 * Throws an `OAuthRevokedError` if the refresh token has been revoked.
 */
export async function refreshGoogleAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });

  const data = await res.json() as any;

  if (!res.ok) {
    if (data.error === 'invalid_grant') {
      throw new OAuthRevokedError('Google OAuth access has been revoked');
    }
    throw new Error(data.error_description || data.error || 'Google token refresh failed');
  }

  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000),
  };
}

/**
 * Fetches the Google user's profile using a valid access token.
 */
export async function getGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error('Failed to fetch Google user info');
  }

  const data = await res.json() as any;
  const nameParts = (data.name ?? '').split(' ');
  return {
    googleId: data.id,
    email: data.email,
    firstName: nameParts[0] ?? '',
    lastName: nameParts.slice(1).join(' ') || '',
    picture: data.picture ?? '',
  };
}

/**
 * Thrown when a Google OAuth token has been revoked by the user.
 * Callers should delete the stored token and gracefully disable Gmail features.
 */
export class OAuthRevokedError extends Error {
  readonly code = 'OAUTH_REVOKED';
  constructor(message: string) {
    super(message);
    this.name = 'OAuthRevokedError';
  }
}
