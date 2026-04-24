import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;  // 16 bytes → 32 hex chars
const TAG_LENGTH = 16; // 16 bytes → 32 hex chars

/**
 * Encrypts a plaintext string with AES-256-GCM.
 * Output format: <iv_hex>:<auth_tag_hex>:<ciphertext_hex>
 * The ENCRYPTION_KEY env var must be a 64-character hex string (32 bytes).
 */
export function encrypt(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes)');
  }
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts an AES-256-GCM ciphertext produced by encrypt().
 * Throws if the ciphertext is tampered or the key is wrong.
 */
export function decrypt(ciphertext: string, keyHex: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) throw new Error('Invalid ciphertext format');
  const [ivHex, tagHex, encHex] = parts;
  const key = Buffer.from(keyHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
}

/**
 * Returns true if the string looks like an encrypted value (iv:tag:ciphertext).
 * Used to handle plaintext legacy values gracefully during migration.
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':');
  return (
    parts.length === 3 &&
    parts[0].length === IV_LENGTH * 2 &&
    parts[1].length === TAG_LENGTH * 2 &&
    /^[0-9a-f]+$/.test(parts[2])
  );
}

/**
 * Encrypts a value if it is not already encrypted.
 * Safe to call multiple times on the same value.
 */
export function encryptIfNeeded(value: string, keyHex: string): string {
  return isEncrypted(value) ? value : encrypt(value, keyHex);
}

/**
 * Decrypts a value if it is encrypted; returns plaintext as-is (legacy migration).
 */
export function decryptIfNeeded(value: string, keyHex: string): string {
  if (!isEncrypted(value)) return value; // legacy plaintext — returned as-is
  return decrypt(value, keyHex);
}
