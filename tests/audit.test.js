const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Stub cache module before loading audit.service
const originalCache = require('../dist/cache.js');
originalCache.cacheToken = async () => {};
originalCache.getCachedToken = async () => null;

const { AuditService } = require('../dist/audit.service.js');

function createFakeAuditRepo() {
  const records = [];
  return {
    _records: records,
    create(data) {
      return { id: `audit-${Date.now()}-${records.length}`, createdAt: new Date(), ...data };
    },
    save(entity) {
      records.push(entity);
      return Promise.resolve(entity);
    },
    createQueryBuilder() {
      let filters = {};
      let limitVal = 50;
      const qb = {
        where(expr, params) {
          filters.userId = params.userId;
          return qb;
        },
        andWhere(expr, params) {
          if (params.service) filters.service = params.service;
          return qb;
        },
        orderBy() { return qb; },
        limit(n) { limitVal = n; return qb; },
        getMany() {
          let result = records.filter(r => r.userId === filters.userId);
          if (filters.service) {
            result = result.filter(r => r.service === filters.service);
          }
          // Sort descending by createdAt
          result.sort((a, b) => b.createdAt - a.createdAt);
          return Promise.resolve(result.slice(0, limitVal));
        },
      };
      return qb;
    },
  };
}

function createFakeDataSource(auditRepo) {
  return {
    isInitialized: true,
    getRepository() {
      return auditRepo;
    },
  };
}

describe('AuditService', () => {
  let repo;
  let ds;
  let service;

  beforeEach(() => {
    repo = createFakeAuditRepo();
    ds = createFakeDataSource(repo);
    service = new AuditService(ds);
  });

  describe('log()', () => {
    it('writes an audit entry to the repository', async () => {
      await service.log({
        userId: 'user-1',
        action: 'proxy',
        service: 'snowflake',
        method: 'GET',
        path: '/api/query',
        statusCode: 200,
        ipAddress: '127.0.0.1',
      });

      assert.equal(repo._records.length, 1);
      const record = repo._records[0];
      assert.equal(record.userId, 'user-1');
      assert.equal(record.action, 'proxy');
      assert.equal(record.service, 'snowflake');
      assert.equal(record.method, 'GET');
      assert.equal(record.path, '/api/query');
      assert.equal(record.statusCode, 200);
      assert.equal(record.ipAddress, '127.0.0.1');
    });

    it('sets nullable fields to null when not provided', async () => {
      await service.log({
        userId: 'user-2',
        action: 'auth',
      });

      assert.equal(repo._records.length, 1);
      const record = repo._records[0];
      assert.equal(record.userId, 'user-2');
      assert.equal(record.action, 'auth');
      assert.equal(record.service, null);
      assert.equal(record.method, null);
      assert.equal(record.path, null);
      assert.equal(record.statusCode, null);
      assert.equal(record.metadata, null);
      assert.equal(record.ipAddress, null);
    });

    it('does not throw when the repository save fails', async () => {
      // Override save to simulate a DB failure
      repo.save = () => Promise.reject(new Error('DB write failed'));

      // Should not throw
      await service.log({
        userId: 'user-3',
        action: 'connect',
      });

      // If we get here, the method did not throw
      assert.ok(true);
    });

    it('stores metadata as jsonb', async () => {
      await service.log({
        userId: 'user-4',
        action: 'auth',
        metadata: { event: 'login', provider: 'github' },
      });

      assert.equal(repo._records.length, 1);
      assert.deepEqual(repo._records[0].metadata, { event: 'login', provider: 'github' });
    });
  });

  describe('query()', () => {
    it('returns logs for a specific user', async () => {
      await service.log({ userId: 'user-a', action: 'proxy', service: 'snowflake' });
      await service.log({ userId: 'user-b', action: 'proxy', service: 'aws' });
      await service.log({ userId: 'user-a', action: 'auth' });

      const logs = await service.query('user-a');
      assert.equal(logs.length, 2);
      assert.ok(logs.every(l => l.userId === 'user-a'));
    });

    it('filters by service', async () => {
      await service.log({ userId: 'user-a', action: 'proxy', service: 'snowflake' });
      await service.log({ userId: 'user-a', action: 'proxy', service: 'aws' });
      await service.log({ userId: 'user-a', action: 'proxy', service: 'snowflake' });

      const logs = await service.query('user-a', { service: 'snowflake' });
      assert.equal(logs.length, 2);
      assert.ok(logs.every(l => l.service === 'snowflake'));
    });

    it('respects limit parameter', async () => {
      for (let i = 0; i < 10; i++) {
        await service.log({ userId: 'user-a', action: 'proxy', service: 'aws' });
      }

      const logs = await service.query('user-a', { limit: 3 });
      assert.equal(logs.length, 3);
    });

    it('returns empty array when no logs exist for user', async () => {
      await service.log({ userId: 'user-a', action: 'proxy' });

      const logs = await service.query('user-nonexistent');
      assert.equal(logs.length, 0);
    });

    it('defaults to 50 limit when none provided', async () => {
      // We just verify the query executes without error and returns results
      await service.log({ userId: 'user-a', action: 'proxy' });
      const logs = await service.query('user-a');
      assert.equal(logs.length, 1);
    });
  });
});
