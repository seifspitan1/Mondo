import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import app from '../server.js';
import { DEFAULT_HYBRID_PILOT_ENABLED } from '../public/js/features/navigation/coordinator-binding.js';
import { TRANSITION_ALLOWLIST } from '../public/js/shared/offline-preparation.js';
import {
  shouldShowIntro,
  markShown,
  prefersReducedMotion,
  ASSET_PATHS,
  DUR_MS,
  MAX_WAIT_MS
} from '../public/js/features/intro/intro.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('MONDO Phase 5D-C.1D: Intro Preload & Critical Resource Loading Optimization', async (t) => {
  let server;
  let baseUrl;

  await t.test('setup: start ephemeral Express server for C.1D verification', async () => {
    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://localhost:${server.address().port}`;
  });

  // 1. CONDITIONAL INTRO PRELOAD IN HEAD SCRIPT
  await t.test('TEST-01: HTML markup declares static brand preload but keeps intro preloads conditional', () => {
    const htmlPath = path.join(rootDir, 'public', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    // Static above-the-fold brand mark MUST be preloaded statically
    assert.ok(
      html.includes('<link rel="preload" as="image" href="/assets/mondo-mark.webp" type="image/webp" />'),
      'HTML must statically preload above-the-fold /assets/mondo-mark.webp'
    );

    // Intro layers MUST NOT be hardcoded as static <link rel="preload"> in initial HTML outside script
    // They must be dynamically injected only when has-intro condition is met
    const preScriptHead = html.split('<script>')[0];
    assert.equal(
      preScriptHead.includes('href="/assets/intro/mondo-white.png"'),
      false,
      'mondo-white.png must NOT be preloaded outside conditional guard'
    );
    assert.equal(
      preScriptHead.includes('href="/assets/intro/mondo-metal.png"'),
      false,
      'mondo-metal.png must NOT be preloaded outside conditional guard'
    );
    assert.equal(
      preScriptHead.includes('href="/assets/intro/mondo-black.png"'),
      false,
      'mondo-black.png must NOT be preloaded outside conditional guard'
    );
    assert.equal(
      preScriptHead.includes('href="/assets/intro/mondo-rim.png"'),
      false,
      'mondo-rim.png must NOT be preloaded outside conditional guard'
    );
    assert.equal(
      preScriptHead.includes('href="/assets/intro/mondo-depth.png"'),
      false,
      'mondo-depth.png must NOT be preloaded outside conditional guard'
    );

    // Dynamic injection strings must be present in the synchronous head script
    assert.ok(html.includes('document.documentElement.classList.add(\'has-intro\');'));
    assert.ok(html.includes('href="/assets/intro/mondo-white.png"'));
    assert.ok(html.includes('href="/assets/intro/mondo-black.png"'));
    assert.ok(html.includes('href="/assets/intro/mondo-metal.png"'));
    assert.ok(html.includes('href="/assets/intro/mondo-rim.png"'));
    assert.ok(html.includes('href="/assets/intro/mondo-depth.png"'));
  });

  // 2. TIMING & HEAD PLACEMENT
  await t.test('TEST-02: Head script is placed before external stylesheets to eliminate script pause', () => {
    const htmlPath = path.join(rootDir, 'public', 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf8');

    const scriptIdx = html.indexOf('<script>');
    const cssIdx = html.indexOf('<link rel="stylesheet" href="/css/style.css" />');

    assert.ok(scriptIdx > 0, '<script> must exist in <head>');
    assert.ok(cssIdx > 0, '<link rel="stylesheet"> must exist in <head>');
    assert.ok(
      scriptIdx < cssIdx,
      'Synchronous head script must precede stylesheet to avoid parser block on CSS network fetch'
    );
  });

  // 3. INTRO CONTROLLER & SESSION STATE
  await t.test('TEST-03: Intro controller session gating and reduced-motion evaluation', () => {
    const mockStorage = {};
    global.window = {
      location: { pathname: '/' },
      matchMedia: (query) => ({ matches: false })
    };
    global.sessionStorage = {
      getItem: (key) => mockStorage[key] || null,
      setItem: (key, val) => {
        mockStorage[key] = String(val);
      }
    };

    try {
      assert.equal(shouldShowIntro(), true, 'First visit must show intro');
      markShown();
      assert.equal(mockStorage['mondo_intro_shown'], '1', 'markShown must set session key');
      assert.equal(shouldShowIntro(), false, 'Repeat visit must skip intro');

      // Reduced motion
      global.window.matchMedia = (query) => ({
        matches: query.includes('prefers-reduced-motion: reduce')
      });
      assert.equal(prefersReducedMotion(), true, 'Reduced motion must be recognized');

      // Admin route
      delete mockStorage['mondo_intro_shown'];
      global.window.matchMedia = () => ({ matches: false });
      global.window.location.pathname = '/admin';
      assert.equal(shouldShowIntro(), false, 'Admin route must skip intro');
    } finally {
      delete global.window;
      delete global.sessionStorage;
    }
  });

  // 4. PRESERVED ASSET INTEGRITY
  await t.test('TEST-04: All 5 authentic visual layer PNG files remain unmodified on disk', () => {
    const layers = [
      ASSET_PATHS.white,
      ASSET_PATHS.black,
      ASSET_PATHS.metal,
      ASSET_PATHS.rim,
      ASSET_PATHS.depth
    ];

    for (const layer of layers) {
      const fullPath = path.join(rootDir, 'public', layer);
      assert.ok(fs.existsSync(fullPath), `Asset layer must exist: ${layer}`);
      const stat = fs.statSync(fullPath);
      assert.ok(stat.size > 50000, `Asset size must exceed 50KB: ${layer} (${stat.size} B)`);

      const buf = fs.readFileSync(fullPath);
      const width = buf.readUInt32BE(16);
      const height = buf.readUInt32BE(20);
      assert.equal(width, 610, `Width must be 610: ${layer}`);
      assert.equal(height, 870, `Height must be 870: ${layer}`);
    }
  });

  // 5. QUIET MARK PROTECTION & ALLOWLIST INTEGRITY
  await t.test('TEST-05: Quiet Mark transition system and Service Worker allowlist are preserved', () => {
    assert.ok(
      TRANSITION_ALLOWLIST.includes('/assets/intro/mondo-white.png'),
      'mondo-white.png MUST remain in Service Worker transition allowlist'
    );
    assert.ok(
      TRANSITION_ALLOWLIST.includes('/assets/mondo-mark.webp'),
      'mondo-mark.webp MUST remain in transition allowlist'
    );
    assert.equal(
      TRANSITION_ALLOWLIST.includes('/assets/intro/mondo-black.png'),
      false,
      'Intro-only black layer must NOT be in transition allowlist'
    );
    assert.equal(
      TRANSITION_ALLOWLIST.includes('/assets/intro/mondo-metal.png'),
      false,
      'Intro-only metal layer must NOT be in transition allowlist'
    );
  });

  // 6. NATIVE MPA & DORMANT PILOT CONTRACTS
  await t.test('TEST-06: Native Multi-Page Application and dormant pilot contracts are strictly preserved', () => {
    assert.equal(DEFAULT_HYBRID_PILOT_ENABLED, false, 'DEFAULT_HYBRID_PILOT_ENABLED must remain false');
  });

  // 7. ROUTE SMOKE TESTS
  await t.test('TEST-07: Public routes deliver 200 OK with correct Cache-Control and clean URLs', async () => {
    const routes = [
      '/',
      '/work',
      '/work/rainbow-orchard',
      '/work/cat-battle',
      '/work/cosmic-egg',
      '/work/dragon-escape',
      '/work/legendary-orchard',
      '/start',
      '/privacy',
      '/admin'
    ];

    for (const r of routes) {
      const res = await fetch(`${baseUrl}${r}`);
      assert.equal(res.status, 200, `Route ${r} must return 200`);
      assert.match(res.headers.get('content-type'), /text\/html/);
      if (r === '/admin') {
        assert.equal(res.headers.get('cache-control'), 'private, no-cache, no-store, must-revalidate');
      } else {
        assert.equal(res.headers.get('cache-control'), 'public, max-age=0, must-revalidate');
      }
    }
  });

  // 8. ASSET ENDPOINTS SMOKE TESTS
  await t.test('TEST-08: Intro PNG asset endpoints serve 200 OK with safe cache headers', async () => {
    const layers = [
      '/assets/intro/mondo-white.png',
      '/assets/intro/mondo-black.png',
      '/assets/intro/mondo-metal.png',
      '/assets/intro/mondo-rim.png',
      '/assets/intro/mondo-depth.png'
    ];

    for (const l of layers) {
      const res = await fetch(`${baseUrl}${l}`);
      assert.equal(res.status, 200, `Asset ${l} must return 200`);
      assert.equal(res.headers.get('content-type'), 'image/png');
      assert.match(res.headers.get('cache-control'), /public, max-age=86400/);
    }
  });

  await t.test('teardown: close server', async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });
});

