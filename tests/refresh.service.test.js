const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');

// Stub cache before importing modules that use it
const cache = require('../dist/cache.js');
cache.cacheToken = async () => {};
cache.getCachedToken = async () => null;

// Mock global fetch so connectors don't make real HTTP calls
const originalFetch = global.fetch;
global.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => ({
    access_token: 'new-token',
    refresh_token: 'new-refresh',
    expires_in: 3600,
  }),
  text: async () => '',
});

const { RefreshService } = require('../dist/connectors/refresh.service.js');

describe('RefreshService', () => {
  let authServiceMock;
  let service;

  const makeCredentials = (expiresAt) => ({
    token: 'original-token',
    refreshToken: 'original-refresh',
    account: 'test-account',
    tokenType: 'OAUTH',
    expiresAt,
  });

  beforeEach(() => {
    authServiceMock = {
      handleAuth: mock.fn(() => Promise.resolve()),
    };
    service = new RefreshService(authServiceMock);
  });

  describe('ensureFresh', () => {
    it('returns credentials as-is when no expiresAt', async () => {
      const creds = { token: 'tok' };
      const result = await service.ensureFresh('u1', 'a@b.com', 'snowflake', creds);
      assert.equal(result, creds);
    });

    it('returns credentials as-is when not within refresh buffer', async () => {
      const future = new Date(Date.now() + 30 * 60 * 1000); // 30 min from now
      const creds = makeCredentials(future.toISOString());

      const result = await service.ensureFresh('u1', 'a@b.com', 'snowflake', creds);

      assert.equal(result, creds);
      assert.equal(authServiceMock.handleAuth.mock.callCount(), 0);
    });

    it('refreshes credentials when within refresh buffer (5 min)', async () => {
      const soon = new Date(Date.now() + 2 * 60 * 1000); // 2 min from now
      const creds = makeCredentials(soon.toISOString());

      const result = await service.ensureFresh('u1', 'a@b.com', 'snowflake', creds);

      assert.notEqual(result, creds);
      assert.equal(result.token, 'new-token');
      assert.equal(authServiceMock.handleAuth.mock.callCount(), 1);
    });

    it('refreshes expired credentials', async () => {
      const past = new Date(Date.now() - 60 * 1000); // 1 min ago
      const creds = makeCredentials(past.toISOString());

      await service.ensureFresh('u1', 'a@b.com', 'snowflake', creds);

      assert.equal(authServiceMock.handleAuth.mock.callCount(), 1);
      assert.equal(authServiceMock.handleAuth.mock.calls[0].arguments[0], 'a@b.com');
      assert.equal(authServiceMock.handleAuth.mock.calls[0].arguments[1], 'snowflake');
    });

    it('returns stale credentials if refresh throws', async () => {
      const expired = new Date(Date.now() - 60 * 1000);
      const creds = makeCredentials(expired.toISOString());

      // Make fetch fail to trigger the error path
      const savedFetch = global.fetch;
      global.fetch = async () => { throw new Error('Network error'); };

      const result = await service.ensureFresh('u1', 'a@b.com', 'snowflake', creds);

      assert.equal(result, creds); // falls back to stale
      global.fetch = savedFetch;
    });

    it('passes through if service has no connector', async () => {
      const soon = new Date(Date.now() + 1 * 60 * 1000);
      const creds = makeCredentials(soon.toISOString());

      const result = await service.ensureFresh('u1', 'a@b.com', 'unknown-service', creds);

      assert.equal(result, creds);
    });
  });
});
