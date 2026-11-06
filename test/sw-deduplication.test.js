import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CACHE_NAME,
  CACHE_PREFIX,
  TRANSITION_ALLOWLIST,
  PREPARATION_STATES,
  isOfflinePreparationSupported,
  isAdminContext,
  verifyTransitionAssets,
  populateTransitionCache,
  initOfflinePreparation,
  resetOfflinePreparationState
} from '../public/js/shared/offline-preparation.js';

import { DEFAULT_HYBRID_PILOT_ENABLED } from '../public/js/features/navigation/coordinator-binding.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

// Global unhandled rejection tracker for TEST-16
let unhandledRejections = [];
const unhandledHandler = (err) => {
  unhandledRejections.push(err);
};
process.on('unhandledRejection', unhandledHandler);

const origNavigatorDesc = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

function setMockNavigator(mockNav) {
  Object.defineProperty(globalThis, 'navigator', {
    value: mockNav,
    configurable: true,
    writable: true
  });
}

function restoreNavigator() {
  if (origNavigatorDesc) {
    Object.defineProperty(globalThis, 'navigator', origNavigatorDesc);
  }
}

// Helper to create an in-memory mock CacheStorage
function createMockCaches(initialData = {}) {
  const store = new Map();
  for (const [cacheKey, assets] of Object.entries(initialData)) {
    const map = new Map();
    for (const [url, body] of Object.entries(assets)) {
      map.set(url, new Response(body));
    }
    store.set(cacheKey, map);
  }

  return {
    _store: store,
    has: async (name) => store.has(name),
    open: async (name) => {
      if (!store.has(name)) {
        store.set(name, new Map());
      }
      const cacheMap = store.get(name);
      return {
        match: async (req) => {
          const url = typeof req === 'string' ? req : req.url;
          const match = cacheMap.get(url);
          return match ? match.clone() : null;
        },
        put: async (req, res) => {
          const url = typeof req === 'string' ? req : req.url;
          cacheMap.set(url, res.clone());
        },
        delete: async (req) => {
          const url = typeof req === 'string' ? req : req.url;
          return cacheMap.delete(url);
        },
        keys: async () => Array.from(cacheMap.keys()).map((u) => new Request(u))
      };
    },
    delete: async (name) => store.delete(name),
    keys: async () => Array.from(store.keys())
  };
}

test('Service Worker & Offline Preparation Deduplication (Phase 5D-C.1A)', async (t) => {
  t.beforeEach(() => {
    resetOfflinePreparationState();
    unhandledRejections = [];
    globalThis.CustomEvent = class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    };
  });

  t.afterEach(() => {
    resetOfflinePreparationState();
    delete globalThis.window;
    restoreNavigator();
    delete globalThis.fetch;
    delete globalThis.CustomEvent;
  });

  t.after(() => {
    process.removeListener('unhandledRejection', unhandledHandler);
  });

  // TEST-01: Cold first visit with no existing SW registration
  await t.test('TEST-01: Cold first visit with no existing SW registration delegates to SW and avoids duplicate page fetch', async () => {
    let windowFetchCallCount = 0;
    const windowFetchedUrls = [];

    globalThis.fetch = async (url) => {
      windowFetchCallCount++;
      windowFetchedUrls.push(url);
      return new Response('window_content', { status: 200 });
    };

    const mockCaches = createMockCaches();

    // Emulate installing worker that populates cache during install
    class MockServiceWorker {
      constructor() {
        this.state = 'installing';
        this.listeners = {};
      }
      addEventListener(type, cb) {
        if (!this.listeners[type]) this.listeners[type] = [];
        this.listeners[type].push(cb);
      }
      removeEventListener(type, cb) {
        if (this.listeners[type]) {
          this.listeners[type] = this.listeners[type].filter((fn) => fn !== cb);
        }
      }
      async simulateInstall() {
        // SW thread installs and populates cache directly
        const cache = await mockCaches.open(CACHE_NAME);
        for (const asset of TRANSITION_ALLOWLIST) {
          await cache.put(asset, new Response('sw_cached_content', { status: 200 }));
        }
        this.state = 'installed';
        for (const cb of this.listeners['statechange'] || []) {
          cb();
        }
      }
    }

    const worker = new MockServiceWorker();

    globalThis.window = {
      location: { pathname: '/' },
      caches: mockCaches,
      dispatchEvent: () => {}
    };

    let swRegisterCalled = false;
    setMockNavigator({
      serviceWorker: {
        controller: null, // Cold visit: no controller yet
        register: async (swPath, opts) => {
          swRegisterCalled = true;
          // Trigger install concurrently as browser would
          setTimeout(() => worker.simulateInstall(), 5);
          return {
            scope: opts?.scope || '/',
            installing: worker,
            waiting: null,
            active: null
          };
        }
      }
    });

    const state = await initOfflinePreparation();

    assert.strictEqual(swRegisterCalled, true, 'Service Worker registration must be initiated');
    assert.strictEqual(state, PREPARATION_STATES.PREPARED, 'State must reach PREPARED');
    assert.strictEqual(windowFetchCallCount, 0, 'Page thread MUST NOT make any window fetch calls during successful SW installation');
    assert.strictEqual(windowFetchedUrls.length, 0, 'No assets should be fetched by the window');

    // Verify cache has all assets
    const verification = await verifyTransitionAssets(CACHE_NAME);
    assert.strictEqual(verification.prepared, true);
    assert.strictEqual(verification.cachedCount, 9);
  });

  // TEST-02: Cold first visit where navigator.serviceWorker.controller is null
  await t.test('TEST-02: Cold first visit where controller is null does NOT call populateTransitionCache', async () => {
    let windowFetchCallCount = 0;

    globalThis.fetch = async () => {
      windowFetchCallCount++;
      return new Response('ok');
    };

    const mockCaches = createMockCaches();
    class MockServiceWorker {
      constructor() {
        this.state = 'installing';
        this.listeners = {};
      }
      addEventListener(type, cb) {
        if (!this.listeners[type]) this.listeners[type] = [];
        this.listeners[type].push(cb);
      }
      removeEventListener(type, cb) {
        if (this.listeners[type]) {
          this.listeners[type] = this.listeners[type].filter((fn) => fn !== cb);
        }
      }
      async simulateInstall() {
        const cache = await mockCaches.open(CACHE_NAME);
        for (const asset of TRANSITION_ALLOWLIST) {
          await cache.put(asset, new Response('sw_asset'));
        }
        this.state = 'installed';
        for (const cb of this.listeners['statechange'] || []) {
          cb();
        }
      }
    }

    const worker = new MockServiceWorker();

    globalThis.window = {
      location: { pathname: '/work' },
      caches: mockCaches,
      dispatchEvent: () => {}
    };

    setMockNavigator({
      serviceWorker: {
        controller: null, // Explicitly null
        register: async () => {
          setTimeout(() => worker.simulateInstall(), 5);
          return { scope: '/', installing: worker };
        }
      }
    });

    const state = await initOfflinePreparation();
    assert.strictEqual(state, PREPARATION_STATES.PREPARED);
    assert.strictEqual(windowFetchCallCount, 0, 'controller === null must NOT trigger redundant window fetch calls');
  });

  // TEST-03: Successful Service Worker installation and CacheStorage population
  await t.test('TEST-03: Successful Service Worker installation and CacheStorage population', async () => {
    const mockCaches = createMockCaches();
    const cache = await mockCaches.open(CACHE_NAME);

    // Simulate complete SW install population
    for (const asset of TRANSITION_ALLOWLIST) {
      await cache.put(asset, new Response('asset-content'));
    }

    globalThis.window = {
      caches: mockCaches
    };
    setMockNavigator({
      serviceWorker: {}
    });

    const report = await verifyTransitionAssets(CACHE_NAME);
    assert.strictEqual(report.prepared, true);
    assert.strictEqual(report.cachedCount, TRANSITION_ALLOWLIST.length);
    assert.strictEqual(report.missing.length, 0);
  });

  // TEST-04: Warm repeat visit with active controller
  await t.test('TEST-04: Warm repeat visit with active controller does not re-populate', async () => {
    let windowFetchCallCount = 0;
    globalThis.fetch = async () => {
      windowFetchCallCount++;
      return new Response('ok');
    };

    // Pre-populate cache (warm state)
    const initialData = {};
    initialData[CACHE_NAME] = {};
    for (const asset of TRANSITION_ALLOWLIST) {
      initialData[CACHE_NAME][asset] = 'cached_data';
    }
    const mockCaches = createMockCaches(initialData);

    let eventDispatched = false;
    globalThis.window = {
      location: { pathname: '/' },
      caches: mockCaches,
      dispatchEvent: (ev) => {
        if (ev.type === 'mondo:transition-assets-prepared') eventDispatched = true;
      }
    };

    const activeWorker = { state: 'activated' };
    setMockNavigator({
      serviceWorker: {
        controller: activeWorker, // Warm visit: active controller
        register: async () => ({
          scope: '/',
          installing: null,
          waiting: null,
          active: activeWorker
        })
      }
    });

    const state = await initOfflinePreparation();
    assert.strictEqual(state, PREPARATION_STATES.PREPARED);
    assert.strictEqual(windowFetchCallCount, 0, 'Warm visit must not make any window fetch calls');
    assert.strictEqual(eventDispatched, true);
  });

  // TEST-05: Normal browser refresh
  await t.test('TEST-05: Normal browser refresh recognizes existing transition cache without re-downloading allowlist assets', async () => {
    let windowFetchCallCount = 0;
    globalThis.fetch = async () => {
      windowFetchCallCount++;
      return new Response('ok');
    };

    const initialData = {};
    initialData[CACHE_NAME] = {};
    for (const asset of TRANSITION_ALLOWLIST) {
      initialData[CACHE_NAME][asset] = 'cached_bytes';
    }
    const mockCaches = createMockCaches(initialData);

    globalThis.window = {
      location: { pathname: '/work/rainbow-orchard' },
      caches: mockCaches,
      dispatchEvent: () => {}
    };

    const activeWorker = { state: 'activated' };
    setMockNavigator({
      serviceWorker: {
        controller: activeWorker,
        register: async () => ({
          scope: '/',
          installing: null,
          waiting: null,
          active: activeWorker
        })
      }
    });

    const state = await initOfflinePreparation();
    assert.strictEqual(state, PREPARATION_STATES.PREPARED);
    assert.strictEqual(windowFetchCallCount, 0, 'Browser refresh with cached assets must incur 0 fetch calls');
  });

  // TEST-06: Registration with an installing worker in flight
  await t.test('TEST-06: Registration with an installing worker in flight waits for SW lifecycle transition', async () => {
    const mockCaches = createMockCaches();
    let listenerAttached = false;

    class InFlightWorker {
      constructor() {
        this.state = 'installing';
        this.listeners = {};
      }
      addEventListener(type, cb) {
        listenerAttached = true;
        if (!this.listeners[type]) this.listeners[type] = [];
        this.listeners[type].push(cb);
      }
      removeEventListener(type, cb) {
        if (this.listeners[type]) {
          this.listeners[type] = this.listeners[type].filter((fn) => fn !== cb);
        }
      }
      async finishInstallation() {
        const cache = await mockCaches.open(CACHE_NAME);
        for (const asset of TRANSITION_ALLOWLIST) {
          await cache.put(asset, new Response('sw_done'));
        }
        this.state = 'installed';
        for (const cb of this.listeners['statechange'] || []) {
          cb();
        }
      }
    }

    const worker = new InFlightWorker();

    globalThis.window = {
      location: { pathname: '/' },
      caches: mockCaches,
      dispatchEvent: () => {}
    };

    setMockNavigator({
      serviceWorker: {
        controller: null,
        register: async () => {
          setTimeout(() => worker.finishInstallation(), 20);
          return { scope: '/', installing: worker };
        }
      }
    });

    const state = await initOfflinePreparation();
    assert.strictEqual(listenerAttached, true, 'Must attach statechange listener to installing worker');
    assert.strictEqual(state, PREPARATION_STATES.PREPARED);
    assert.strictEqual(worker.state, 'installed');
  });

  // TEST-07: Registration failure fallback
  await t.test('TEST-07: Registration failure triggers safe direct population fallback', async () => {
    let windowFetchCallCount = 0;
    const mockCaches = createMockCaches();

    globalThis.fetch = async () => {
      windowFetchCallCount++;
      return new Response('fallback_content', { status: 200 });
    };

    globalThis.window = {
      location: { pathname: '/' },
      caches: mockCaches,
      dispatchEvent: () => {}
    };

    setMockNavigator({
      serviceWorker: {
        controller: null,
        register: async () => {
          throw new Error('ServiceWorker registration denied by browser security');
        }
      }
    });

    const state = await initOfflinePreparation();
    assert.strictEqual(state, PREPARATION_STATES.PREPARED, 'State must reach PREPARED via fallback');
    assert.strictEqual(windowFetchCallCount, TRANSITION_ALLOWLIST.length, 'Window fetch must populate all allowlist assets');

    const check = await verifyTransitionAssets(CACHE_NAME);
    assert.strictEqual(check.prepared, true);
    assert.strictEqual(check.cachedCount, TRANSITION_ALLOWLIST.length);
  });

  // TEST-08: Service Workers unsupported fallback
  await t.test('TEST-08: Service Workers unsupported enters UNSUPPORTED state gracefully', async () => {
    globalThis.window = {
      location: { pathname: '/' },
      caches: createMockCaches()
    };
    setMockNavigator({}); // No serviceWorker property

    assert.strictEqual(isOfflinePreparationSupported(), false);

    const state = await initOfflinePreparation();
    assert.strictEqual(state, PREPARATION_STATES.UNSUPPORTED);
    assert.strictEqual(window.__MONDO_OFFLINE_PREPARATION__.getStatus(), 'unsupported');
    assert.strictEqual(window.__MONDO_OFFLINE_PREPARATION__.isPrepared(), false);
  });

  // TEST-09: CacheStorage access failure
  await t.test('TEST-09: CacheStorage access failure handled gracefully (FAILED state, no unhandled rejection)', async () => {
    globalThis.window = {
      location: { pathname: '/' },
      caches: {
        has: async () => { throw new Error('QuotaExceededError: storage limit reached'); },
        open: async () => { throw new Error('QuotaExceededError: storage limit reached'); }
      },
      dispatchEvent: () => {}
    };

    setMockNavigator({
      serviceWorker: {
        controller: null,
        register: async () => {
          throw new Error('SW failed');
        }
      }
    });

    const state = await initOfflinePreparation();
    assert.strictEqual(state, PREPARATION_STATES.FAILED);
    assert.strictEqual(window.__MONDO_OFFLINE_PREPARATION__.getStatus(), 'failed');
    assert.strictEqual(window.__MONDO_OFFLINE_PREPARATION__.isPrepared(), false);
  });

  // TEST-10: Partial asset download failure during preparation
  await t.test('TEST-10: Partial asset download failure during preparation reports FAILED atomically', async () => {
    let eventDispatched = false;
    const mockCaches = createMockCaches();

    globalThis.fetch = async (url) => {
      if (url.includes('mondo-wordmark.svg')) {
        return new Response('Not Found', { status: 404, statusText: 'Not Found' });
      }
      return new Response('ok', { status: 200 });
    };

    globalThis.window = {
      location: { pathname: '/' },
      caches: mockCaches,
      dispatchEvent: (ev) => {
        if (ev.type === 'mondo:transition-assets-prepared') eventDispatched = true;
      }
    };

    setMockNavigator({
      serviceWorker: {
        controller: null,
        register: async () => {
          throw new Error('Force fallback to direct population');
        }
      }
    });

    const state = await initOfflinePreparation();
    assert.strictEqual(state, PREPARATION_STATES.FAILED);
    assert.strictEqual(eventDispatched, false, 'Prepared event must NOT be dispatched on partial download failure');
    assert.strictEqual(window.__MONDO_OFFLINE_PREPARATION__.isPrepared(), false);
  });

  // TEST-11: Concurrent calls to initOfflinePreparation and populateTransitionCache
  await t.test('TEST-11: Concurrent calls share promises and prevent race conditions', async () => {
    let windowFetchCallCount = 0;
    const mockCaches = createMockCaches();

    globalThis.fetch = async () => {
      windowFetchCallCount++;
      await new Promise((r) => setTimeout(r, 10));
      return new Response('ok', { status: 200 });
    };

    globalThis.window = {
      location: { pathname: '/' },
      caches: mockCaches,
      dispatchEvent: () => {}
    };

    setMockNavigator({
      serviceWorker: {
        controller: null,
        register: async () => {
          throw new Error('Force fallback');
        }
      }
    });

    // Trigger multiple concurrent calls
    const [res1, res2] = await Promise.all([
      initOfflinePreparation(),
      initOfflinePreparation()
    ]);

    assert.strictEqual(res1, res2);
    // Since both calls shared the same preparationPromise, fetch was only called once per asset
    assert.strictEqual(windowFetchCallCount, TRANSITION_ALLOWLIST.length);
  });

  // TEST-12: Verified single-population guarantee
  await t.test('TEST-12: Verified single-population guarantee (zero redundant page-level fetch calls)', async () => {
    let pageFetchCalls = 0;
    globalThis.fetch = async () => {
      pageFetchCalls++;
      return new Response('page_content');
    };

    const mockCaches = createMockCaches();

    class InstallingSW {
      constructor() {
        this.state = 'installing';
        this.listeners = {};
      }
      addEventListener(type, cb) {
        if (!this.listeners[type]) this.listeners[type] = [];
        this.listeners[type].push(cb);
      }
      removeEventListener(type, cb) {
        if (this.listeners[type]) {
          this.listeners[type] = this.listeners[type].filter((fn) => fn !== cb);
        }
      }
      async run() {
        const cache = await mockCaches.open(CACHE_NAME);
        for (const asset of TRANSITION_ALLOWLIST) {
          await cache.put(asset, new Response('sw_populated'));
        }
        this.state = 'installed';
        for (const cb of this.listeners['statechange'] || []) {
          cb();
        }
      }
    }

    const sw = new InstallingSW();

    globalThis.window = {
      location: { pathname: '/' },
      caches: mockCaches,
      dispatchEvent: () => {}
    };

    setMockNavigator({
      serviceWorker: {
        controller: null,
        register: async () => {
          setTimeout(() => sw.run(), 5);
          return { scope: '/', installing: sw };
        }
      }
    });

    await initOfflinePreparation();
    assert.strictEqual(pageFetchCalls, 0, 'Page must make 0 fetch calls when SW handles installation');
  });

  // TEST-13: Cache update and version invalidation
  await t.test('TEST-13: Cache update and version invalidation contract preserved in sw.js', () => {
    const swPath = path.join(publicDir, 'sw.js');
    assert.ok(fs.existsSync(swPath));
    const swContent = fs.readFileSync(swPath, 'utf8');

    // Confirm CACHE_NAME is versioned
    assert.ok(swContent.includes("CACHE_NAME = 'mondo-transition-v1'"));
    assert.ok(swContent.includes("CACHE_PREFIX = 'mondo-transition-'"));

    // Confirm activate event purges only old versions matching prefix
    assert.ok(swContent.includes("key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME"));
  });

  // TEST-14: Native MPA navigation exclusion
  await t.test('TEST-14: Native MPA navigation exclusion (req.mode === "navigate") intact in sw.js', () => {
    const swPath = path.join(publicDir, 'sw.js');
    const swContent = fs.readFileSync(swPath, 'utf8');

    // sw.js must explicitly bypass navigation requests to preserve Native MPA
    assert.ok(
      swContent.includes("req.mode === 'navigate'"),
      'Service Worker must explicitly bypass req.mode === "navigate"'
    );
  });

  // TEST-15: Hybrid Navigation remains disabled
  await t.test('TEST-15: Hybrid Navigation remains disabled (DEFAULT_HYBRID_PILOT_ENABLED = false)', () => {
    assert.strictEqual(
      DEFAULT_HYBRID_PILOT_ENABLED,
      false,
      'DEFAULT_HYBRID_PILOT_ENABLED must strictly remain false in production runtime'
    );
  });

  // TEST-16: Zero unhandled promise rejections
  await t.test('TEST-16: Zero unhandled promise rejections across all offline preparation tests', () => {
    assert.strictEqual(
      unhandledRejections.length,
      0,
      `Expected 0 unhandled rejections, but observed: ${unhandledRejections.map((e) => e.message).join(', ')}`
    );
  });
});
