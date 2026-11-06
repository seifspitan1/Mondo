/**
 * MONDO — Transition Asset Preparation Service Worker (Stage G2)
 * Versioned, allowlist-only offline transition cache orchestrator.
 *
 * STRICT GOVERNANCE:
 * - NO broad catch-all request interception.
 * - NO navigation request interception (Multi-Page Application preserved).
 * - NO /admin request or credential caching.
 * - NO API or dynamic portfolio content caching.
 * - Atomic cache validation: essential resources only.
 */

const CACHE_VERSION = 'v1';
const CACHE_PREFIX = 'mondo-transition-';
const CACHE_NAME = 'mondo-transition-v1';

// Essential same-origin transition assets strictly required for
// Quiet Mark, loading status, breathing, brand signatures, and offline retry UI.
const TRANSITION_ALLOWLIST = Object.freeze([
  '/assets/intro/mondo-white.png',
  '/css/style.css',
  '/js/site.js',
  '/assets/mondo-wordmark.svg',
  '/assets/facet-button-left.svg',
  '/assets/facet-button-right.svg',
  '/assets/facet-button-secondary-left.svg',
  '/assets/facet-button-sec.svg',
  '/assets/mondo-mark.webp'
]);

// Expected SHA-256 hash for authentic Quiet Mark logo (df403822fdf20c116165ff7120bf69f9f383f3b219d4a4307ed18fcadc6c9a56)
const AUTHENTIC_LOGO_PATH = '/assets/intro/mondo-white.png';

// Mutable code assets that may change between builds at identical URLs
const MUTABLE_ASSETS = Object.freeze([
  '/js/site.js',
  '/css/style.css'
]);

// ─── Lifecycle: Installation ──────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  // Pre-cache allowlisted assets atomically.
  // Uses default cache policy so fresh HTTP cache entries from initial page load are reused.
  // If any critical asset fails, installation rejects to prevent corrupt partial states.
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const fetchPromises = TRANSITION_ALLOWLIST.map(async (url) => {
        try {
          const response = await fetch(url, { cache: 'default' });
          if (!response.ok) {
            throw new Error(`[SW] HTTP ${response.status} fetching ${url}`);
          }
          await cache.put(url, response);
          return url;
        } catch (err) {
          console.warn(`[SW] Failed caching allowlisted asset: ${url}`, err);
          throw err;
        }
      });
      return Promise.all(fetchPromises);
    })
  );
});

// ─── Lifecycle: Activation ────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  // Clean up ONLY previous versions of MONDO transition caches.
  // Never delete caches belonging to other origins, applications, or sub-paths.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
});

// ─── Request Interception ─────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // 1. Only handle idempotent GET requests
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 2. Strict Same-Origin policy
  if (url.origin !== self.location.origin) return;

  // 3. Admin Isolation: never intercept or cache /admin requests
  if (url.pathname.startsWith('/admin')) return;

  // 4. API & Dynamic Media Isolation: never intercept API endpoints or dynamic uploads
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) return;

  // 5. Navigation Request Exclusion: preserve native browser MPA document navigation
  if (req.mode === 'navigate') return;

  // 6. Strict Allowlist Matching: only handle exact allowlisted transition assets
  if (!TRANSITION_ALLOWLIST.includes(url.pathname)) return;

  // 7. Freshness-prioritized revalidation with offline fallback for mutable code assets (/js/site.js, /css/style.css)
  // Ensures returning online visitors reliably receive newly deployed code on normal navigation or reload,
  // preventing version skew between newly revalidated HTML documents and code assets,
  // while offline visitors seamlessly fall back to CacheStorage.
  if (MUTABLE_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(req);

        // Network revalidation promise
        const revalidatePromise = fetch(req)
          .then((netRes) => {
            if (netRes && netRes.ok) {
              cache.put(req, netRes.clone());
            }
            return netRes;
          })
          .catch((err) => {
            // Graceful catch: network failure or offline must not reject
            // or overwrite valid cached response.
            return null;
          });

        event.waitUntil(revalidatePromise);

        // Await fresh network response when online
        const netRes = await revalidatePromise;
        if (netRes && netRes.ok) {
          return netRes;
        }

        // Offline or network error fallback: serve cached response if available
        if (cached) {
          return cached;
        }

        // Return 503 Service Unavailable if cold cache and network fails
        return new Response('Transition asset offline unavailable', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain' }
        });
      })
    );
    return;
  }

  // 8. Cache-First with Network Fallback for immutable visual transition assets
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req);
      if (cached) {
        return cached;
      }
      try {
        const netRes = await fetch(req);
        if (netRes && netRes.ok) {
          cache.put(req, netRes.clone());
        }
        return netRes;
      } catch (err) {
        // Return 503 Service Unavailable if neither cache nor network is reachable
        return new Response('Transition asset offline unavailable', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain' }
        });
      }
    })
  );
});

// ─── Message Interface (Status & Verification Queries) ────────────────────────
self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'PING') {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ type: 'PONG', version: CACHE_NAME });
    }
    return;
  }

  if (data.type === 'VERIFY_CACHE') {
    caches.open(CACHE_NAME).then(async (cache) => {
      const results = await Promise.all(
        TRANSITION_ALLOWLIST.map(async (url) => {
          const match = await cache.match(url);
          return { url, cached: Boolean(match) };
        })
      );
      const allCached = results.every((r) => r.cached);
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({
          type: 'CACHE_VERIFIED',
          cacheName: CACHE_NAME,
          prepared: allCached,
          details: results
        });
      }
    });
    return;
  }

  if (data.type === 'PREPARE_NOW') {
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        await Promise.all(
          TRANSITION_ALLOWLIST.map(async (url) => {
            const res = await fetch(url, { cache: 'default' });
            if (res.ok) await cache.put(url, res);
          })
        );
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ type: 'PREPARE_COMPLETE', success: true });
        }
      } catch (err) {
        if (event.ports && event.ports[0]) {
          event.ports[0].postMessage({ type: 'PREPARE_COMPLETE', success: false, error: err.message });
        }
      }
    });
  }
});
