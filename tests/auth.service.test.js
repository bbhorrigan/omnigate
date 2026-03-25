const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

// Lightweight fakes — no real DB or Redis needed for unit tests

function createFakeRepo(store = new Map()) {
  return {
    findOne({ where }) {
      const key = where.email || where.id;
      return Promise.resolve(store.get(key) || null);
    },
    create(data) {
      return { id: `user-${Date.now()}`, ...data };
    },
    save(entity) {
      store.set(entity.email, entity);
      store.set(entity.id, entity);
      return Promise.resolve(entity);
    },
    upsert: () => Promise.resolve(),
  };
}

function createFakeDataSource() {
  const userStore = new Map();
  const userRepo = createFakeRepo(userStore);
  const mappingRepo = createFakeRepo();

  return {
    isInitialized: true,
    getRepository(entity) {
      if (entity.name === 'User') return userRepo;
      return mappingRepo;
    },
    async transaction(cb) {
      // Simulate transaction by just running the callback with a fake manager
      const manager = {
        getRepository(entity) {
          if (entity.name === 'User') return userRepo;
          return mappingRepo;
        },
      };
      return cb(manager);
    },
    _userStore: userStore,
  };
}

// Stub cacheToken so AuthService doesn't need Redis
const originalModule = require('../dist/cache.js');
originalModule.cacheToken = async () => {};
originalModule.getCachedToken = async () => null;

const { AuthService } = require('../dist/auth.service.js');

describe('AuthService', () => {
  let ds;
  let service;

  beforeEach(() => {
    ds = createFakeDataSource();
    service = new AuthService(ds);
  });

  describe('handleAuth', () => {
    it('creates a new user and returns userId', async () => {
      const result = await service.handleAuth('test@example.com', 'github', { accessToken: 'tok' });
      assert.ok(result.success);
      assert.ok(result.userId);
    });

    it('reuses existing user on second auth', async () => {
      const first = await service.handleAuth('same@example.com', 'github', { accessToken: 'a' });
      const second = await service.handleAuth('same@example.com', 'github', { accessToken: 'b' });
      assert.equal(first.userId, second.userId);
    });

    it('rejects invalid email', async () => {
      await assert.rejects(
        () => service.handleAuth('not-an-email', 'github', {}),
        { message: 'Invalid email.' }
      );
    });

    it('rejects empty email', async () => {
      await assert.rejects(
        () => service.handleAuth('', 'github', {}),
        { message: 'Invalid email.' }
      );
    });

    it('rejects missing saasType', async () => {
      await assert.rejects(
        () => service.handleAuth('test@example.com', '', {}),
        { message: 'saasType is required.' }
      );
    });
  });

  describe('getUserById', () => {
    it('returns null for unknown user', async () => {
      const result = await service.getUserById('nonexistent');
      assert.equal(result, null);
    });

    it('returns user after creation', async () => {
      const { userId } = await service.handleAuth('lookup@example.com', 'oidc', { oidcId: '123' });
      const user = await service.getUserById(userId);
      assert.ok(user);
      assert.equal(user.email, 'lookup@example.com');
    });
  });
});
