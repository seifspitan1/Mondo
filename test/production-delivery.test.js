import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import app from '../server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'public', 'dist');

test('Production Delivery Smoke Tests', async (t) => {
  let server;
  let baseUrl;

  await t.test('setup: start ephemeral Express server', async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://localhost:${server.address().port}`;
  });

  await t.test('manifest.json exists and has valid bundle records', () => {
    const manifestPath = path.join(distDir, 'manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'manifest.json must exist');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.ok(manifest.generatedAt, 'manifest must have generatedAt');
    assert.ok(manifest.bundles['css/style.css'], 'manifest must map css/style.css');
    assert.ok(manifest.bundles['js/home.js'], 'manifest must map js/home.js');
    assert.ok(manifest.bundles['js/site.js'], 'manifest must map js/site.js');
    assert.ok(manifest.bundles['js/admin.js'], 'manifest must map js/admin.js');
  });

  await t.test('server delivers compiled CSS bundle for /css/style.css with caching headers', async () => {
    const res = await fetch(`${baseUrl}/css/style.css`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/css/);
    assert.match(res.headers.get('cache-control'), /public, max-age=3600/);
    const body = await res.text();
    assert.ok(body.length > 40000, 'Compiled CSS should be > 40KB minified');
  });

  await t.test('server delivers raw modular source for /css/style.css when ?source=1 is requested', async () => {
    const res = await fetch(`${baseUrl}/css/style.css?source=1`);
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.ok(body.includes('@import'), 'Source style.css must contain @import declarations');
    assert.ok(body.length < 5000, 'Source style.css aggregator should be < 5KB');
  });

  await t.test('server delivers compiled JS bundles for entry points', async () => {
    const entries = ['home', 'site', 'intro', 'work', 'project', 'start', 'admin'];
    for (const entry of entries) {
      const res = await fetch(`${baseUrl}/js/${entry}.js`);
      assert.equal(res.status, 200, `Entry /js/${entry}.js must return 200`);
      assert.match(res.headers.get('content-type'), /javascript/);
      assert.match(res.headers.get('cache-control'), /public, max-age=3600/);
      const body = await res.text();
      assert.ok(body.length > 500, `${entry} bundle must have compiled content`);
    }
  });

  await t.test('server delivers content-hashed immutable assets under /dist/', async () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(distDir, 'manifest.json'), 'utf8'));
    const cssHashedUrl = manifest.bundles['css/style.css'].hashed;
    const res = await fetch(`${baseUrl}${cssHashedUrl}`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('cache-control'), /max-age=31536000|immutable/);
  });

  await t.test('clean URL rewrites resolve correctly', async () => {
    const routes = ['/work', '/start', '/privacy', '/admin', '/work/rainbow-orchard'];
    for (const r of routes) {
      const res = await fetch(`${baseUrl}${r}`);
      assert.equal(res.status, 200, `Route ${r} must resolve with 200`);
      assert.match(res.headers.get('content-type'), /text\/html/);
    }
  });

  await t.test('teardown: close server', async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });
});
