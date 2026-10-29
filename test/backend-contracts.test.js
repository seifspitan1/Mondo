import { test } from 'node:test';
import assert from 'node:assert/strict';
import app from '../server.js';
import { defaultProjects, defaultSettings } from '../lib/defaults.js';
import { signAdminToken, COOKIE_NAME } from '../lib/auth.js';

let server;
let baseUrl;

test('setup contract characterization test server', async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

// ---------------------------------------------------------------------------
// 1. GET /api/v1/load Contract
// ---------------------------------------------------------------------------
test('GET /api/v1/load characterization: methods, headers, and payload schema', async () => {
  // Method constraints
  for (const method of ['POST', 'PUT', 'DELETE', 'PATCH']) {
    const res = await fetch(`${baseUrl}/api/v1/load`, { method });
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('allow'), 'GET');
    const json = await res.json();
    assert.equal(json.error, 'Method not allowed.');
  }

  // Valid GET
  const res = await fetch(`${baseUrl}/api/v1/load`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type')?.includes('application/json'), true);
  assert.equal(res.headers.get('cache-control'), 'public, s-maxage=60, stale-while-revalidate=300');

  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(Array.isArray(body.projects), true);
  assert.equal(body.projects.length, 5);
  // Verify only published projects returned
  for (const p of body.projects) {
    assert.equal(p.published, true);
    assert.ok(p.id);
    assert.ok(p.slug);
    assert.ok(p.title);
    assert.ok(p.category);
    assert.ok(p.image);
  }
  // Verify settings schema
  assert.ok(body.settings);
  assert.equal(typeof body.settings.tagline, 'string');
  assert.equal(Array.isArray(body.settings.packages), true);
  assert.equal(Array.isArray(body.settings.services), true);
  assert.equal(Array.isArray(body.settings.faqs), true);
  // Confidential information check
  assert.equal(body.enquiries, undefined);
  assert.equal(body.user, undefined);
});

// ---------------------------------------------------------------------------
// 2. POST /api/v1/login Contract
// ---------------------------------------------------------------------------
test('POST /api/v1/login characterization: method, CSRF, auth failure, and success cookie', async () => {
  // Method constraints
  for (const method of ['GET', 'PUT', 'DELETE']) {
    const res = await fetch(`${baseUrl}/api/v1/login`, { method });
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('allow'), 'POST');
  }

  // Cross-origin rejected
  const crossRes = await fetch(`${baseUrl}/api/v1/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin: 'https://attacker.example.com',
      host: 'localhost'
    },
    body: JSON.stringify({ username: 'admin', password: 'password' })
  });
  assert.equal(crossRes.status, 403);
  const crossJson = await crossRes.json();
  assert.equal(crossJson.error, 'Forbidden: Cross-origin request blocked.');

  // Configured test admin environment
  const origPass = process.env.ADMIN_PASSWORD;
  const origSecret = process.env.JWT_SECRET;
  const origUser = process.env.ADMIN_USERNAME;

  process.env.ADMIN_USERNAME = 'mondo-admin';
  process.env.ADMIN_PASSWORD = 'contract-test-pass-123';
  process.env.JWT_SECRET = 'a-super-secret-jwt-key-with-over-32-chars';

  try {
    // Bad credentials
    const badRes = await fetch(`${baseUrl}/api/v1/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: baseUrl
      },
      body: JSON.stringify({ username: 'mondo-admin', password: 'wrong-password' })
    });
    assert.equal(badRes.status, 401);
    const badJson = await badRes.json();
    assert.equal(badJson.error, 'Invalid username or password.');

    // Successful login
    const goodRes = await fetch(`${baseUrl}/api/v1/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: baseUrl
      },
      body: JSON.stringify({ username: 'mondo-admin', password: 'contract-test-pass-123' })
    });
    assert.equal(goodRes.status, 200);
    const goodJson = await goodRes.json();
    assert.equal(goodJson.ok, true);
    assert.equal(goodJson.username, 'mondo-admin');

    const setCookie = goodRes.headers.get('set-cookie');
    assert.ok(setCookie);
    assert.match(setCookie, new RegExp(`${COOKIE_NAME}=`));
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.match(setCookie, /Path=\//i);
    assert.match(setCookie, /Max-Age=604800/i);
  } finally {
    if (origPass) process.env.ADMIN_PASSWORD = origPass;
    else delete process.env.ADMIN_PASSWORD;
    if (origSecret) process.env.JWT_SECRET = origSecret;
    else delete process.env.JWT_SECRET;
    if (origUser) process.env.ADMIN_USERNAME = origUser;
    else delete process.env.ADMIN_USERNAME;
  }
});

// ---------------------------------------------------------------------------
// 3. GET /api/v1/session Contract
// ---------------------------------------------------------------------------
test('GET /api/v1/session characterization: method, token verification, and payload shape', async () => {
  // Method constraints
  const notAllowed = await fetch(`${baseUrl}/api/v1/session`, { method: 'POST' });
  assert.equal(notAllowed.status, 405);
  assert.equal(notAllowed.headers.get('allow'), 'GET');

  // No cookie
  const unauthRes = await fetch(`${baseUrl}/api/v1/session`);
  assert.equal(unauthRes.status, 200);
  const unauthJson = await unauthRes.json();
  assert.equal(unauthJson.authenticated, false);

  // Tampered cookie
  const badTokenRes = await fetch(`${baseUrl}/api/v1/session`, {
    headers: { cookie: `${COOKIE_NAME}=malformed.or.tampered.token` }
  });
  assert.equal(badTokenRes.status, 200);
  const badTokenJson = await badTokenRes.json();
  assert.equal(badTokenJson.authenticated, false);

  // Valid session token
  process.env.JWT_SECRET = 'a-super-secret-jwt-key-with-over-32-chars';
  const token = signAdminToken('mondo-admin');
  const authRes = await fetch(`${baseUrl}/api/v1/session`, {
    headers: { cookie: `${COOKIE_NAME}=${token}` }
  });
  assert.equal(authRes.status, 200);
  const authJson = await authRes.json();
  assert.equal(authJson.authenticated, true);
  assert.equal(authJson.user.username, 'mondo-admin');
  assert.equal(authJson.user.role, 'admin');
  assert.equal(Array.isArray(authJson.projects), true);
  assert.equal(typeof authJson.settings, 'object');
  assert.equal(Array.isArray(authJson.enquiries), true);
  assert.equal(typeof authJson.activity, 'object');
});

// ---------------------------------------------------------------------------
// 4. POST /api/v1/logout Contract
// ---------------------------------------------------------------------------
test('POST /api/v1/logout characterization: method, CSRF, and cookie clear header', async () => {
  // Method constraint
  const badMethod = await fetch(`${baseUrl}/api/v1/logout`, { method: 'GET' });
  assert.equal(badMethod.status, 405);
  assert.equal(badMethod.headers.get('allow'), 'POST');

  // CSRF block
  const csrfBlock = await fetch(`${baseUrl}/api/v1/logout`, {
    method: 'POST',
    headers: { origin: 'https://malicious.example.com', host: 'localhost' }
  });
  assert.equal(csrfBlock.status, 403);

  // Valid logout
  const res = await fetch(`${baseUrl}/api/v1/logout`, {
    method: 'POST',
    headers: { origin: baseUrl }
  });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);

  const setCookie = res.headers.get('set-cookie');
  assert.ok(setCookie);
  assert.match(setCookie, new RegExp(`${COOKIE_NAME}=;`));
  assert.match(setCookie, /Max-Age=0/i);
});

// ---------------------------------------------------------------------------
// 5. POST /api/v1/save Contract
// ---------------------------------------------------------------------------
test('POST /api/v1/save characterization: authorization, validation, and unconfigured response', async () => {
  // Method constraint
  const badMethod = await fetch(`${baseUrl}/api/v1/save`, { method: 'DELETE' });
  assert.equal(badMethod.status, 405);
  assert.equal(badMethod.headers.get('allow'), 'POST, PUT');

  // Unauthenticated
  const unauth = await fetch(`${baseUrl}/api/v1/save`, {
    method: 'POST',
    headers: { origin: baseUrl, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'project', data: defaultProjects[0] })
  });
  assert.equal(unauth.status, 403);
  const unauthJson = await unauth.json();
  assert.equal(unauthJson.error, 'Admin access required.');

  // Authenticated with unconfigured DB
  process.env.JWT_SECRET = 'a-super-secret-jwt-key-with-over-32-chars';
  const token = signAdminToken('admin');

  const saveProjectRes = await fetch(`${baseUrl}/api/v1/save`, {
    method: 'POST',
    headers: {
      origin: baseUrl,
      'Content-Type': 'application/json',
      cookie: `${COOKIE_NAME}=${token}`
    },
    body: JSON.stringify({ type: 'project', data: defaultProjects[0] })
  });
  // Since Supabase is not configured, expect 503
  assert.equal(saveProjectRes.status, 503);
  const saveJson = await saveProjectRes.json();
  assert.match(saveJson.error, /Database service is not configured/);

  // Validation failure (invalid project data)
  const invalidProjectRes = await fetch(`${baseUrl}/api/v1/save`, {
    method: 'POST',
    headers: {
      origin: baseUrl,
      'Content-Type': 'application/json',
      cookie: `${COOKIE_NAME}=${token}`
    },
    body: JSON.stringify({
      type: 'project',
      data: { id: '', slug: 'Invalid slug!!!', title: 'A' }
    })
  });
  // Without Supabase configured, saveProject checks isSupabaseConfigured() first and throws 503
  assert.equal(invalidProjectRes.status, 503);
});

// ---------------------------------------------------------------------------
// 6. POST /api/v1/upload Contract
// ---------------------------------------------------------------------------
test('POST /api/v1/upload characterization: auth, method, and payload size bounds', async () => {
  // Method constraints
  const badMethod = await fetch(`${baseUrl}/api/v1/upload`, { method: 'GET' });
  assert.equal(badMethod.status, 405);
  assert.equal(badMethod.headers.get('allow'), 'POST');

  // Unauthenticated
  const unauth = await fetch(`${baseUrl}/api/v1/upload`, {
    method: 'POST',
    headers: { origin: baseUrl }
  });
  assert.equal(unauth.status, 403);

  // Authenticated without valid multipart
  process.env.JWT_SECRET = 'a-super-secret-jwt-key-with-over-32-chars';
  const token = signAdminToken('admin');

  const nonMultipart = await fetch(`${baseUrl}/api/v1/upload`, {
    method: 'POST',
    headers: {
      origin: baseUrl,
      cookie: `${COOKIE_NAME}=${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ not: 'multipart' })
  });
  assert.equal(nonMultipart.status, 400);
  const nonMultiJson = await nonMultipart.json();
  assert.match(nonMultiJson.error, /Invalid multipart form data/);
});

// ---------------------------------------------------------------------------
// 7. /api/v1/enquiries Contract
// ---------------------------------------------------------------------------
test('/api/v1/enquiries characterization: methods, Content-Type, honeypot, and auth', async () => {
  // Method constraint on disallowed method
  const disallowed = await fetch(`${baseUrl}/api/v1/enquiries`, { method: 'PUT' });
  assert.equal(disallowed.status, 405);
  assert.equal(disallowed.headers.get('allow'), 'GET, POST, PATCH, DELETE');

  // POST without same-origin
  const csrf = await fetch(`${baseUrl}/api/v1/enquiries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin: 'https://evil.example.org',
      host: 'localhost'
    },
    body: JSON.stringify({})
  });
  assert.equal(csrf.status, 403);

  // POST with invalid Content-Type
  const wrongType = await fetch(`${baseUrl}/api/v1/enquiries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      origin: baseUrl
    },
    body: 'name=Test'
  });
  assert.equal(wrongType.status, 415);
  const wrongTypeJson = await wrongType.json();
  assert.equal(wrongTypeJson.error, 'Invalid request.');

  // Admin GET unauthenticated
  const unauthGet = await fetch(`${baseUrl}/api/v1/enquiries`);
  assert.equal(unauthGet.status, 403);

  // Admin GET authenticated
  process.env.JWT_SECRET = 'a-super-secret-jwt-key-with-over-32-chars';
  const token = signAdminToken('admin');
  const authGet = await fetch(`${baseUrl}/api/v1/enquiries`, {
    headers: { cookie: `${COOKIE_NAME}=${token}` }
  });
  assert.equal(authGet.status, 200);
  const authGetJson = await authGet.json();
  assert.equal(authGetJson.ok, true);
  assert.equal(Array.isArray(authGetJson.enquiries), true);

  // Admin PATCH missing id or status
  const badPatch = await fetch(`${baseUrl}/api/v1/enquiries`, {
    method: 'PATCH',
    headers: {
      origin: baseUrl,
      'Content-Type': 'application/json',
      cookie: `${COOKIE_NAME}=${token}`
    },
    body: JSON.stringify({})
  });
  assert.equal(badPatch.status, 400);

  // Admin DELETE missing id
  const badDelete = await fetch(`${baseUrl}/api/v1/enquiries`, {
    method: 'DELETE',
    headers: {
      origin: baseUrl,
      'Content-Type': 'application/json',
      cookie: `${COOKIE_NAME}=${token}`
    },
    body: JSON.stringify({})
  });
  assert.equal(badDelete.status, 400);
});

// ---------------------------------------------------------------------------
// 8. POST /api/v1/events Contract
// ---------------------------------------------------------------------------
test('POST /api/v1/events characterization: method, CSRF, validation, and 204 status', async () => {
  // Method constraints
  const badMethod = await fetch(`${baseUrl}/api/v1/events`, { method: 'GET' });
  assert.equal(badMethod.status, 405);
  assert.equal(badMethod.headers.get('allow'), 'POST');

  // CSRF block
  const csrf = await fetch(`${baseUrl}/api/v1/events`, {
    method: 'POST',
    headers: { origin: 'https://evil.test', host: 'localhost' }
  });
  assert.equal(csrf.status, 403);

  // Invalid event
  const invalid = await fetch(`${baseUrl}/api/v1/events`, {
    method: 'POST',
    headers: { origin: baseUrl, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'invalid_event_type' })
  });
  assert.equal(invalid.status, 400);

  // Valid event returns 204
  const valid = await fetch(`${baseUrl}/api/v1/events`, {
    method: 'POST',
    headers: { origin: baseUrl, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'trailer_play', slug: 'cat-battle' })
  });
  assert.equal(valid.status, 204);
  const text = await valid.text();
  assert.equal(text, '');
});

// ---------------------------------------------------------------------------
// 9. GET /api/v1/media Contract
// ---------------------------------------------------------------------------
test('GET /api/v1/media characterization: method constraints, path traversal rejection, and 404', async () => {
  // Method constraints
  const badMethod = await fetch(`${baseUrl}/api/v1/media`, { method: 'POST' });
  assert.equal(badMethod.status, 405);
  assert.equal(badMethod.headers.get('allow'), 'GET, HEAD');

  // HEAD is allowed (though key will be 404 if unconfigured)
  const headRes = await fetch(`${baseUrl}/api/v1/media?key=00000000-0000-0000-0000-000000000000.png`, {
    method: 'HEAD'
  });
  assert.equal(headRes.status, 404);

  // Path traversal attacks rejected
  const traversals = [
    '../../../etc/passwd',
    '..%2F..%2Fetc%2Fpasswd',
    'invalid..jpg',
    'image.exe',
    'image.php'
  ];
  for (const t of traversals) {
    const res = await fetch(`${baseUrl}/api/v1/media?key=${t}`);
    assert.equal(res.status, 404);
  }
});

test('teardown contract characterization test server', async () => {
  await new Promise((resolve) => server.close(resolve));
});
