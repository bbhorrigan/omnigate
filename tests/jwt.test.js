const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Stub Redis before loading jwt module
const cache = require('../dist/cache.js');
const tokenStore = new Map();
cache.cacheToken = async (key, value, _ttl) => { tokenStore.set(key, value); };
cache.getCachedToken = async (key) => tokenStore.get(key) || null;
cache.redisClient = { del: async (key) => { tokenStore.delete(key); } };

const { signAccessToken, verifyAccessToken, createRefreshToken, consumeRefreshToken } = require('../dist/jwt.js');

describe('JWT access tokens', () => {
  it('signs and verifies a token', () => {
    const token = signAccessToken({ sub: 'user-1', email: 'a@b.com' });
    const payload = verifyAccessToken(token);
    assert.equal(payload.sub, 'user-1');
    assert.equal(payload.email, 'a@b.com');
  });

  it('rejects a tampered token', () => {
    const token = signAccessToken({ sub: 'user-1', email: 'a@b.com' });
    assert.throws(() => verifyAccessToken(token + 'x'), { name: 'JsonWebTokenError' });
  });
});

describe('Refresh tokens', () => {
  it('creates and consumes a refresh token', async () => {
    const token = await createRefreshToken('user-42');
    const userId = await consumeRefreshToken(token);
    assert.equal(userId, 'user-42');
  });

  it('refresh token is single-use', async () => {
    const token = await createRefreshToken('user-42');
    await consumeRefreshToken(token); // first use
    const second = await consumeRefreshToken(token); // should be gone
    assert.equal(second, null);
  });

  it('returns null for unknown refresh token', async () => {
    const result = await consumeRefreshToken('bogus-token');
    assert.equal(result, null);
  });
});
