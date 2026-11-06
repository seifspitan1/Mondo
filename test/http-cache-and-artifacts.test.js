import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import app from '../server.js';
import { DEFAULT_HYBRID_PILOT_ENABLED } from '../public/js/features/navigation/coordinator-binding.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'public', 'dist');

test('MONDO Phase 5D-C.1C: HTTP Cache-Control, CDN Headers & Artifact Safety', async (t) => {
  let server;
  let baseUrl;

  await t.test('setup: start ephemeral Express server for cache verification', async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://localhost:${server.address().port}`;
  });

  // 1. VERCEL.JSON CONFIGURATION INTEGRITY
  await t.test('TEST-01: vercel.json configuration preserves cleanUrls and rewrite contracts', () => {
    const vercelConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'vercel.json'), 'utf8'));
    assert.equal(vercelConfig.version, 2, 'vercel.json version must be 2');
    assert.equal(vercelConfig.cleanUrls, true, 'cleanUrls must remain true');
    assert.ok(Array.isArray(vercelConfig.rewrites), 'rewrites must be an array');
    assert.equal(vercelConfig.rewrites.length, 10, 'All 10 required rewrite rules must be present');

    const projectRewrite = vercelConfig.rewrites.find((r) => r.source === '/work/:slug');
    assert.ok(projectRewrite, 'Rewrite for /work/:slug must exist');
    assert.equal(projectRewrite.destination, '/work/project', 'Destination must be clean URL /work/project');

    for (const r of vercelConfig.rewrites) {
      if (typeof r.destination === 'string') {
        assert.equal(
          r.destination.endsWith('.html'),
          false,
          `Rewrite destination must NOT end in .html with cleanUrls: true (${r.source} -> ${r.destination})`
        );
      }
    }
  });

  await t.test('TEST-02: vercel.json configures safe, non-immutable headers for /sw.js', () => {
    const vercelConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'vercel.json'), 'utf8'));
    const swHeaderRule = vercelConfig.headers.find((h) => h.source === '/sw.js');
    assert.ok(swHeaderRule, '/sw.js header rule must exist in vercel.json');

    const cc = swHeaderRule.headers.find((h) => h.key.toLowerCase() === 'cache-control');
    assert.ok(cc, 'Cache-Control header must be defined for /sw.js');
    assert.equal(cc.value, 'public, max-age=0, must-revalidate', '/sw.js must revalidate immediately');
    assert.ok(!cc.value.includes('immutable'), '/sw.js must NEVER be immutable');

    const swAllowed = swHeaderRule.headers.find((h) => h.key.toLowerCase() === 'service-worker-allowed');
    assert.ok(swAllowed, 'Service-Worker-Allowed header must be defined for /sw.js');
    assert.equal(swAllowed.value, '/');
  });

  await t.test('TEST-03: vercel.json distinguishes hashed immutable from unhashed mutable dist assets', () => {
    const vercelConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'vercel.json'), 'utf8'));

    // General unhashed dist rule
    const generalDist = vercelConfig.headers.find((h) => h.source === '/dist/(.*)');
    assert.ok(generalDist, '/dist/(.*) rule must exist');
    const generalCc = generalDist.headers.find((h) => h.key.toLowerCase() === 'cache-control');
    assert.equal(generalCc.value, 'public, max-age=0, must-revalidate');
    assert.ok(!generalCc.value.includes('immutable'), 'General dist bundles must NOT be immutable');

    // Hashed dist rule
    const hashedDist = vercelConfig.headers.find((h) => h.source.includes('[0-9a-f]{8}'));
    assert.ok(hashedDist, 'Content-hashed asset rule must exist');
    const hashedCc = hashedDist.headers.find((h) => h.key.toLowerCase() === 'cache-control');
    assert.match(hashedCc.value, /immutable/, 'Hashed assets must specify immutable');
    assert.match(hashedCc.value, /max-age=31536000/, 'Hashed assets must specify 1-year max-age');
  });

  await t.test('TEST-04: vercel.json configures revalidation headers for public HTML documents', () => {
    const vercelConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'vercel.json'), 'utf8'));
    const htmlRoutes = ['/', '/work', '/work/:slug', '/start', '/privacy'];

    for (const route of htmlRoutes) {
      const rule = vercelConfig.headers.find((h) => h.source === route);
      assert.ok(rule, `HTML route header rule for "${route}" must exist in vercel.json`);
      const cc = rule.headers.find((h) => h.key.toLowerCase() === 'cache-control');
      assert.equal(cc.value, 'public, max-age=0, must-revalidate', `${route} must require revalidation`);
    }
  });

  await t.test('TEST-05: vercel.json protects admin workspace from shared and browser caching', () => {
    const vercelConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'vercel.json'), 'utf8'));
    const adminRule = vercelConfig.headers.find((h) => h.source.startsWith('/admin'));
    assert.ok(adminRule, 'Admin header rule must exist in vercel.json');

    const cc = adminRule.headers.find((h) => h.key.toLowerCase() === 'cache-control');
    assert.equal(cc.value, 'private, no-cache, no-store, must-revalidate');
  });

  // 2. SERVER.JS RUNTIME CACHE-CONTROL VERIFICATION
  await t.test('TEST-06: Server delivers /sw.js with revalidation and Service-Worker-Allowed headers', async () => {
    const res = await fetch(`${baseUrl}/sw.js`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /application\/javascript/);
    assert.equal(res.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
    assert.equal(res.headers.get('service-worker-allowed'), '/');
  });

  await t.test('TEST-07: Server delivers content-hashed bundles with immutable caching', async () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(distDir, 'manifest.json'), 'utf8'));
    const cssHashed = manifest.bundles['css/style.css'].hashed;
    const siteHashed = manifest.bundles['js/site.js'].hashed;

    const resCss = await fetch(`${baseUrl}${cssHashed}`);
    assert.equal(resCss.status, 200);
    assert.match(resCss.headers.get('cache-control'), /public, max-age=31536000, immutable/);

    const resSite = await fetch(`${baseUrl}${siteHashed}`);
    assert.equal(resSite.status, 200);
    assert.match(resSite.headers.get('cache-control'), /public, max-age=31536000, immutable/);
  });

  await t.test('TEST-08: Server delivers unhashed bundles with immediate revalidation, NOT stale caching', async () => {
    const resCss = await fetch(`${baseUrl}/dist/css/style.bundle.css`);
    assert.equal(resCss.status, 200);
    const ccCss = resCss.headers.get('cache-control');
    assert.equal(ccCss, 'public, max-age=0, must-revalidate');
    assert.ok(!ccCss.includes('immutable'), 'Unhashed style.bundle.css must NOT be immutable');

    const resSite = await fetch(`${baseUrl}/dist/js/site.bundle.js`);
    assert.equal(resSite.status, 200);
    const ccSite = resSite.headers.get('cache-control');
    assert.equal(ccSite, 'public, max-age=0, must-revalidate');
    assert.ok(!ccSite.includes('immutable'), 'Unhashed site.bundle.js must NOT be immutable');

    const resRootCss = await fetch(`${baseUrl}/css/style.css`);
    assert.equal(resRootCss.status, 200);
    assert.equal(resRootCss.headers.get('cache-control'), 'public, max-age=0, must-revalidate');

    const resRootJs = await fetch(`${baseUrl}/js/site.js`);
    assert.equal(resRootJs.status, 200);
    assert.equal(resRootJs.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
  });

  await t.test('TEST-09: Server delivers HTML routes with immediate revalidation headers', async () => {
    const routes = ['/', '/work', '/work/rainbow-orchard', '/start', '/privacy'];
    for (const r of routes) {
      const res = await fetch(`${baseUrl}${r}`);
      assert.equal(res.status, 200, `Route ${r} must return 200`);
      assert.match(res.headers.get('content-type'), /text\/html/);
      assert.equal(
        res.headers.get('cache-control'),
        'public, max-age=0, must-revalidate',
        `${r} must have revalidation header`
      );
    }
  });

  await t.test('TEST-10: Server delivers /admin with private no-store headers', async () => {
    const res = await fetch(`${baseUrl}/admin`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('cache-control'), /private/);
    assert.match(res.headers.get('cache-control'), /no-store/);
  });

  // 3. API CACHE-CONTROL VERIFICATION
  await t.test('TEST-11: GET /api/v1/load returns 60s shared CDN cache header with SWR', async () => {
    const res = await fetch(`${baseUrl}/api/v1/load`);
    assert.equal(res.status, 200);
    const cc = res.headers.get('cache-control');
    assert.equal(cc, 'public, s-maxage=60, stale-while-revalidate=300');

    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(Array.isArray(body.projects), 'projects array must be returned');
    assert.ok(body.settings, 'settings object must be returned');
  });

  await t.test('TEST-12: Private API endpoints return private, uncacheable headers', async () => {
    const resSession = await fetch(`${baseUrl}/api/v1/session`);
    assert.match(resSession.headers.get('cache-control'), /private/);
    assert.match(resSession.headers.get('cache-control'), /no-store/);

    const resEnquiries = await fetch(`${baseUrl}/api/v1/enquiries`);
    assert.match(resEnquiries.headers.get('cache-control'), /private/);
    assert.match(resEnquiries.headers.get('cache-control'), /no-store/);
  });

  // 4. BUILD ARTIFACT SAFETY & PRUNING VERIFICATION
  await t.test('TEST-13: public/dist contains zero stale, unreferenced historical hashed bundles', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(distDir, 'manifest.json'), 'utf8'));
    const activeFiles = new Set(['manifest.json']);

    for (const b of Object.values(manifest.bundles)) {
      if (b.canonical) activeFiles.add(path.basename(b.canonical));
      if (b.hashed) activeFiles.add(path.basename(b.hashed));
    }

    const cssFiles = fs.readdirSync(path.join(distDir, 'css'));
    for (const f of cssFiles) {
      assert.ok(activeFiles.has(f), `Unexpected CSS file in dist: ${f}`);
    }

    const jsFiles = fs.readdirSync(path.join(distDir, 'js'));
    for (const f of jsFiles) {
      assert.ok(activeFiles.has(f), `Unexpected JS file in dist: ${f}`);
    }

    // Verify exactly 1 CSS canonical + 1 CSS hashed
    assert.equal(cssFiles.length, 2, 'Must have exactly 2 CSS bundles in public/dist/css');
    // Verify exactly 7 JS canonical + 7 JS hashed
    assert.equal(jsFiles.length, 14, 'Must have exactly 14 JS bundles in public/dist/js');
  });

  await t.test('TEST-14: Service Worker transition allowlist assets are all reachable with safe headers', async () => {
    const allowlist = [
      '/assets/intro/mondo-white.png',
      '/css/style.css',
      '/js/site.js',
      '/assets/mondo-wordmark.svg',
      '/assets/facet-button-left.svg',
      '/assets/facet-button-right.svg',
      '/assets/facet-button-secondary-left.svg',
      '/assets/facet-button-sec.svg',
      '/assets/mondo-mark.webp'
    ];

    for (const assetPath of allowlist) {
      const res = await fetch(`${baseUrl}${assetPath}`);
      assert.equal(res.status, 200, `Allowlist asset ${assetPath} must be accessible (200)`);
      const cc = res.headers.get('cache-control');
      assert.ok(cc, `Allowlist asset ${assetPath} must have Cache-Control header`);
      assert.ok(!cc.includes('no-store'), `Allowlist asset ${assetPath} must not be no-store`);
    }
  });

  await t.test('TEST-15: DEFAULT_HYBRID_PILOT_ENABLED remains strictly false', () => {
    assert.equal(DEFAULT_HYBRID_PILOT_ENABLED, false);
  });

  await t.test('teardown: close server', async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });
});
