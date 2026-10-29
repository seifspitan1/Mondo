import { test } from 'node:test';
import assert from 'node:assert/strict';
import app from '../server.js';
import { defaultProjects, defaultSettings } from '../lib/defaults.js';
import { signAdminToken, COOKIE_NAME } from '../lib/auth.js';

let server;
let baseUrl;

test('setup express server for testing', async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test('GET / serves homepage HTML', async () => {
  const res = await fetch(`${baseUrl}/`);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /Make your<br \/>game the<br \/><span>next click\.<\/span>/);
  assert.match(text, /MONDO LAB/);
  assert.match(text, /Rainbow Orchard/);
});

test('GET /work serves work portfolio HTML', async () => {
  const res = await fetch(`${baseUrl}/work`);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /Ideas that<br \/><span>play bigger\.<\/span>/);
  assert.match(text, /Rainbow Orchard/);
});

test('GET /work/:slug serves project detail HTML', async () => {
  const res = await fetch(`${baseUrl}/work/rainbow-orchard`);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /Project Details — MONDO/);
  assert.match(text, /project\.js/);
});

test('GET /start serves enquiry form HTML', async () => {
  const res = await fetch(`${baseUrl}/start`);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /Your game\.<br \/>Our next<br \/><span>big idea\.<\/span>/);
  assert.match(text, /Send my project brief/);
});

test('GET /privacy serves privacy notice HTML', async () => {
  const res = await fetch(`${baseUrl}/privacy`);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /Privacy,<br \/><span>plain and simple\.<\/span>/);
});

test('GET /admin serves admin panel HTML', async () => {
  const res = await fetch(`${baseUrl}/admin`);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.match(text, /Studio Workspace — MONDO/);
  assert.match(text, /admin\.js/);
});

test('GET /api/v1/load returns published projects and settings without private data', async () => {
  const res = await fetch(`${baseUrl}/api/v1/load`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.ok, true);
  assert.equal(Array.isArray(data.projects), true);
  assert.equal(data.projects.length, 5);
  assert.equal(data.enquiries, undefined);
  assert.equal(data.settings.tagline, defaultSettings.tagline);
});

test('POST /api/v1/events records activity events with 204 status', async () => {
  const res = await fetch(`${baseUrl}/api/v1/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin: baseUrl
    },
    body: JSON.stringify({ type: 'project_open', slug: 'cat-battle' })
  });
  assert.equal(res.status, 204);
});

test('unauthenticated admin operations are strictly rejected with 403', async () => {
  // Save project without token
  const saveRes = await fetch(`${baseUrl}/api/v1/save`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      origin: baseUrl
    },
    body: JSON.stringify(defaultProjects[0])
  });
  assert.equal(saveRes.status, 403);

  // Get enquiries without token
  const getEnquiriesRes = await fetch(`${baseUrl}/api/v1/enquiries`, {
    headers: { origin: baseUrl }
  });
  assert.equal(getEnquiriesRes.status, 403);

  // Update enquiry without token
  const patchRes = await fetch(`${baseUrl}/api/v1/enquiries`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      origin: baseUrl
    },
    body: JSON.stringify({ id: crypto.randomUUID(), status: 'Quoted' })
  });
  assert.equal(patchRes.status, 403);

  // Upload without token
  const uploadRes = await fetch(`${baseUrl}/api/v1/upload`, {
    method: 'POST',
    headers: { origin: baseUrl }
  });
  assert.equal(uploadRes.status, 403);
});

test('GET /api/v1/session returns authenticated: false when no cookie is sent', async () => {
  const res = await fetch(`${baseUrl}/api/v1/session`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.authenticated, false);
});

test('GET /api/v1/session returns full dashboard data when valid admin token is present', async () => {
  process.env.JWT_SECRET = 'a-secure-jwt-secret-for-session-testing-32chars';
  const token = signAdminToken('test-admin');

  const res = await fetch(`${baseUrl}/api/v1/session`, {
    headers: {
      cookie: `${COOKIE_NAME}=${token}`
    }
  });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.authenticated, true);
  assert.equal(data.user.username, 'test-admin');
  assert.equal(Array.isArray(data.projects), true);
  assert.equal(data.projects.length >= 5, true);
  assert.equal(typeof data.activity, 'object');
});

test('teardown server', async () => {
  await new Promise((resolve) => server.close(resolve));
});
