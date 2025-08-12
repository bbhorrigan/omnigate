const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('sample test', () => {
  it('adds numbers', () => {
    assert.strictEqual(1 + 1, 2);
  });
});
