const { describe, it, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');

// Stub cache before importing modules that use it
const cache = require('../dist/cache.js');
cache.cacheToken = async () => {};
cache.getCachedToken = async () => null;
cache.deleteCachedToken = async () => {};

// Mock global fetch so connectors don't make real HTTP calls
const successfulFetch = async () => ({
  ok: true,
  status: 200,
  json: async () => ({
    access_token: 'new-token',
    refresh_token: 'new-refresh',
    expires_in: 3600,
  }),
  text: async () => '',
});

global.fetch = successfulFetch;

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
      updateCredentialsByUserId: mock.fn(() => Promise.resolve({ success: true, userId: 'u1' })),
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
      assert.equal(authServiceMock.updateCredentialsByUserId.mock.callCount(), 0);
    });

    it('refreshes credentials when within refresh buffer (5 min for non-snowflake)', async () => {
      const soon = new Date(Date.now() + 2 * 60 * 1000); // 2 min from now
      const creds = makeCredentials(soon.toISOString());

      const result = await service.ensureFresh('u1', 'a@b.com', 'gcp', creds);

      assert.notEqual(result, creds);
      assert.equal(result.token, 'new-token');
      assert.equal(authServiceMock.updateCredentialsByUserId.mock.callCount(), 1);
    });

    it('uses per-connector refresh buffer (2 min for snowflake)', async () => {
      // 2.5 min from now — should NOT refresh with snowflake's 2 min buffer
      const future = new Date(Date.now() + 2.5 * 60 * 1000);
      const creds = makeCredentials(future.toISOString());

      const result = await service.ensureFresh('u1', 'a@b.com', 'snowflake', creds);

      assert.equal(result, creds);
      assert.equal(authServiceMock.updateCredentialsByUserId.mock.callCount(), 0);
    });

    it('refreshes expired credentials', async () => {
      const past = new Date(Date.now() - 60 * 1000); // 1 min ago
      const creds = makeCredentials(past.toISOString());

      await service.ensureFresh('u1', 'a@b.com', 'snowflake', creds);

      assert.equal(authServiceMock.updateCredentialsByUserId.mock.callCount(), 1);
      const call = authServiceMock.updateCredentialsByUserId.mock.calls[0].arguments;
      assert.equal(call[0], 'u1'); // userId, not email
      assert.equal(call[1], 'snowflake'); // saasType
    });

    it('retries on transient errors (5xx response)', async () => {
      const expired = new Date(Date.now() - 60 * 1000);
      const creds = makeCredentials(expired.toISOString());

      let fetchCallCount = 0;
      global.fetch = async () => {
        fetchCallCount++;
        if (fetchCallCount === 1) {
          // First call throws transient error (503)
          throw new Error('Snowflake token exchange failed (503): Service Unavailable');
        }
        // Second call (retry) succeeds
        return {
          ok: true,
          status: 200,
          json: async () => ({
            access_token: 'new-token',
            refresh_token: 'new-refresh',
            expires_in: 3600,
          }),
          text: async () => '',
        };
      };

      const result = await service.ensureFresh('u1', 'a@b.com', 'snowflake', creds);

      assert.equal(result.token, 'new-token'); // Refresh succeeded on retry
      assert.equal(authServiceMock.updateCredentialsByUserId.mock.callCount(), 1);
      global.fetch = successfulFetch;
    });

    it('returns stale credentials if refresh returns null (not supported)', async () => {
      const expired = new Date(Date.now() - 60 * 1000);
      const creds = makeCredentials(expired.toISOString());

      const savedFetch = global.fetch;
      global.fetch = async () => ({
        ok: false, // Simulate null response from connector
        status: 400,
        text: async () => 'Bad Request',
      });

      const result = await service.ensureFresh('u1', 'a@b.com', 'snowflake', creds);

      assert.equal(result, creds); // Falls back to stale
      assert.equal(authServiceMock.updateCredentialsByUserId.mock.callCount(), 0);
      global.fetch = savedFetch;
    });

    it('returns stale credentials if refresh throws non-transient error', async () => {
      const expired = new Date(Date.now() - 60 * 1000);
      const creds = makeCredentials(expired.toISOString());

      const savedFetch = global.fetch;
      global.fetch = async () => {
        throw new Error('Invalid credentials');
      };

      const result = await service.ensureFresh('u1', 'a@b.com', 'snowflake', creds);

      assert.equal(result, creds); // falls back to stale on non-transient error
      global.fetch = savedFetch;
    });

    it('passes through if service has no connector', async () => {
      const soon = new Date(Date.now() + 1 * 60 * 1000);
      const creds = makeCredentials(soon.toISOString());

      const result = await service.ensureFresh('u1', 'a@b.com', 'unknown-service', creds);

      assert.equal(result, creds);
    });

    it('successfully refreshes expired credentials using userId', async () => {
      const expired = new Date(Date.now() - 60 * 1000);
      const creds = makeCredentials(expired.toISOString());

      const savedFetch = global.fetch;
      global.fetch = successfulFetch; // Restore to ensure successful refresh

      const result = await service.ensureFresh('u1', 'a@b.com', 'snowflake', creds);

      // Verify refresh happened and new credentials were returned
      assert.notEqual(result, creds);
      assert.equal(result.token, 'new-token');

      // Verify updateCredentialsByUserId was called with userId (not email)
      assert.equal(authServiceMock.updateCredentialsByUserId.mock.callCount(), 1);
      const updateCall = authServiceMock.updateCredentialsByUserId.mock.calls[0].arguments;
      assert.equal(updateCall[0], 'u1'); // userId
      assert.equal(updateCall[1], 'snowflake'); // saasType

      global.fetch = savedFetch;
    });
  });
});
