const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { signAccessToken } = require('../dist/jwt.js');
const { requireAuth } = require('../dist/middleware.js');

function mockReqRes(authHeader) {
  const req = { headers: { authorization: authHeader } };
  let statusCode = 200;
  let body = null;
  const res = {
    status(code) { statusCode = code; return res; },
    json(data) { body = data; },
  };
  return { req, res, getStatus: () => statusCode, getBody: () => body };
}

describe('requireAuth middleware', () => {
  it('rejects missing Authorization header', () => {
    const { req, res, getStatus, getBody } = mockReqRes(undefined);
    requireAuth(req, res, () => { throw new Error('should not reach next'); });
    assert.equal(getStatus(), 401);
    assert.match(getBody().error, /Missing/);
  });

  it('rejects non-Bearer header', () => {
    const { req, res, getStatus } = mockReqRes('Basic abc');
    requireAuth(req, res, () => {});
    assert.equal(getStatus(), 401);
  });

  it('rejects invalid token', () => {
    const { req, res, getStatus, getBody } = mockReqRes('Bearer garbage');
    requireAuth(req, res, () => {});
    assert.equal(getStatus(), 401);
    assert.match(getBody().error, /Invalid/);
  });

  it('passes valid token and attaches payload', () => {
    const token = signAccessToken({ sub: 'u1', email: 'a@b.com' });
    const { req, res } = mockReqRes(`Bearer ${token}`);
    let called = false;
    requireAuth(req, res, () => { called = true; });
    assert.ok(called);
    assert.equal(req.tokenPayload.sub, 'u1');
  });
});
