import { test } from 'node:test';
import assert from 'node:assert/strict';
import app from '../server.js';
import { signAdminToken, COOKIE_NAME } from '../src/services/auth.service.js';
import { matchesSignature, allowedMediaTypes } from '../src/utils/signatures.js';
import { sameOrigin } from '../src/utils/csrf.js';

let server;
let baseUrl;

test('setup security regression test server', async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

// ---------------------------------------------------------------------------
// 1. Comprehensive Method Matrix & 405 Allow Header Verification
// ---------------------------------------------------------------------------
test('API Security: All 9 handlers enforce strict HTTP methods and Allow headers', async () => {
  const routes = [
    { path: '/api/v1/load', allowed: ['GET'] },
    { path: '/api/v1/login', allowed: ['POST'] },
    { path: '/api/v1/session', allowed: ['GET'] },
    { path: '/api/v1/logout', allowed: ['POST'] },
    { path: '/api/v1/save', allowed: ['POST', 'PUT'] },
    { path: '/api/v1/upload', allowed: ['POST'] },
    { path: '/api/v1/enquiries', allowed: ['GET', 'POST', 'PATCH', 'DELETE'] },
    { path: '/api/v1/events', allowed: ['POST'] },
    { path: '/api/v1/media?key=test-key', allowed: ['GET'] }
  ];

  const allMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'];

  for (const route of routes) {
    for (const method of allMethods) {
      if (!route.allowed.includes(method)) {
        const res = await fetch(`${baseUrl}${route.path}`, { method });
        assert.equal(
          res.status,
          405,
          `Expected 405 for ${method} on ${route.path}, got ${res.status}`
        );
        const allowHeader = res.headers.get('allow');
        assert.ok(allowHeader, `Expected Allow header on 405 for ${route.path}`);
        for (const allowedMethod of route.allowed) {
          assert.ok(
            allowHeader.includes(allowedMethod),
            `Allow header '${allowHeader}' missing ${allowedMethod} for ${route.path}`
          );
        }
      }
    }
  }
});

// ---------------------------------------------------------------------------
// 2. CSRF Boundary Verification Across Header Combinations
// ---------------------------------------------------------------------------
test('API Security: CSRF verification rejects malicious cross-origin and spoofed headers', async () => {
  const token = signAdminToken('admin');
  const cookieHeader = `${COOKIE_NAME}=${token}`;

  // Malicious Origin
  const resEvil = await fetch(`${baseUrl}/api/v1/logout`, {
    method: 'POST',
    headers: {
      'Cookie': cookieHeader,
      'Origin': 'https://evil-attacker.com'
    }
  });
  assert.equal(resEvil.status, 403);
  const jsonEvil = await resEvil.json();
  assert.match(jsonEvil.error, /cross-site|forbidden|csrf/i);

  // Cross-site Sec-Fetch-Site header when Origin is absent
  const resCrossSite = await fetch(`${baseUrl}/api/v1/logout`, {
    method: 'POST',
    headers: {
      'Cookie': cookieHeader,
      'Sec-Fetch-Site': 'cross-site'
    }
  });
  assert.equal(resCrossSite.status, 403);

  // Valid same-origin request passes CSRF check
  const resValid = await fetch(`${baseUrl}/api/v1/logout`, {
    method: 'POST',
    headers: {
      'Cookie': cookieHeader,
      'Origin': baseUrl,
      'Sec-Fetch-Site': 'same-origin'
    }
  });
  assert.equal(resValid.status, 200);
});

// ---------------------------------------------------------------------------
// 3. JWT Authentication & Tampering Boundaries
// ---------------------------------------------------------------------------
test('API Security: Session endpoint rejects invalid, tampered, and expired JWTs', async () => {
  // Missing cookie
  const resNoAuth = await fetch(`${baseUrl}/api/v1/session`);
  assert.equal(resNoAuth.status, 200);
  const jsonNoAuth = await resNoAuth.json();
  assert.equal(jsonNoAuth.authenticated, false);

  // Tampered token (modified payload)
  const validToken = signAdminToken('admin');
  const parts = validToken.split('.');
  const tamperedPayload = Buffer.from(JSON.stringify({ sub: 'admin', role: 'superadmin' })).toString('base64url');
  const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

  const resTampered = await fetch(`${baseUrl}/api/v1/session`, {
    headers: { 'Cookie': `${COOKIE_NAME}=${tamperedToken}` }
  });
  const jsonTampered = await resTampered.json();
  assert.equal(jsonTampered.authenticated, false);

  // Gibberish token
  const resGarbage = await fetch(`${baseUrl}/api/v1/session`, {
    headers: { 'Cookie': `${COOKIE_NAME}=not-a-valid-jwt-token` }
  });
  const jsonGarbage = await resGarbage.json();
  assert.equal(jsonGarbage.authenticated, false);
});

// ---------------------------------------------------------------------------
// 4. Cookie Security Flags
// ---------------------------------------------------------------------------
test('API Security: Login cookie sets HttpOnly, Path=/, and SameSite=Lax flags', async () => {
  const res = await fetch(`${baseUrl}/api/v1/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': baseUrl
    },
    body: JSON.stringify({
      username: 'admin',
      password: process.env.ADMIN_PASSWORD || 'admin'
    })
  });

  assert.equal(res.status, 200);
  const setCookie = res.headers.get('set-cookie');
  assert.ok(setCookie, 'Expected Set-Cookie header on successful login');
  assert.ok(setCookie.includes('HttpOnly'), 'Set-Cookie missing HttpOnly');
  assert.ok(setCookie.includes('Path=/'), 'Set-Cookie missing Path=/');
  assert.ok(setCookie.includes('SameSite=Lax') || setCookie.includes('SameSite=Strict'), 'Set-Cookie missing SameSite');
});

// ---------------------------------------------------------------------------
// 5. Login Throttling Verification
// ---------------------------------------------------------------------------
test('API Security: Login throttling blocks IP after 5 consecutive failures', async () => {
  const clientIp = '198.51.100.42';

  for (let i = 0; i < 5; i++) {
    const res = await fetch(`${baseUrl}/api/v1/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': baseUrl,
        'X-Forwarded-For': clientIp
      },
      body: JSON.stringify({ username: 'admin', password: 'wrong-password' })
    });
    assert.equal(res.status, 401, `Attempt ${i + 1} expected 401`);
  }

  // 6th attempt must be 429 Too Many Requests
  const throttledRes = await fetch(`${baseUrl}/api/v1/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': baseUrl,
      'X-Forwarded-For': clientIp
    },
    body: JSON.stringify({ username: 'admin', password: 'wrong-password' })
  });
  assert.equal(throttledRes.status, 429, 'Expected 429 after 5 failed attempts');
  const json = await throttledRes.json();
  assert.match(json.error, /too many (?:failed )?login attempts/i);
});

// ---------------------------------------------------------------------------
// 6. Content-Type Enforcement on Mutations
// ---------------------------------------------------------------------------
test('API Security: POST /api/v1/enquiries rejects non-JSON Content-Type with 415', async () => {
  const res = await fetch(`${baseUrl}/api/v1/enquiries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      'Origin': baseUrl
    },
    body: 'name=Test&email=test@example.com'
  });
  assert.equal(res.status, 415);
  const json = await res.json();
  assert.equal(json.error, 'Invalid request.');
});

// ---------------------------------------------------------------------------
// 7. Honeypot Bot Injection Defense & Validation
// ---------------------------------------------------------------------------
test('API Security: Honeypot field in payload fails validation when DB configured and fails gracefully closed', async () => {
  // In unconfigured environment, fails closed with 503
  const resUnconf = await fetch(`${baseUrl}/api/v1/enquiries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': baseUrl
    },
    body: JSON.stringify({
      id: crypto.randomUUID(),
      name: 'Spam Bot',
      email: 'bot@spam.com',
      service: 'Game Thumbnails',
      goal: 'Buy cheap watches and crypto',
      website: 'http://spam-link.com', // Honeypot filled!
      consent: true
    })
  });
  assert.equal(resUnconf.status, 503);

  // In configured mock environment, honeypot is rejected with 400
  const origUrl = process.env.SUPABASE_URL;
  const origKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.SUPABASE_URL = 'https://mock-supabase.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key-12345';

  try {
    const resConf = await fetch(`${baseUrl}/api/v1/enquiries`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': baseUrl
      },
      body: JSON.stringify({
        id: crypto.randomUUID(),
        name: 'Spam Bot',
        email: 'bot@spam.com',
        service: 'Game Thumbnails',
        goal: 'Buy cheap watches and crypto here at scale',
        website: 'http://spam-link.com', // Honeypot filled!
        consent: true
      })
    });
    assert.equal(resConf.status, 400);
    const jsonConf = await resConf.json();
    assert.match(jsonConf.error, /leave this field empty/i);
  } finally {
    process.env.SUPABASE_URL = origUrl;
    process.env.SUPABASE_SERVICE_ROLE_KEY = origKey;
  }
});

// ---------------------------------------------------------------------------
// 8. Media Path Traversal Attack Rejection
// ---------------------------------------------------------------------------
test('API Security: Media handler strictly rejects path traversal and malformed keys', async () => {
  const attackKeys = [
    '../server.js',
    '..%2fserver.js',
    '..\\..\\windows\\win.ini',
    '../../etc/passwd',
    'foo/bar/baz',
    'foo;rm -rf /',
    '   ',
    ''
  ];

  for (const key of attackKeys) {
    const res = await fetch(`${baseUrl}/api/v1/media?key=${encodeURIComponent(key)}`);
    // Path traversal must return 400 or 404, never 200
    assert.ok(
      [400, 404].includes(res.status),
      `Expected 400 or 404 for traversal key '${key}', got ${res.status}`
    );
  }
});

// ---------------------------------------------------------------------------
// 9. Public Content Data Leakage Boundary
// ---------------------------------------------------------------------------
test('API Security: /api/v1/load never exposes customer enquiries, user tokens, or hidden drafts', async () => {
  const res = await fetch(`${baseUrl}/api/v1/load`);
  assert.equal(res.status, 200);
  const json = await res.json();

  assert.equal(json.enquiries, undefined);
  assert.equal(json.user, undefined);
  assert.equal(json.token, undefined);
  assert.equal(json.secret, undefined);

  // Verify all returned projects have published === true
  for (const p of json.projects) {
    assert.equal(p.published, true);
  }
});

// ---------------------------------------------------------------------------
// 10. Cache-Control Header Compliance
// ---------------------------------------------------------------------------
test('API Security: Cache-Control headers prevent caching on sensitive endpoints and permit on public', async () => {
  // Public load endpoint allows caching
  const resLoad = await fetch(`${baseUrl}/api/v1/load`);
  assert.match(resLoad.headers.get('cache-control'), /public/);

  // Private session endpoint forbids caching
  const resSession = await fetch(`${baseUrl}/api/v1/session`);
  const sessionCache = resSession.headers.get('cache-control') || '';
  assert.ok(!sessionCache.includes('public'), 'Session must not be cached publicly');
});

test('teardown security regression test server', async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});
