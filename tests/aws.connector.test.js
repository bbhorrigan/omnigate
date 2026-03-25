const { describe, it, beforeEach, mock, afterEach } = require('node:test');
const assert = require('node:assert/strict');

process.env.AWS_ACCESS_KEY_ID = 'AKIATESTACCESSKEY';
process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-access-key-please-ignore';

const { AwsConnector } = require('../dist/connectors/aws.connector.js');

describe('AwsConnector', () => {
  let connector;
  let fetchMock;

  beforeEach(() => {
    connector = new AwsConnector();
  });

  afterEach(() => {
    if (fetchMock) {
      fetchMock.mock.restore();
      fetchMock = undefined;
    }
  });

  describe('metadata', () => {
    it('has correct serviceType', () => {
      assert.equal(connector.serviceType, 'aws');
    });

    it('has correct displayName', () => {
      assert.equal(connector.displayName, 'AWS');
    });

    it('uses form flowType', () => {
      assert.equal(connector.flowType, 'form');
    });

    it('supports refresh', () => {
      assert.equal(connector.supportsRefresh, true);
    });
  });

  describe('getAuthorizationUrl', () => {
    it('throws — AWS uses form flow, not OAuth redirect', () => {
      assert.throws(
        () => connector.getAuthorizationUrl('state', 'http://localhost/callback'),
        /form-based flow/
      );
    });
  });

  describe('handleCallback', () => {
    it('calls STS AssumeRole and returns credentials', async () => {
      fetchMock = mock.method(globalThis, 'fetch', () =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(`
            <AssumeRoleResponse>
              <AssumeRoleResult>
                <Credentials>
                  <AccessKeyId>ASIA-TEMP-KEY</AccessKeyId>
                  <SecretAccessKey>temp-secret</SecretAccessKey>
                  <SessionToken>temp-session-token</SessionToken>
                  <Expiration>2025-01-01T12:00:00Z</Expiration>
                </Credentials>
              </AssumeRoleResult>
            </AssumeRoleResponse>
          `),
        })
      );

      const result = await connector.handleCallback({
        roleArn: 'arn:aws:iam::123456789012:role/TestRole',
        region: 'us-east-1',
      });

      assert.equal(result.credentials.accessKeyId, 'ASIA-TEMP-KEY');
      assert.equal(result.credentials.secretAccessKey, 'temp-secret');
      assert.equal(result.credentials.sessionToken, 'temp-session-token');
      assert.equal(result.credentials.region, 'us-east-1');
      assert.equal(result.credentials.roleArn, 'arn:aws:iam::123456789012:role/TestRole');
      assert.equal(result.credentials.expiresAt, '2025-01-01T12:00:00Z');
    });

    it('throws when roleArn is missing', async () => {
      await assert.rejects(
        () => connector.handleCallback({ region: 'us-east-1' }),
        { message: 'roleArn is required' }
      );
    });

    it('defaults region to us-east-1', async () => {
      let capturedUrl;
      fetchMock = mock.method(globalThis, 'fetch', (url) => {
        capturedUrl = url;
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(`
            <AssumeRoleResponse><AssumeRoleResult><Credentials>
              <AccessKeyId>KEY</AccessKeyId>
              <SecretAccessKey>SECRET</SecretAccessKey>
              <Expiration>2025-01-01T12:00:00Z</Expiration>
            </Credentials></AssumeRoleResult></AssumeRoleResponse>
          `),
        });
      });

      await connector.handleCallback({ roleArn: 'arn:aws:iam::123:role/Test' });

      assert.ok(capturedUrl.includes('sts.us-east-1.amazonaws.com'));
    });

    it('includes ExternalId when provided', async () => {
      let capturedBody;
      fetchMock = mock.method(globalThis, 'fetch', (_url, opts) => {
        capturedBody = opts.body;
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(`
            <AssumeRoleResponse><AssumeRoleResult><Credentials>
              <AccessKeyId>KEY</AccessKeyId>
              <SecretAccessKey>SECRET</SecretAccessKey>
              <Expiration>2025-01-01T12:00:00Z</Expiration>
            </Credentials></AssumeRoleResult></AssumeRoleResponse>
          `),
        });
      });

      await connector.handleCallback({
        roleArn: 'arn:aws:iam::123:role/Test',
        externalId: 'my-external-id',
      });

      assert.ok(capturedBody.includes('ExternalId=my-external-id'));
    });

    it('throws when STS returns an error', async () => {
      fetchMock = mock.method(globalThis, 'fetch', () =>
        Promise.resolve({
          ok: false,
          status: 403,
          text: () => Promise.resolve('Access Denied'),
        })
      );

      await assert.rejects(
        () => connector.handleCallback({ roleArn: 'arn:aws:iam::123:role/BadRole' }),
        /STS AssumeRole failed/
      );
    });

    it('throws when credentials are missing from response', async () => {
      fetchMock = mock.method(globalThis, 'fetch', () =>
        Promise.resolve({
          ok: true,
          text: () => Promise.resolve('<AssumeRoleResponse/>'),
        })
      );

      await assert.rejects(
        () => connector.handleCallback({ roleArn: 'arn:aws:iam::123:role/Test' }),
        { message: 'Failed to parse STS response' }
      );
    });
  });

  describe('refreshCredentials', () => {
    it('re-assumes role using stored roleArn and region', async () => {
      let captured;
      fetchMock = mock.method(globalThis, 'fetch', (_url, opts) => {
        captured = opts.body;
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(`
            <AssumeRoleResponse><AssumeRoleResult><Credentials>
              <AccessKeyId>NEW-KEY</AccessKeyId>
              <SecretAccessKey>NEW-SECRET</SecretAccessKey>
              <Expiration>2025-01-01T12:00:00Z</Expiration>
            </Credentials></AssumeRoleResult></AssumeRoleResponse>
          `),
        });
      });

      const result = await connector.refreshCredentials({
        roleArn: 'arn:aws:iam::123:role/Test',
        region: 'us-west-2',
      });

      assert.equal(result.credentials.accessKeyId, 'NEW-KEY');
      assert.ok(captured.includes('RoleArn=arn%3Aaws%3Aiam%3A%3A123%3Arole%2FTest'));
    });

    it('returns null when roleArn is missing from credentials', async () => {
      const result = await connector.refreshCredentials({ region: 'us-east-1' });
      assert.equal(result, null);
    });
  });
});
