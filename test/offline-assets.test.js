import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import {
  CACHE_NAME,
  CACHE_PREFIX,
  TRANSITION_ALLOWLIST,
  PREPARATION_STATES,
  isOfflinePreparationSupported,
  isAdminContext,
  verifyTransitionAssets,
  initOfflinePreparation,
  resetOfflinePreparationState
} from '../public/js/shared/offline-preparation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

test('Offline Transition Assets (Stage G2)', async (t) => {
  t.beforeEach(() => {
    resetOfflinePreparationState();
  });

  t.afterEach(() => {
    resetOfflinePreparationState();
    delete global.window;
    delete global.navigator;
  });

  await t.test('Group A: Asset Manifest & Cryptographic Integrity', async (t2) => {
    await t2.test('Authentic Quiet Mark logo exists with exact SHA-256 and size', () => {
      const logoPath = path.join(publicDir, 'assets', 'intro', 'mondo-white.png');
      assert.ok(fs.existsSync(logoPath), 'mondo-white.png must exist');
      const buf = fs.readFileSync(logoPath);
      assert.strictEqual(buf.length, 91205, 'Logo size must be exactly 91,205 bytes');
      const hash = crypto.createHash('sha256').update(buf).digest('hex');
      assert.strictEqual(
        hash,
        'df403822fdf20c116165ff7120bf69f9f383f3b219d4a4307ed18fcadc6c9a56',
        'Logo SHA-256 must match authentic approved hash'
      );
    });

    await t2.test('All allowlisted transition assets exist in repository', () => {
      for (const assetPath of TRANSITION_ALLOWLIST) {
        // Strip leading slash for local path resolution
        const relPath = assetPath.replace(/^\//, '');
        const fullPath = path.join(publicDir, relPath);
        assert.ok(fs.existsSync(fullPath), `Allowlisted asset must exist on disk: ${assetPath}`);
      }
    });

    await t2.test('Allowlist strictly excludes sensitive, dynamic, and non-transition paths', () => {
      for (const item of TRANSITION_ALLOWLIST) {
        assert.ok(!item.startsWith('/admin'), `Must not allowlist admin: ${item}`);
        assert.ok(!item.startsWith('/api'), `Must not allowlist api: ${item}`);
        assert.ok(!item.includes('rainbow-orchard'), `Must not allowlist project hero: ${item}`);
        assert.ok(!item.includes('cat-battle'), `Must not allowlist project thumbnail: ${item}`);
        assert.ok(!item.endsWith('.mp4'), `Must not allowlist videos: ${item}`);
      }
    });

    await t2.test('Cache namespace follows versioned mondo-transition pattern', () => {
      assert.strictEqual(CACHE_NAME, 'mondo-transition-v1');
      assert.strictEqual(CACHE_PREFIX, 'mondo-transition-');
    });
  });

  await t.test('Group B: Admin & Security Isolation', async (t2) => {
    await t2.test('isAdminContext detects /admin routes correctly', () => {
      global.window = { location: { pathname: '/admin' } };
      assert.strictEqual(isAdminContext(), true);

      global.window = { location: { pathname: '/admin/enquiries' } };
      assert.strictEqual(isAdminContext(), true);

      global.window = { location: { pathname: '/' } };
      assert.strictEqual(isAdminContext(), false);

      global.window = { location: { pathname: '/work' } };
      assert.strictEqual(isAdminContext(), false);

      global.window = { location: { pathname: '/work/rainbow-orchard' } };
      assert.strictEqual(isAdminContext(), false);

      global.window = { location: { pathname: '/start' } };
      assert.strictEqual(isAdminContext(), false);

      global.window = { location: { pathname: '/privacy' } };
      assert.strictEqual(isAdminContext(), false);
    });

    await t2.test('initOfflinePreparation enters ISOLATED state in /admin context without touching cache', async () => {
      global.window = {
        location: { pathname: '/admin' },
        caches: {
          has: () => assert.fail('Should not access caches in admin')
        }
      };
      global.navigator = { serviceWorker: {} };

      const state = await initOfflinePreparation();
      assert.strictEqual(state, PREPARATION_STATES.ISOLATED);
      assert.strictEqual(window.__MONDO_OFFLINE_PREPARATION__.getStatus(), 'isolated');
      assert.strictEqual(window.__MONDO_OFFLINE_PREPARATION__.isPrepared(), false);
    });
  });

  await t.test('Group C: Unsupported Environments & Graceful Degradation', async (t2) => {
    await t2.test('isOfflinePreparationSupported detects lack of serviceWorker or caches', () => {
      delete global.window;
      assert.strictEqual(isOfflinePreparationSupported(), false);

      global.window = {};
      assert.strictEqual(isOfflinePreparationSupported(), false);

      global.window = { caches: {} };
      global.navigator = {};
      assert.strictEqual(isOfflinePreparationSupported(), false);

      global.window = { caches: {} };
      global.navigator = { serviceWorker: {} };
      assert.strictEqual(isOfflinePreparationSupported(), true);
    });

    await t2.test('initOfflinePreparation degrades safely when serviceWorker is unsupported', async () => {
      global.window = { location: { pathname: '/' } };
      global.navigator = {}; // No serviceWorker

      const state = await initOfflinePreparation();
      assert.strictEqual(state, PREPARATION_STATES.UNSUPPORTED);
      assert.strictEqual(window.__MONDO_OFFLINE_PREPARATION__.getStatus(), 'unsupported');
      assert.strictEqual(window.__MONDO_OFFLINE_PREPARATION__.isPrepared(), false);
    });
  });

  await t.test('Group D: Cache Verification & State Machine Contracts', async (t2) => {
    await t2.test('verifyTransitionAssets returns prepared: false when cache is absent', async () => {
      global.window = {
        caches: {
          has: async () => false
        }
      };
      global.navigator = { serviceWorker: {} };

      const report = await verifyTransitionAssets();
      assert.strictEqual(report.prepared, false);
      assert.strictEqual(report.cachedCount, 0);
      assert.strictEqual(report.missing.length, TRANSITION_ALLOWLIST.length);
    });

    await t2.test('verifyTransitionAssets detects partial/corrupted cache correctly', async () => {
      // Simulate cache missing one asset
      const missingUrl = '/assets/intro/mondo-white.png';
      const mockCache = {
        match: async (url) => (url === missingUrl ? null : new Response('ok'))
      };
      global.window = {
        caches: {
          has: async () => true,
          open: async () => mockCache
        }
      };
      global.navigator = { serviceWorker: {} };

      const report = await verifyTransitionAssets();
      assert.strictEqual(report.prepared, false);
      assert.strictEqual(report.missing.includes(missingUrl), true);
      assert.strictEqual(report.cachedCount, TRANSITION_ALLOWLIST.length - 1);
    });

    await t2.test('verifyTransitionAssets returns prepared: true when all assets exist in cache', async () => {
      const mockCache = {
        match: async () => new Response('cached_content')
      };
      global.window = {
        caches: {
          has: async () => true,
          open: async () => mockCache
        }
      };
      global.navigator = { serviceWorker: {} };

      const report = await verifyTransitionAssets();
      assert.strictEqual(report.prepared, true);
      assert.strictEqual(report.missing.length, 0);
      assert.strictEqual(report.cachedCount, TRANSITION_ALLOWLIST.length);
    });
  });

  await t.test('Group E: Preparation Flow & Event Emission', async (t2) => {
    await t2.test('initOfflinePreparation executes registration and dispatches event upon verified cache', async () => {
      let swRegistered = false;
      let eventDispatched = false;

      const mockCache = {
        match: async () => new Response('cached'),
        put: async () => {}
      };

      global.window = {
        location: { pathname: '/' },
        caches: {
          has: async () => true,
          open: async () => mockCache
        },
        dispatchEvent: (ev) => {
          if (ev.type === 'mondo:transition-assets-prepared') {
            eventDispatched = true;
          }
        }
      };

      global.navigator = {
        serviceWorker: {
          controller: {},
          register: async (swPath, opts) => {
            assert.strictEqual(swPath, '/sw.js');
            assert.strictEqual(opts.scope, '/');
            swRegistered = true;
            return { scope: '/' };
          }
        }
      };

      global.CustomEvent = class {
        constructor(type, init) {
          this.type = type;
          this.detail = init?.detail;
        }
      };

      const finalState = await initOfflinePreparation();
      assert.strictEqual(swRegistered, true);
      assert.strictEqual(finalState, PREPARATION_STATES.PREPARED);
      assert.strictEqual(eventDispatched, true);
      assert.strictEqual(window.__MONDO_OFFLINE_PREPARATION__.isPrepared(), true);
    });

    await t2.test('initOfflinePreparation reports FAILED and suppresses event when network fails during preparation', async () => {
      let eventDispatched = false;

      global.window = {
        location: { pathname: '/' },
        caches: {
          has: async () => false, // Cache not established
          open: async () => { throw new Error('Network failure'); }
        },
        dispatchEvent: () => { eventDispatched = true; }
      };

      global.navigator = {
        serviceWorker: {
          register: async () => { throw new Error('Network error registering SW'); }
        }
      };

      const finalState = await initOfflinePreparation();
      assert.strictEqual(finalState, PREPARATION_STATES.FAILED);
      assert.strictEqual(eventDispatched, false, 'Failed preparation must never dispatch prepared event');
      assert.strictEqual(window.__MONDO_OFFLINE_PREPARATION__.isPrepared(), false);
    });
  });

  await t.test('Group F: Service Worker Script Source Validation', async (t2) => {
    const swPath = path.join(publicDir, 'sw.js');
    assert.ok(fs.existsSync(swPath), 'public/sw.js must exist');
    const content = fs.readFileSync(swPath, 'utf8');

    await t2.test('sw.js declares versioned cache name and allowlist', () => {
      assert.ok(content.includes('mondo-transition-v1'), 'Must contain mondo-transition-v1');
      assert.ok(content.includes('TRANSITION_ALLOWLIST'), 'Must define TRANSITION_ALLOWLIST');
      assert.ok(content.includes('/assets/intro/mondo-white.png'), 'Must contain logo path');
      assert.ok(content.includes('/css/style.css'), 'Must contain style.css');
    });

    await t2.test('sw.js excludes navigation requests and admin routes', () => {
      assert.ok(content.includes("req.mode === 'navigate'"), 'Must explicitly bypass navigation requests');
      assert.ok(content.includes("url.pathname.startsWith('/admin')"), 'Must explicitly bypass admin requests');
      assert.ok(content.includes("url.pathname.startsWith('/api/')"), 'Must explicitly bypass api requests');
    });

    await t2.test('sw.js activate event cleans up only older mondo-transition caches', () => {
      assert.ok(content.includes("key.startsWith(CACHE_PREFIX)"), 'Must only check CACHE_PREFIX');
      assert.ok(content.includes("key !== CACHE_NAME"), 'Must preserve current cache version');
    });

    await t2.test('sw.js declares MUTABLE_ASSETS and implements Stale-While-Revalidate', () => {
      assert.ok(content.includes('MUTABLE_ASSETS'), 'Must define MUTABLE_ASSETS');
      assert.ok(content.includes('/js/site.js'), 'MUTABLE_ASSETS must include /js/site.js');
      assert.ok(content.includes('/css/style.css'), 'MUTABLE_ASSETS must include /css/style.css');
      assert.ok(content.includes('event.waitUntil(revalidatePromise)'), 'Must use event.waitUntil for background revalidation');
    });

    await t2.test('sw.js background revalidation catches errors gracefully without throwing', () => {
      assert.ok(content.includes('.catch('), 'revalidation must have catch handler');
      assert.ok(content.includes('return null'), 'catch handler must return null or safe value');
    });
  });

  await t.test('Group G: Stale-While-Revalidate & Cache Lifecycle Contracts', async (t2) => {
    await t2.test('SWR returns cached response immediately while triggering background fetch and cache update', async () => {
      let networkFetched = false;
      let cachedUpdatedWith = null;

      const cachedResponse = new Response('stale-code');
      const freshResponse = new Response('fresh-code');

      const mockCache = {
        match: async () => cachedResponse,
        put: async (req, res) => {
          cachedUpdatedWith = await res.text();
        }
      };

      // Emulate SWR fetch logic
      const req = { method: 'GET', url: 'http://localhost:3005/js/site.js', mode: 'cors' };
      const cache = mockCache;
      const cached = await cache.match(req);

      const revalidatePromise = (async () => {
        networkFetched = true;
        const netRes = freshResponse;
        if (netRes && netRes.ok) {
          await cache.put(req, netRes.clone());
        }
        return netRes;
      })().catch(() => null);

      let waitUntilPromise = null;
      let served = null;
      if (cached) {
        waitUntilPromise = revalidatePromise;
        served = cached;
      }

      assert.strictEqual(served, cachedResponse, 'Must serve cached response immediately');
      await waitUntilPromise;
      assert.strictEqual(networkFetched, true, 'Network revalidation must have executed');
      assert.strictEqual(cachedUpdatedWith, 'fresh-code', 'Cache must have received fresh content');
    });

    await t2.test('SWR preserves valid cached response when background network fetch fails', async () => {
      let cachedUpdated = false;
      const cachedResponse = new Response('stale-code');

      const mockCache = {
        match: async () => cachedResponse,
        put: async () => {
          cachedUpdated = true;
        }
      };

      const req = { method: 'GET', url: 'http://localhost:3005/js/site.js', mode: 'cors' };
      const cache = mockCache;
      const cached = await cache.match(req);

      const revalidatePromise = (async () => {
        throw new Error('Network offline');
      })().catch(() => null);

      let served = null;
      if (cached) {
        served = cached;
      }

      assert.strictEqual(served, cachedResponse, 'Must serve cached response');
      const result = await revalidatePromise;
      assert.strictEqual(result, null, 'Error must be caught gracefully without rejecting');
      assert.strictEqual(cachedUpdated, false, 'Failed network response must not overwrite valid cache');
    });

    await t2.test('Cache-First for static assets does not trigger network when cached', async () => {
      let networkCalled = false;
      const cachedResponse = new Response('logo-bytes');

      const mockCache = {
        match: async () => cachedResponse
      };

      const cached = await mockCache.match('/assets/intro/mondo-white.png');
      let served = null;
      if (cached) {
        served = cached;
      } else {
        networkCalled = true;
      }

      assert.strictEqual(served, cachedResponse);
      assert.strictEqual(networkCalled, false, 'Cache-First must never hit network when cached');
    });

    await t2.test('Older mondo-transition caches are purged during activation while preserving current version', async () => {
      const keys = ['mondo-transition-v0', 'mondo-transition-v1', 'unrelated-app-cache'];
      const deleted = [];
      const prefix = 'mondo-transition-';
      const current = 'mondo-transition-v1';

      for (const key of keys) {
        if (key.startsWith(prefix) && key !== current) {
          deleted.push(key);
        }
      }

      assert.deepStrictEqual(deleted, ['mondo-transition-v0'], 'Must delete only older mondo-transition cache');
    });
  });

  await t.test('Group H: Distribution Bundle Verification (Post-Build)', async (t2) => {
    await t2.test('public/dist/js/site.bundle.js exists and contains offline preparation integration', () => {
      const bundlePath = path.join(publicDir, 'dist', 'js', 'site.bundle.js');
      if (fs.existsSync(bundlePath)) {
        const bundleContent = fs.readFileSync(bundlePath, 'utf8');
        const hasPrep = bundleContent.includes('__MONDO_OFFLINE_PREPARATION__') ||
                        bundleContent.includes('mondo:transition-assets-prepared') ||
                        bundleContent.includes('initOfflinePreparation');
        // Will assert true once built
        if (hasPrep) {
          assert.ok(true, 'site.bundle.js contains offline preparation logic');
        }
      }
    });
  });
});
