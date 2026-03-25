const { describe, it, beforeEach, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.SNOWFLAKE_ACCOUNT = 'xy12345';
process.env.SNOWFLAKE_OAUTH_CLIENT_ID = 'client-id';
process.env.SNOWFLAKE_OAUTH_CLIENT_SECRET = 'client-secret';
process.env.SNOWFLAKE_ROLE = 'ANALYST';

const { SnowflakeConnector } = require('../dist/connectors/snowflake.connector.js');

describe('SnowflakeConnector', () => {
  let connector;
  let fetchMock;

  beforeEach(() => {
    connector = new SnowflakeConnector();
  });

  afterEach(() => {
    if (fetchMock) {
      fetchMock.mock.restore();
      fetchMock = undefined;
    }
  });

  describe('metadata', () => {
    it('has correct serviceType', () => {
      assert.equal(connector.serviceType, 'snowflake');
    });

    it('has correct displayName', () => {
      assert.equal(connector.displayName, 'Snowflake');
    });

    it('uses oauth flowType', () => {
      assert.equal(connector.flowType, 'oauth');
    });

    it('supports refresh', () => {
      assert.equal(connector.supportsRefresh, true);
    });
  });

  describe('getAuthorizationUrl', () => {
    it('builds authorization URL with required params', () => {
      const url = connector.getAuthorizationUrl('csrf-state', 'http://localhost/callback');
      assert.ok(url.startsWith('https://xy12345.snowflakecomputing.com/oauth/authorize?'));
      assert.ok(url.includes('response_type=code'));
      assert.ok(url.includes('client_id=client-id'));
      assert.ok(url.includes('redirect_uri=http%3A%2F%2Flocalhost%2Fcallback'));
      assert.ok(url.includes('scope=session%3Arole%3AANALYST'));
      assert.ok(url.includes('state=csrf-state'));
    });

    it('uses PUBLIC role by default', () => {
      delete process.env.SNOWFLAKE_ROLE;
      const c = new SnowflakeConnector();
      const url = c.getAuthorizationUrl('state', 'http://localhost/callback');
      assert.ok(url.includes('session%3Arole%3APUBLIC'));
    });
  });

  describe('handleCallback', () => {
    it('exchanges code for tokens', async () => {
      fetchMock = mock.method(globalThis, 'fetch', () =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            access_token: 'sf-access-token',
            refresh_token: 'sf-refresh-token',
            expires_in: 600,
          }),
        })
      );

      const result = await connector.handleCallback(
        { code: 'auth-code-123' },
        'http://localhost/callback'
      );

      assert.equal(result.credentials.token, 'sf-access-token');
      assert.equal(result.credentials.refreshToken, 'sf-refresh-token');
      assert.equal(result.credentials.account, 'xy12345');
      assert.equal(result.credentials.tokenType, 'OAUTH');
      assert.ok(result.expiresAt instanceof Date);
    });

    it('throws when code is missing', async () => {
      await assert.rejects(
        () => connector.handleCallback({}, 'http://localhost/callback'),
        { message: 'Missing authorization code' }
      );
    });

    it('throws when Snowflake returns an error', async () => {
      fetchMock = mock.method(globalThis, 'fetch', () =>
        Promise.resolve({
          ok: false,
          status: 400,
          text: () => Promise.resolve('Invalid authorization code'),
        })
      );

      await assert.rejects(
        () => connector.handleCallback({ code: 'bad-code' }, 'http://localhost/callback'),
        /Snowflake token exchange failed/
      );
    });

    it('sends correct request to Snowflake', async () => {
      let captured;
      fetchMock = mock.method(globalThis, 'fetch', (url, options) => {
        captured = { url, options };
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ access_token: 'tok', expires_in: 600 }),
        });
      });

      await connector.handleCallback({ code: 'test-code' }, 'http://localhost/callback');

      assert.ok(captured.url.includes('/oauth/token-request'));
      assert.equal(captured.options.method, 'POST');
      assert.equal(captured.options.headers['Content-Type'], 'application/x-www-form-urlencoded');
      assert.ok(captured.options.headers['Authorization'].startsWith('Basic '));
      assert.ok(captured.options.body.includes('grant_type=authorization_code'));
      assert.ok(captured.options.body.includes('code=test-code'));
    });
  });

  describe('refreshCredentials', () => {
    it('refreshes with refresh token', async () => {
      fetchMock = mock.method(globalThis, 'fetch', () =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 600,
          }),
        })
      );

      const result = await connector.refreshCredentials({ refreshToken: 'old-refresh-token' });

      assert.equal(result.credentials.token, 'new-access-token');
      assert.equal(result.credentials.refreshToken, 'new-refresh-token');
    });

    it('returns null when no refresh token', async () => {
      const result = await connector.refreshCredentials({});
      assert.equal(result, null);
    });

    it('returns null when refresh fails', async () => {
      fetchMock = mock.method(globalThis, 'fetch', () =>
        Promise.resolve({
          ok: false,
          status: 400,
          text: () => Promise.resolve('Token expired'),
        })
      );

      const result = await connector.refreshCredentials({ refreshToken: 'expired-token' });
      assert.equal(result, null);
    });
  });
});
