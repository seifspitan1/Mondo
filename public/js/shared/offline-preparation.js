/**
 * MONDO — Offline Transition Asset Preparation Client Orchestrator (Stage G2)
 * Manages background caching of authentic transition assets, Quiet Mark logo,
 * status typography, and retry UI elements without disrupting public page rendering.
 */

export const CACHE_VERSION = 'v1';
export const CACHE_PREFIX = 'mondo-transition-';
export const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;

export const TRANSITION_ALLOWLIST = Object.freeze([
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

export const PREPARATION_STATES = Object.freeze({
  IDLE: 'idle',
  PREPARING: 'preparing',
  PREPARED: 'prepared',
  FAILED: 'failed',
  UNSUPPORTED: 'unsupported',
  ISOLATED: 'isolated'
});

let currentState = PREPARATION_STATES.IDLE;
let activeRegistration = null;
let preparationPromise = null;
let activePopulationPromise = null;
let hasDispatchedPreparedEvent = false;

/**
 * Validates browser capability for Service Workers and Cache Storage.
 * @returns {boolean}
 */
export function isOfflinePreparationSupported() {
  return (
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window.caches !== 'undefined'
  );
}

/**
 * Detects whether the current page context is the isolated /admin interface.
 * @returns {boolean}
 */
export function isAdminContext() {
  if (typeof window === 'undefined' || !window.location) return false;
  return window.location.pathname.startsWith('/admin');
}

/**
 * Checks whether all allowlisted transition resources exist in Cache Storage.
 * Safe to call from window context without Service Worker messaging.
 * @param {string} [cacheName=CACHE_NAME]
 * @returns {Promise<{ prepared: boolean, cachedCount: number, totalCount: number, missing: string[] }>}
 */
export async function verifyTransitionAssets(cacheName = CACHE_NAME) {
  if (!isOfflinePreparationSupported()) {
    return { prepared: false, cachedCount: 0, totalCount: TRANSITION_ALLOWLIST.length, missing: [...TRANSITION_ALLOWLIST] };
  }

  try {
    const hasCache = await window.caches.has(cacheName);
    if (!hasCache) {
      return { prepared: false, cachedCount: 0, totalCount: TRANSITION_ALLOWLIST.length, missing: [...TRANSITION_ALLOWLIST] };
    }

    const cache = await window.caches.open(cacheName);
    const results = await Promise.all(
      TRANSITION_ALLOWLIST.map(async (path) => {
        const match = await cache.match(path);
        return { path, ok: Boolean(match) };
      })
    );

    const missing = results.filter((r) => !r.ok).map((r) => r.path);
    const cachedCount = results.filter((r) => r.ok).length;
    const prepared = missing.length === 0;

    return {
      prepared,
      cachedCount,
      totalCount: TRANSITION_ALLOWLIST.length,
      missing
    };
  } catch (err) {
    console.warn('[OfflinePrep] Cache verification error:', err);
    return { prepared: false, cachedCount: 0, totalCount: TRANSITION_ALLOWLIST.length, missing: [...TRANSITION_ALLOWLIST] };
  }
}

/**
 * Directly populates Cache Storage with allowlisted transition assets from the window.
 * Serves as atomic fallback or direct pre-cache orchestrator.
 * Thread-safe and protected against concurrent execution races.
 * Uses default cache policy so valid HTTP cache entries are reused.
 * @param {string} [cacheName=CACHE_NAME]
 * @returns {Promise<boolean>}
 */
export async function populateTransitionCache(cacheName = CACHE_NAME) {
  if (!isOfflinePreparationSupported() || isAdminContext()) return false;
  if (activePopulationPromise) {
    return activePopulationPromise;
  }

  activePopulationPromise = (async () => {
    try {
      const cache = await window.caches.open(cacheName);
      const fetchPromises = TRANSITION_ALLOWLIST.map(async (url) => {
        const res = await fetch(url, { cache: 'default' });
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
        await cache.put(url, res);
        return url;
      });

      await Promise.all(fetchPromises);
      return true;
    } catch (err) {
      console.warn('[OfflinePrep] Direct population failed (possibly offline):', err);
      return false;
    } finally {
      activePopulationPromise = null;
    }
  })();

  return activePopulationPromise;
}

/**
 * Registers the Service Worker and initiates non-blocking background preparation.
 * Primary population path is delegated to the Service Worker install event.
 * Fallback direct population is only invoked if SW registration/installation fails
 * or if explicitly forced via forceDirectCache: true.
 * @param {object} [options]
 * @param {number} [options.delayMs=0] Optional delay before registration starts
 * @param {boolean} [options.forceDirectCache=false]
 * @returns {Promise<string>} Final preparation state
 */
export async function initOfflinePreparation({ delayMs = 0, forceDirectCache = false } = {}) {
  // 1. Capability & Environment Guards
  if (!isOfflinePreparationSupported()) {
    currentState = PREPARATION_STATES.UNSUPPORTED;
    exposeGlobalAPI();
    return currentState;
  }

  if (isAdminContext()) {
    currentState = PREPARATION_STATES.ISOLATED;
    exposeGlobalAPI();
    return currentState;
  }

  if (preparationPromise) {
    return preparationPromise;
  }

  currentState = PREPARATION_STATES.PREPARING;
  exposeGlobalAPI();

  preparationPromise = (async () => {
    // 2. Non-blocking idle scheduling to protect critical rendering path and Intro
    if (delayMs > 0) {
      await new Promise((r) => setTimeout(r, delayMs));
    } else if (typeof window.requestIdleCallback === 'function') {
      await new Promise((resolve) => window.requestIdleCallback(resolve, { timeout: 3000 }));
    }

    try {
      if (forceDirectCache) {
        // Explicit direct caching forced by caller
        await populateTransitionCache(CACHE_NAME);
      } else {
        // 3. Register Service Worker scoped to public site root
        try {
          activeRegistration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        } catch (swRegErr) {
          console.warn('[OfflinePrep] Service Worker registration failed, attempting direct population fallback:', swRegErr);
          activeRegistration = null;
        }

        if (activeRegistration) {
          // If a worker is installing, await its atomic installation (which populates CacheStorage via sw.js install event)
          const installingWorker = activeRegistration.installing;
          if (installingWorker) {
            await new Promise((resolve) => {
              if (installingWorker.state === 'installed' || installingWorker.state === 'activated' || installingWorker.state === 'redundant') {
                resolve();
                return;
              }
              let timeoutId = null;
              const onState = () => {
                if (installingWorker.state === 'installed' || installingWorker.state === 'activated' || installingWorker.state === 'redundant') {
                  if (timeoutId) clearTimeout(timeoutId);
                  installingWorker.removeEventListener('statechange', onState);
                  resolve();
                }
              };
              timeoutId = setTimeout(() => {
                installingWorker.removeEventListener('statechange', onState);
                resolve();
              }, 10000);
              installingWorker.addEventListener('statechange', onState);
            });

            // If the worker installation failed (became redundant), fall back to direct population
            if (installingWorker.state === 'redundant') {
              console.warn('[OfflinePrep] Service Worker installation failed (redundant), falling back to direct cache population');
              await populateTransitionCache(CACHE_NAME);
            }
          } else if (!activeRegistration.waiting && !activeRegistration.active) {
            // Uncontrolled / mock registration without worker: verify first, populate only if missing
            const check = await verifyTransitionAssets(CACHE_NAME);
            if (!check.prepared) {
              await populateTransitionCache(CACHE_NAME);
            }
          }
        } else {
          // Service Worker registration failed: fall back to direct CacheStorage population
          await populateTransitionCache(CACHE_NAME);
        }
      }

      // 5. Explicitly verify the cache contents before confirming PREPARED status
      const verification = await verifyTransitionAssets(CACHE_NAME);
      if (verification.prepared) {
        currentState = PREPARATION_STATES.PREPARED;
        if (!hasDispatchedPreparedEvent && typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
          hasDispatchedPreparedEvent = true;
          window.dispatchEvent(
            new CustomEvent('mondo:transition-assets-prepared', {
              detail: {
                cacheName: CACHE_NAME,
                assetCount: verification.cachedCount
              }
            })
          );
        }
      } else {
        // If not all assets were cached (e.g. network lost during preparation), report FAILED
        currentState = PREPARATION_STATES.FAILED;
      }
    } catch (err) {
      console.warn('[OfflinePrep] Service worker registration or preparation error:', err);
      currentState = PREPARATION_STATES.FAILED;
    }

    exposeGlobalAPI();
    return currentState;
  })();

  return preparationPromise;
}

/**
 * Exposes a safe, read-only inspection API onto window.__MONDO_OFFLINE_PREPARATION__
 */
function exposeGlobalAPI() {
  if (typeof window === 'undefined') return;

  window.__MONDO_OFFLINE_PREPARATION__ = {
    getStatus: () => currentState,
    isPrepared: () => currentState === PREPARATION_STATES.PREPARED,
    getManifest: () => [...TRANSITION_ALLOWLIST],
    getCacheName: () => CACHE_NAME,
    verifyCache: () => verifyTransitionAssets(CACHE_NAME),
    prepare: () => initOfflinePreparation({ forceDirectCache: true }),
    destroy: resetOfflinePreparationState
  };
}

/**
 * Resets local module state (primarily for automated test harnesses).
 */
export function resetOfflinePreparationState() {
  currentState = PREPARATION_STATES.IDLE;
  activeRegistration = null;
  preparationPromise = null;
  activePopulationPromise = null;
  hasDispatchedPreparedEvent = false;
  if (typeof window !== 'undefined' && window.__MONDO_OFFLINE_PREPARATION__) {
    delete window.__MONDO_OFFLINE_PREPARATION__;
  }
}

