import { test } from 'node:test';
import assert from 'node:assert/strict';
import app from '../server.js';
import { escapeHtml, renderProjectCard } from '../public/js/site.js';
import { defaultProjects, defaultSettings } from '../lib/defaults.js';
import { getProjects, getProjectBySlug, getSettings } from '../lib/content.js';

let server;
let baseUrl;

test('setup characterization test server', async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

// 1. HTTP 405 Method Not Allowed contracts on API endpoints
test('API handlers enforce HTTP method constraints with 405 and Allow header', async () => {
  const endpoints = [
    { url: '/api/v1/load', method: 'POST', allowed: 'GET' },
    { url: '/api/v1/login', method: 'GET', allowed: 'POST' },
    { url: '/api/v1/logout', method: 'GET', allowed: 'POST' },
    { url: '/api/v1/save', method: 'GET', allowed: 'POST, PUT' },
    { url: '/api/v1/upload', method: 'GET', allowed: 'POST' },
    { url: '/api/v1/events', method: 'GET', allowed: 'POST' },
    { url: '/api/v1/session', method: 'POST', allowed: 'GET' }
  ];

  for (const ep of endpoints) {
    const res = await fetch(`${baseUrl}${ep.url}`, { method: ep.method });
    assert.equal(res.status, 405, `Expected 405 for ${ep.method} ${ep.url}`);
    const allow = res.headers.get('allow');
    assert.ok(allow, `Missing Allow header for ${ep.url}`);
    assert.equal(allow, ep.allowed);
  }
});

// 2. HTTP 415 on /api/v1/enquiries when Content-Type is not application/json
test('POST /api/v1/enquiries rejects non-JSON content-type with 415', async () => {
  const res = await fetch(`${baseUrl}/api/v1/enquiries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain',
      origin: baseUrl
    },
    body: 'plain-text'
  });
  assert.equal(res.status, 415);
  const json = await res.json();
  assert.equal(json.error, 'Invalid request.');
});

// 3. /api/v1/media rejects invalid or malformed keys with 404
test('GET /api/v1/media rejects invalid or missing keys with 404', async () => {
  const invalidKeys = [
    '',
    '../../etc/passwd',
    '../test.png',
    'invalid_format.exe',
    'non-hex-uuid.jpg'
  ];

  for (const key of invalidKeys) {
    const res = await fetch(`${baseUrl}/api/v1/media?key=${encodeURIComponent(key)}`);
    assert.equal(res.status, 404);
  }
});

// 4. Server 404 fallback route behavior
test('unknown non-existent routes return 404 status code', async () => {
  const res = await fetch(`${baseUrl}/non-existent-page-xyz-123`);
  assert.equal(res.status, 404);
});

// 5. escapeHtml characterization tests
test('escapeHtml safely escapes XML/HTML control characters', () => {
  assert.equal(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  assert.equal(escapeHtml("Tom & Jerry's"), 'Tom &amp; Jerry&#039;s');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(12345), '12345');
});

// 6. renderProjectCard output characterization
test('renderProjectCard generates expected markup and local srcset', () => {
  const localProject = defaultProjects[0]; // rainbow-orchard
  const html = renderProjectCard(localProject, 0);

  assert.match(html, /class="project-card"/);
  assert.match(html, /href="\/work\/rainbow-orchard"/);
  assert.match(html, /rainbow-orchard-small\.webp 800w/);
  assert.match(html, /loading="eager"/); // index 0 is eager
  assert.match(html, /class="concept-label"/);

  const lazyProject = defaultProjects[4]; // 5th item
  const lazyHtml = renderProjectCard(lazyProject, 4);
  assert.match(lazyHtml, /loading="lazy"/);
});

// 7. Content repository read contracts
test('content module falls back gracefully to defaults when database is unconfigured', async () => {
  const projects = await getProjects(false);
  assert.equal(projects.length, 5);
  assert.equal(projects[0].slug, 'rainbow-orchard');

  const single = await getProjectBySlug('cat-battle');
  assert.ok(single);
  assert.equal(single.title, 'Cat Battles');

  const missing = await getProjectBySlug('non-existent-project');
  assert.equal(missing, null);

  const settings = await getSettings();
  assert.equal(settings.packages.length, 6);
  assert.equal(settings.services.length, 3);
  assert.equal(settings.faqs.length, 6);
});

test('teardown characterization test server', async () => {
  await new Promise((resolve) => server.close(resolve));
});
