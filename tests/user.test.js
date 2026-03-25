const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { User } = require('../dist/user.js');

describe('User entity', () => {
  it('can be instantiated', () => {
    const user = new User();
    user.email = 'test@example.com';
    assert.equal(user.email, 'test@example.com');
  });
});
