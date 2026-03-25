const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { BearerAdapter } = require('../dist/proxy/adapters/bearer.adapter.js');
const { AwsAdapter } = require('../dist/proxy/adapters/aws.adapter.js');
const { SnowflakeAdapter } = require('../dist/proxy/adapters/snowflake.adapter.js');
const { getAdapter, listAdapters } = require('../dist/proxy/adapters/index.js');

describe('Adapter registry', () => {
  it('lists all registered adapters', () => {
    const list = listAdapters();
    assert.ok(list.includes('bearer'));
    assert.ok(list.includes('aws'));
    assert.ok(list.includes('snowflake'));
  });

  it('returns undefined for unknown adapter', () => {
    assert.equal(getAdapter('nope'), undefined);
  });
});

describe('BearerAdapter', () => {
  const adapter = new BearerAdapter();

  it('resolves target URL from baseUrl + path', () => {
    const url = adapter.resolveTargetUrl('v1/users', { baseUrl: 'https://api.example.com' });
    assert.equal(url, 'https://api.example.com/v1/users');
  });

  it('strips trailing slash from baseUrl', () => {
    const url = adapter.resolveTargetUrl('data', { baseUrl: 'https://api.example.com/' });
    assert.equal(url, 'https://api.example.com/data');
  });

  it('sets Bearer authorization header', () => {
    const config = adapter.apply(
      { url: 'https://api.example.com/v1', method: 'GET', headers: {} },
      { token: 'my-token', baseUrl: 'https://api.example.com' }
    );
    assert.equal(config.headers['authorization'], 'Bearer my-token');
  });
});

describe('AwsAdapter', () => {
  const adapter = new AwsAdapter();

  it('resolves S3 URL from path', () => {
    const url = adapter.resolveTargetUrl('s3/my-bucket/key.txt', { region: 'us-west-2' });
    assert.equal(url, 'https://s3.us-west-2.amazonaws.com/my-bucket/key.txt');
  });

  it('defaults to us-east-1', () => {
    const url = adapter.resolveTargetUrl('s3/bucket', {});
    assert.ok(url.includes('us-east-1'));
  });

  it('applies SigV4 headers', () => {
    const config = adapter.apply(
      { url: 'https://s3.us-east-1.amazonaws.com/bucket', method: 'GET', headers: {} },
      { accessKeyId: 'AKIATEST', secretAccessKey: 'secret', region: 'us-east-1' }
    );
    assert.ok(config.headers['authorization'].startsWith('AWS4-HMAC-SHA256'));
    assert.ok(config.headers['x-amz-date']);
    assert.ok(config.headers['x-amz-content-sha256']);
  });

  it('includes security token when provided', () => {
    const config = adapter.apply(
      { url: 'https://s3.us-east-1.amazonaws.com/bucket', method: 'GET', headers: {} },
      { accessKeyId: 'AKIATEST', secretAccessKey: 'secret', sessionToken: 'tok123' }
    );
    assert.equal(config.headers['x-amz-security-token'], 'tok123');
  });
});

describe('SnowflakeAdapter', () => {
  const adapter = new SnowflakeAdapter();

  it('resolves Snowflake SQL API URL', () => {
    const url = adapter.resolveTargetUrl('statements', { account: 'xy12345.us-east-1' });
    assert.equal(url, 'https://xy12345.us-east-1.snowflakecomputing.com/api/v2/statements');
  });

  it('defaults to statements endpoint', () => {
    const url = adapter.resolveTargetUrl('', { account: 'myaccount' });
    assert.equal(url, 'https://myaccount.snowflakecomputing.com/api/v2/statements');
  });

  it('applies Snowflake auth headers', () => {
    const config = adapter.apply(
      { url: 'https://test.snowflakecomputing.com/api/v2/statements', method: 'POST', headers: {} },
      { account: 'test', token: 'sf-token', tokenType: 'KEYPAIR_JWT' }
    );
    assert.equal(config.headers['authorization'], 'Bearer sf-token');
    assert.equal(config.headers['x-snowflake-authorization-token-type'], 'KEYPAIR_JWT');
    assert.equal(config.headers['accept'], 'application/json');
  });
});
