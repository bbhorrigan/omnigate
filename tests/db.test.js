const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { AppDataSource, dbHealthcheck } = require('../dist/db.js');

describe('dbHealthcheck', () => {
  it('returns not_initialized when data source is not initialized', async () => {
    AppDataSource.isInitialized = false;
    const result = await dbHealthcheck();
    assert.deepStrictEqual(result, { ok: false, error: 'not_initialized' });
  });

  it('returns ok when data source is initialized and query succeeds', async () => {
    AppDataSource.isInitialized = true;
    const calls = [];
    AppDataSource.query = async (...args) => {
      calls.push(args);
      return [];
    };
    const result = await dbHealthcheck();
    assert.deepStrictEqual(result, { ok: true });
    assert.deepStrictEqual(calls, [['SELECT 1']]);
  });
});
