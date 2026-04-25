// Application configuration constants
export const PORT = process.env.PORT || 3000;
export const ADMIN_EMAILS = ['ronnieburjorji@gmail.com', 'ronnie@brdggroup.com', 'ronniemania@gmail.com'];

// Database
export const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/db';

// API Configuration
export const API_TIMEOUT = 30000; // 30 seconds
export const MAX_RETRIES = 3;
export const RETRY_DELAY = 1000; // 1 second

// Auth — crash fast in production if secrets are not configured
function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name] || fallback;
  if (!value || value === 'your-secret-key' || value === 'your-refresh-secret-key') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    console.warn(`[WARN] ${name} is not set — using insecure default (dev only)`);
    return value || 'dev-insecure-default';
  }
  return value;
}

export const JWT_SECRET = requireEnv('JWT_SECRET', 'your-secret-key');
export const JWT_REFRESH_SECRET = requireEnv('JWT_REFRESH_SECRET', 'your-refresh-secret-key');

// Credentials encryption — must be a 64-character hex string (32 bytes).
// Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
export const ENCRYPTION_KEY = requireEnv('ENCRYPTION_KEY');
export const ACCESS_TOKEN_EXPIRY = '15m';
export const REFRESH_TOKEN_EXPIRY = '7d';
export const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

// Google OAuth
export const GOOGLE_CLIENT_ID = requireEnv('GOOGLE_CLIENT_ID');
export const GOOGLE_CLIENT_SECRET = requireEnv('GOOGLE_CLIENT_SECRET');
export const GOOGLE_REDIRECT_URI = requireEnv(
  'GOOGLE_REDIRECT_URI',
  'https://bottech.in/api/auth/google/callback',
);
export const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL
  || (process.env.NODE_ENV === 'production' ? 'https://bottech.in' : 'http://localhost:5173');
export const CORS_ORIGINS = (process.env.CORS_ORIGINS
  || `${FRONTEND_BASE_URL},http://localhost:5173`)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
// Scopes: profile + email for login, gmail.send for Phase 3 report emailing
export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.send',
];

// Email
export const GMAIL_CONFIG = {
  service: 'gmail',
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER || '',
    pass: process.env.GMAIL_PASS || '',
  },
};

// File Upload
export const UPLOAD_DIR = '/var/www/optisync/uploads';
export const SNAPSHOT_DIR = '/var/www/optisync/snapshots';
export const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Pagination
export const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 1000;

// Sync Configuration
export const AUTO_SYNC_INTERVAL = 6 * 60 * 60 * 1000; // 6 hours
export const SYNC_TIMEOUT = 120000; // 2 minutes

// ETL pipeline — when true, all connectors route through backend/src/etl/.
// Set ETL_DEFAULT=false in env for an emergency fallback to the legacy
// in-line ingestion paths in services/shopifyService.ts, routes/freshdesk.ts,
// services/metaAdsService.ts, services/googleAdsService.ts.
export const ETL_DEFAULT = (process.env.ETL_DEFAULT ?? 'true').toLowerCase() !== 'false';

// Google Drive folder ingestion
// Set this to the local path where the Google Drive folder is mounted on the VPS
// e.g. /mnt/gdrive/optisync  (via rclone mount or similar)
// Data sources of type 'google_drive_folder' can override this with config.folderPath
export const DEFAULT_GDRIVE_FOLDER = process.env.GDRIVE_FOLDER_PATH || '';

// Error Codes
export const ERROR_CODES = {
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  NOT_FOUND: 'NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  API_ERROR: 'API_ERROR',
} as const;
