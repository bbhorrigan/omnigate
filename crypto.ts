import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

function getEncryptionKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey) {
    const buf = Buffer.from(envKey, 'hex');
    if (buf.length !== 32) {
      throw new Error(
        `ENCRYPTION_KEY must be a 32-byte hex string (64 hex chars). Got ${buf.length} bytes.`
      );
    }
    return buf;
  }

  // Auto-generate and warn — useful for dev, never for prod
  console.warn(
    '[crypto] ENCRYPTION_KEY not set. Auto-generating a random key. ' +
      'This means encrypted data will NOT survive restarts. ' +
      'Set ENCRYPTION_KEY to a 64-char hex string in production.'
  );
  const generated = crypto.randomBytes(32);
  // Stash it so subsequent calls in the same process get the same key
  process.env.ENCRYPTION_KEY = generated.toString('hex');
  return generated;
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a string in the format `iv:authTag:ciphertext` (all base64-encoded).
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted,
  ].join(':');
}

/**
 * Decrypts a string produced by `encrypt`.
 * Expects `iv:authTag:ciphertext` (all base64-encoded).
 */
export function decrypt(encrypted: string): string {
  const key = getEncryptionKey();
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload: expected iv:authTag:ciphertext');
  }

  const [ivB64, authTagB64, ciphertextB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertextB64, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Encrypts a credentials object. Returns `{ encrypted: "iv:tag:ciphertext" }`.
 */
export function encryptCredentials(obj: Record<string, unknown>): { encrypted: string } {
  const json = JSON.stringify(obj);
  return { encrypted: encrypt(json) };
}

/**
 * Decrypts a credentials object previously encrypted by `encryptCredentials`.
 * For backwards compatibility, if the input doesn't look encrypted
 * (i.e. has no `encrypted` field), it is returned as-is.
 */
export function decryptCredentials(
  data: Record<string, any>
): Record<string, any> {
  if (data && typeof data.encrypted === 'string') {
    const json = decrypt(data.encrypted);
    return JSON.parse(json);
  }
  // Not encrypted — return as-is (backwards compat)
  return data;
}
