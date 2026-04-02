const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const {
  encrypt,
  decrypt,
  encryptCredentials,
  decryptCredentials,
} = require('../dist/crypto.js');

describe('crypto', () => {
  let originalKey;

  beforeEach(() => {
    // Save and set a deterministic key for tests
    originalKey = process.env.ENCRYPTION_KEY;
    process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
  });

  afterEach(() => {
    // Restore original key
    if (originalKey !== undefined) {
      process.env.ENCRYPTION_KEY = originalKey;
    } else {
      delete process.env.ENCRYPTION_KEY;
    }
  });

  describe('encrypt / decrypt', () => {
    it('roundtrips a simple string', () => {
      const plaintext = 'hello world';
      const encrypted = encrypt(plaintext);
      const decrypted = decrypt(encrypted);
      assert.equal(decrypted, plaintext);
    });

    it('roundtrips an empty string', () => {
      const encrypted = encrypt('');
      assert.equal(decrypt(encrypted), '');
    });

    it('roundtrips unicode content', () => {
      const plaintext = 'emoji: \u{1F512} and CJK: \u4F60\u597D';
      const encrypted = encrypt(plaintext);
      assert.equal(decrypt(encrypted), plaintext);
    });

    it('produces output different from input', () => {
      const plaintext = 'super secret token abc123';
      const encrypted = encrypt(plaintext);
      assert.notEqual(encrypted, plaintext);
      // The encrypted output should not contain the plaintext
      assert.ok(!encrypted.includes(plaintext));
    });

    it('produces different ciphertexts for same input (random IV)', () => {
      const plaintext = 'same input';
      const a = encrypt(plaintext);
      const b = encrypt(plaintext);
      assert.notEqual(a, b);
    });

    it('encrypted format is iv:authTag:ciphertext with three base64 parts', () => {
      const encrypted = encrypt('test');
      const parts = encrypted.split(':');
      assert.equal(parts.length, 3);
      // Each part should be valid base64
      for (const part of parts) {
        const buf = Buffer.from(part, 'base64');
        assert.ok(buf.length > 0);
      }
    });

    it('fails to decrypt with a wrong key', () => {
      const encrypted = encrypt('secret');
      // Switch to a different key
      process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
      assert.throws(() => decrypt(encrypted));
    });

    it('fails on tampered ciphertext', () => {
      const encrypted = encrypt('secret');
      // Flip a character in the ciphertext portion
      const parts = encrypted.split(':');
      const cipherBuf = Buffer.from(parts[2], 'base64');
      cipherBuf[0] ^= 0xff;
      parts[2] = cipherBuf.toString('base64');
      assert.throws(() => decrypt(parts.join(':')));
    });

    it('throws on malformed input', () => {
      assert.throws(() => decrypt('not:valid'), /iv:authTag:ciphertext/);
      assert.throws(() => decrypt('just-a-string'), /iv:authTag:ciphertext/);
    });
  });

  describe('encryptCredentials / decryptCredentials', () => {
    it('roundtrips a credentials object', () => {
      const creds = { accessToken: 'tok-123', refreshToken: 'ref-456', expiresAt: '2025-01-01' };
      const encrypted = encryptCredentials(creds);
      assert.ok(encrypted.encrypted);
      assert.equal(typeof encrypted.encrypted, 'string');

      const decrypted = decryptCredentials(encrypted);
      assert.deepEqual(decrypted, creds);
    });

    it('encrypted object does not contain plaintext values', () => {
      const creds = { secret: 'my-super-secret-value' };
      const encrypted = encryptCredentials(creds);
      const str = JSON.stringify(encrypted);
      assert.ok(!str.includes('my-super-secret-value'));
    });

    it('decryptCredentials passes through non-encrypted objects (backwards compat)', () => {
      const plain = { accessToken: 'tok', provider: 'github' };
      const result = decryptCredentials(plain);
      assert.deepEqual(result, plain);
    });

    it('decryptCredentials handles null/undefined gracefully', () => {
      // null case: decryptCredentials checks data && data.encrypted
      const result = decryptCredentials(null);
      assert.equal(result, null);
    });

    it('handles nested credential objects', () => {
      const creds = {
        oauth: { token: 'abc', refresh: 'def' },
        metadata: { scopes: ['read', 'write'] },
      };
      const encrypted = encryptCredentials(creds);
      const decrypted = decryptCredentials(encrypted);
      assert.deepEqual(decrypted, creds);
    });
  });
});
