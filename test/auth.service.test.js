import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COOKIE_NAME,
  isAuthThrottled,
  recordFailedLogin,
  resetLoginAttempts,
  getClientIp,
  areAdminCredentialsConfigured,
  verifyAdminCredentials,
  signAdminToken,
  verifyAdminToken,
  getAdminUserFromRequest,
  isAdmin,
  setAuthCookie,
  clearAuthCookie
} from '../src/services/auth.service.js';
import { sameOrigin } from '../src/utils/csrf.js';

test('Auth Service: areAdminCredentialsConfigured fails closed when env missing', () => {
  const origPass = process.env.ADMIN_PASSWORD;
  const origSecret = process.env.JWT_SECRET;
  delete process.env.ADMIN_PASSWORD;
  delete process.env.JWT_SECRET;

  assert.equal(areAdminCredentialsConfigured(), false);
  const verify = verifyAdminCredentials('admin', 'any-pass');
  assert.equal(verify.ok, false);
  assert.match(verify.error, /not configured/);

  if (origPass) process.env.ADMIN_PASSWORD = origPass;
  if (origSecret) process.env.JWT_SECRET = origSecret;
});

test('Auth Service: verifyAdminCredentials verifies password and handles timing safety', () => {
  process.env.ADMIN_USERNAME = 'studio-lead';
  process.env.ADMIN_PASSWORD = 'super-secret-password-xyz';
  process.env.JWT_SECRET = 'a-super-secret-jwt-key-with-over-32-chars';

  // Bad user
  assert.equal(verifyAdminCredentials('wrong-user', 'super-secret-password-xyz').ok, false);

  // Bad password
  assert.equal(verifyAdminCredentials('studio-lead', 'wrong-pass').ok, false);

  // Good
  const okResult = verifyAdminCredentials('studio-lead', 'super-secret-password-xyz');
  assert.equal(okResult.ok, true);
  assert.equal(okResult.username, 'studio-lead');
});

test('Auth Service: JWT token signing, verification, tampering, and expiration', () => {
  process.env.JWT_SECRET = 'a-super-secret-jwt-key-with-over-32-chars';

  // Sign token
  const token = signAdminToken('studio-lead');
  assert.ok(token);

  // Verify token
  const verified = verifyAdminToken(token);
  assert.equal(verified.sub, 'studio-lead');
  assert.equal(verified.role, 'admin');

  // Tampered token
  const tampered = token.slice(0, -5) + 'abcde';
  assert.equal(verifyAdminToken(tampered), null);

  // Malformed token
  assert.equal(verifyAdminToken('not-a-jwt'), null);
  assert.equal(verifyAdminToken(null), null);
  assert.equal(verifyAdminToken(''), null);
});

test('Auth Service: IP throttling boundaries and resets', () => {
  const ip = '198.51.100.99';
  resetLoginAttempts(ip);
  assert.equal(isAuthThrottled(ip), false);

  // 4 failures: not throttled yet
  for (let i = 0; i < 4; i++) {
    recordFailedLogin(ip);
    assert.equal(isAuthThrottled(ip), false);
  }

  // 5th failure: throttled
  recordFailedLogin(ip);
  assert.equal(isAuthThrottled(ip), true);

  // Reset
  resetLoginAttempts(ip);
  assert.equal(isAuthThrottled(ip), false);
});

test('Auth Service: cookie reading, setting, clearing, and session detection', () => {
  process.env.JWT_SECRET = 'a-super-secret-jwt-key-with-over-32-chars';
  const token = signAdminToken('studio-lead');

  // Request with cookie
  const reqWithCookie = {
    headers: {
      cookie: `${COOKIE_NAME}=${token}`
    }
  };
  assert.equal(isAdmin(reqWithCookie), true);
  const user = getAdminUserFromRequest(reqWithCookie);
  assert.equal(user.sub, 'studio-lead');

  // Request without cookie
  assert.equal(isAdmin({ headers: {} }), false);
  assert.equal(isAdmin(null), false);

  // Setting auth cookie
  let setHeaderCalled = false;
  let cookieHeaderVal = '';
  const mockRes = {
    setHeader: (name, val) => {
      if (name === 'Set-Cookie') {
        setHeaderCalled = true;
        cookieHeaderVal = val;
      }
    }
  };
  setAuthCookie(mockRes, token);
  assert.equal(setHeaderCalled, true);
  assert.match(cookieHeaderVal, new RegExp(`${COOKIE_NAME}=${token}`));
  assert.match(cookieHeaderVal, /HttpOnly/i);
  assert.match(cookieHeaderVal, /SameSite=Lax/i);

  // Clearing auth cookie
  clearAuthCookie(mockRes);
  assert.match(cookieHeaderVal, /Max-Age=0/i);
});

test('CSRF Utility: sameOrigin verification across origin, sec-fetch-site, and host headers', () => {
  // Matching host and origin
  assert.equal(sameOrigin({
    headers: { origin: 'https://mondo.studio', host: 'mondo.studio' }
  }), true);

  // Mismatched host and origin
  assert.equal(sameOrigin({
    headers: { origin: 'https://phishing.site', host: 'mondo.studio' }
  }), false);

  // Sec-fetch-site check when no origin
  assert.equal(sameOrigin({
    headers: { 'sec-fetch-site': 'cross-site' }
  }), false);

  assert.equal(sameOrigin({
    headers: { 'sec-fetch-site': 'same-origin' }
  }), true);
});
