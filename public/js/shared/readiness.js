/**
 * MONDO — Central Readiness Coordinator (Phase 5C.3.3)
 * Lightweight, zero-dependency state machine orchestrating critical content readiness,
 * adaptive loading shell presentation, and bounded recovery.
 */

// Lifecycle States
export const STATES = Object.freeze({
  IDLE: 'IDLE',
  PENDING: 'PENDING',
  READY: 'READY',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED',
  RECOVERED: 'RECOVERED',
  DISMISSED: 'DISMISSED'
});

// Dependency Outcome States
export const DEP_STATES = Object.freeze({
  PENDING: 'pending',
  READY: 'ready',
  FAILED: 'failed',
  FALLBACK: 'fallback',
  TIMED_OUT: 'timed_out',
  CANCELLED: 'cancelled'
});

/**
 * Creates an instance of the Central Readiness Coordinator.
 *
 * @param {object} [options]
 * @param {number} [options.appearanceThresholdMs=250] - Time before visual loading logo appears
 * @param {number} [options.longWaitMs=2500] - Time before restrained status text appears
 * @param {number} [options.maxTimeoutMs=4000] - Bounded watchdog fail-safe timeout
 * @param {Function} [options.onThreshold] - Fired at 250ms if critical deps still pending
 * @param {Function} [options.onLongWait] - Fired at longWaitMs if still pending
 * @param {Function} [options.onReady] - Fired when all critical dependencies are ready
 * @param {Function} [options.onFallback] - Fired when fallback recovery is applied
 * @param {Function} [options.onDismiss] - Fired when shell is dismissed
 * @returns {object} Coordinator instance
 */
export function createReadinessCoordinator({
  appearanceThresholdMs = 250,
  longWaitMs = 2500,
  maxTimeoutMs = 4000,
  onThreshold = null,
  onLongWait = null,
  onReady = null,
  onFallback = null,
  onDismiss = null
} = {}) {
  let state = STATES.IDLE;
  let isDismissed = false;
  let thresholdExceeded = false;
  const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

  const dependencies = new Map();
  const timers = new Map();

  // Internal timer handles
  let thresholdTimerId = null;
  let longWaitTimerId = null;
  let maxWatchdogTimerId = null;
  let pageshowHandler = null;
  let pagehideHandler = null;

  function clearAllTimers() {
    if (thresholdTimerId) {
      clearTimeout(thresholdTimerId);
      thresholdTimerId = null;
    }
    if (longWaitTimerId) {
      clearTimeout(longWaitTimerId);
      longWaitTimerId = null;
    }
    if (maxWatchdogTimerId) {
      clearTimeout(maxWatchdogTimerId);
      maxWatchdogTimerId = null;
    }
    for (const [, timerId] of timers) {
      clearTimeout(timerId);
    }
    timers.clear();
  }

  function detachWindowListeners() {
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      if (pageshowHandler) window.removeEventListener('pageshow', pageshowHandler);
      if (pagehideHandler) window.removeEventListener('pagehide', pagehideHandler);
    }
  }

  function checkReadiness() {
    if (isDismissed || state === STATES.DISMISSED) return;

    let allCriticalResolved = true;
    for (const [, dep] of dependencies) {
      if (dep.critical) {
        if (dep.status === DEP_STATES.READY) {
          continue;
        }

        // A critical visual dependency CANNOT be satisfied by a timeout or unverified fallback
        if (dep.visual && !dep.hasVerifiedFallback) {
          allCriticalResolved = false;
          break;
        }

        // Non-visual critical dependencies: check if resolved via allowFallback
        if (dep.status === DEP_STATES.FALLBACK && dep.allowFallback) {
          continue;
        }

        // TIMED_OUT, PENDING, or unverified FALLBACK cannot satisfy critical readiness
        allCriticalResolved = false;
        break;
      }
    }

    if (allCriticalResolved) {
      transitionToReady();
    }
  }

  function transitionToReady() {
    if (state === STATES.READY || isDismissed) return;
    state = STATES.READY;

    // Disarm threshold and watchdog timers
    if (thresholdTimerId) {
      clearTimeout(thresholdTimerId);
      thresholdTimerId = null;
    }
    if (longWaitTimerId) {
      clearTimeout(longWaitTimerId);
      longWaitTimerId = null;
    }
    if (maxWatchdogTimerId) {
      clearTimeout(maxWatchdogTimerId);
      maxWatchdogTimerId = null;
    }

    if (typeof onReady === 'function') {
      try {
        onReady({
          elapsed: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime,
          thresholdExceeded
        });
      } catch (err) {
        console.error('[ReadinessCoordinator] onReady error:', err);
      }
    }
  }

  function start() {
    if (state !== STATES.IDLE) return;
    state = STATES.PENDING;

    // 1. Arm 250ms Appearance Threshold
    if (appearanceThresholdMs > 0) {
      thresholdTimerId = setTimeout(() => {
        thresholdTimerId = null;
        if (state === STATES.PENDING && !isDismissed) {
          thresholdExceeded = true;
          if (typeof onThreshold === 'function') {
            try {
              onThreshold();
            } catch (err) {
              console.error('[ReadinessCoordinator] onThreshold error:', err);
            }
          }
        }
      }, appearanceThresholdMs);
    }

    // 2. Arm Long Wait Threshold
    if (longWaitMs > 0) {
      longWaitTimerId = setTimeout(() => {
        longWaitTimerId = null;
        if (state === STATES.PENDING && !isDismissed) {
          if (typeof onLongWait === 'function') {
            try {
              onLongWait();
            } catch (err) {
              console.error('[ReadinessCoordinator] onLongWait error:', err);
            }
          }
        }
      }, longWaitMs);
    }

    // 3. Arm Bounded Max Watchdog
    if (maxTimeoutMs > 0) {
      maxWatchdogTimerId = setTimeout(() => {
        maxWatchdogTimerId = null;
        if (!isDismissed && state !== STATES.READY) {
          forceRelease('max_watchdog_timeout');
        }
      }, maxTimeoutMs);
    }

    // 4. Attach bfcache & pagehide listeners
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      pageshowHandler = (event) => {
        if (event.persisted) {
          forceRelease('bfcache');
        }
      };
      pagehideHandler = () => {
        clearAllTimers();
      };
      window.addEventListener('pageshow', pageshowHandler);
      window.addEventListener('pagehide', pagehideHandler);
    }

    // Immediate check in case no deps were registered or already resolved
    checkReadiness();
  }

  function register(name, promiseOrFn, {
    critical = true,
    timeoutMs = null,
    visual = false,
    allowFallback = true,
    hasVerifiedFallback = false
  } = {}) {
    if (!name || typeof name !== 'string') throw new TypeError('Dependency name is required.');
    if (isDismissed) return;

    const depRecord = {
      name,
      critical: Boolean(critical),
      visual: Boolean(visual),
      allowFallback: Boolean(allowFallback),
      hasVerifiedFallback: Boolean(hasVerifiedFallback),
      status: DEP_STATES.PENDING,
      error: null,
      data: null,
      startTime: typeof performance !== 'undefined' ? performance.now() : Date.now(),
      duration: 0
    };
    dependencies.set(name, depRecord);

    // Optional per-dependency bounded timeout
    if (typeof timeoutMs === 'number' && timeoutMs > 0) {
      const depTimer = setTimeout(() => {
        timers.delete(name);
        if (depRecord.visual && !depRecord.hasVerifiedFallback) {
          markTimedOut(name, 'dependency_timeout');
        } else {
          markFallback(name, 'dependency_timeout');
        }
      }, timeoutMs);
      timers.set(name, depTimer);
    }

    if (promiseOrFn) {
      const promise = typeof promiseOrFn === 'function' ? Promise.resolve().then(promiseOrFn) : Promise.resolve(promiseOrFn);
      promise
        .then((result) => {
          markReady(name, result);
        })
        .catch((err) => {
          markFailed(name, err);
        });
    }

    return depRecord;
  }

  function markReady(name, data = null) {
    if (isDismissed) return;
    const dep = dependencies.get(name);
    if (!dep) return;
    // Allow transitioning from PENDING or TIMED_OUT (late decode arrival) to READY
    if (dep.status !== DEP_STATES.PENDING && dep.status !== DEP_STATES.TIMED_OUT) return;

    if (timers.has(name)) {
      clearTimeout(timers.get(name));
      timers.delete(name);
    }

    dep.status = DEP_STATES.READY;
    dep.data = data;
    dep.duration = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - dep.startTime;

    checkReadiness();
  }

  function markTimedOut(name, reason = 'timed_out') {
    if (isDismissed) return;
    const dep = dependencies.get(name);
    if (!dep) return;
    if (dep.status !== DEP_STATES.PENDING) return;

    if (timers.has(name)) {
      clearTimeout(timers.get(name));
      timers.delete(name);
    }

    dep.status = DEP_STATES.TIMED_OUT;
    dep.error = reason;
    dep.duration = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - dep.startTime;

    checkReadiness();
  }

  function markFallback(name, reason = null) {
    if (isDismissed) return;
    const dep = dependencies.get(name);
    if (!dep) return;
    if (dep.status !== DEP_STATES.PENDING) return; // duplicate signal guard

    if (timers.has(name)) {
      clearTimeout(timers.get(name));
      timers.delete(name);
    }

    dep.status = DEP_STATES.FALLBACK;
    dep.error = reason;
    dep.duration = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - dep.startTime;

    if (typeof onFallback === 'function') {
      try {
        onFallback({ name, reason });
      } catch (err) {
        console.error('[ReadinessCoordinator] onFallback error:', err);
      }
    }

    checkReadiness();
  }

  function markFailed(name, error = null) {
    if (isDismissed) return;
    const dep = dependencies.get(name);
    if (!dep) return;
    if (dep.status !== DEP_STATES.PENDING && dep.status !== DEP_STATES.TIMED_OUT) return;

    if (timers.has(name)) {
      clearTimeout(timers.get(name));
      timers.delete(name);
    }

    dep.status = DEP_STATES.FAILED;
    dep.error = error;
    dep.duration = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - dep.startTime;

    if (dep.critical) {
      state = STATES.FAILED;
    }

    checkReadiness();
  }

  function forceRelease(reason = 'forced') {
    if (isDismissed) return;

    let hasUnresolvedCriticalVisual = false;
    for (const [, dep] of dependencies) {
      if (dep.status === DEP_STATES.PENDING || dep.status === DEP_STATES.TIMED_OUT) {
        if (dep.critical && dep.visual && !dep.hasVerifiedFallback) {
          hasUnresolvedCriticalVisual = true;
          dep.status = DEP_STATES.FAILED;
        } else {
          dep.status = DEP_STATES.FALLBACK;
        }
        dep.error = reason;
      }
    }

    if (hasUnresolvedCriticalVisual) {
      state = STATES.FAILED;
      dismiss();
    } else {
      state = STATES.RECOVERED;
      transitionToReady();
      dismiss();
    }
  }

  function dismiss() {
    if (isDismissed) return;
    isDismissed = true;
    state = STATES.DISMISSED;

    clearAllTimers();
    detachWindowListeners();

    if (typeof onDismiss === 'function') {
      try {
        onDismiss();
      } catch (err) {
        console.error('[ReadinessCoordinator] onDismiss error:', err);
      }
    }
  }

  function destroy() {
    dismiss();
  }

  function waitForReady() {
    if (state === STATES.READY || state === STATES.RECOVERED || isDismissed) {
      return Promise.resolve({ state });
    }
    return new Promise((resolve) => {
      const existingOnReady = onReady;
      onReady = (info) => {
        if (typeof existingOnReady === 'function') {
          try { existingOnReady(info); } catch (_) {}
        }
        resolve(info);
      };

      const existingOnDismiss = onDismiss;
      onDismiss = () => {
        if (typeof existingOnDismiss === 'function') {
          try { existingOnDismiss(); } catch (_) {}
        }
        resolve({ state: STATES.DISMISSED });
      };
    });
  }

  return {
    start,
    register,
    markReady,
    markFallback,
    markTimedOut,
    markFailed,
    forceRelease,
    dismiss,
    destroy,
    waitForReady,
    getState: () => state,
    isReady: () => state === STATES.READY || state === STATES.RECOVERED,
    isDismissed: () => isDismissed,
    hasExceededThreshold: () => thresholdExceeded,
    getDependencies: () => new Map(dependencies)
  };
}

/**
 * Safely awaits an image element decode or completion with a bounded timeout.
 * Never throws or unhandled rejects.
 * Supports extended observation so slow images can continue loading beyond initial observation threshold.
 *
 * @param {HTMLImageElement|null} img
 * @param {number} [timeoutMs=2500]
 * @param {object} [options]
 * @param {boolean} [options.keepListening=false]
 * @param {Function} [options.onObservationTimeout=null]
 * @returns {Promise<{ status: string, error?: any, wasDelayed?: boolean }>}
 */
export function waitForImageDecode(img, timeoutMs = 2500, { keepListening = false, onObservationTimeout = null, signal = null } = {}) {
  if (!img) return Promise.resolve({ status: 'no_element' });

  if (signal && signal.aborted) {
    return Promise.resolve({ status: 'aborted', wasDelayed: false });
  }

  // If image already loaded and natural width is established
  if (img.complete && img.naturalWidth > 0) {
    if (typeof img.decode === 'function') {
      return img.decode()
        .then(() => ({ status: 'decoded' }))
        .catch((err) => ({ status: 'decode_fallback', error: err }));
    }
    return Promise.resolve({ status: 'complete' });
  }

  return new Promise((resolve) => {
    let settled = false;
    let timerId = null;
    let observationTimedOut = false;

    const cleanup = () => {
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (typeof img.removeEventListener === 'function') {
        img.removeEventListener('load', onLoad);
        img.removeEventListener('error', onError);
      }
      if (signal && typeof signal.removeEventListener === 'function') {
        signal.removeEventListener('abort', onAbort);
      }
    };

    const settle = (status, error = null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ status, error, wasDelayed: observationTimedOut });
    };

    const onAbort = () => {
      settle('aborted');
    };

    const onLoad = () => {
      if (typeof img.decode === 'function') {
        img.decode()
          .then(() => settle('decoded'))
          .catch((err) => {
            if (img.naturalWidth > 0) {
              settle('decoded');
            } else {
              settle('decode_fallback', err);
            }
          });
      } else {
        settle('loaded');
      }
    };

    const onError = (err) => settle('error', err);

    if (signal && typeof signal.addEventListener === 'function') {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    if (typeof img.addEventListener === 'function') {
      img.addEventListener('load', onLoad, { once: true });
      img.addEventListener('error', onError, { once: true });
    }

    if (typeof timeoutMs === 'number' && timeoutMs > 0) {
      timerId = setTimeout(() => {
        observationTimedOut = true;
        if (typeof onObservationTimeout === 'function') {
          try { onObservationTimeout(); } catch (_) {}
        }
        if (!keepListening) {
          settle('timeout');
        }
      }, timeoutMs);
    }
  });
}

/**
 * Safely awaits video metadata or initial frame readiness with bounded timeout.
 * Preserves backward compatibility while supporting optional first-frame requirement.
 * Never throws or unhandled rejects.
 *
 * @param {HTMLVideoElement|null} video
 * @param {number} [timeoutMs=2500]
 * @param {object} [options]
 * @param {boolean} [options.requireFirstFrame=false]
 * @param {boolean} [options.checkPoster=true]
 * @returns {Promise<{ status: string, error?: any }>}
 */
export function waitForVideoReady(video, timeoutMs = 2500, { requireFirstFrame = false, checkPoster = true, signal = null } = {}) {
  if (!video) return Promise.resolve({ status: 'no_element' });

  if (signal && signal.aborted) {
    return Promise.resolve({ status: 'aborted' });
  }

  if (requireFirstFrame) {
    return waitForVideoFirstFrame(video, { timeoutMs, checkPoster, signal });
  }

  return new Promise((resolve) => {
    let settled = false;
    let timerId = null;

    const cleanup = () => {
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (typeof video.removeEventListener === 'function') {
        video.removeEventListener('loadedmetadata', onLoadedMetadata);
        video.removeEventListener('error', onError);
      }
      if (signal && typeof signal.removeEventListener === 'function') {
        signal.removeEventListener('abort', onAbort);
      }
    };

    const settle = (status, error = null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ status, error });
    };

    const onAbort = () => settle('aborted');

    if (signal && typeof signal.addEventListener === 'function') {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    timerId = setTimeout(() => settle('timeout'), timeoutMs);

    // If video readyState has metadata (>= 1)
    if (typeof video.readyState === 'number' && video.readyState >= 1) {
      settle('metadata_ready');
      return;
    }

    if (typeof video.addEventListener !== 'function') {
      settle('unsupported');
      return;
    }

    const onLoadedMetadata = () => settle('metadata_loaded');
    const onError = (err) => settle('error', err);

    video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
}

/**
 * Phase 5C Stage G1: Strict Video First-Frame Readiness.
 * Verifies true visual presentation:
 * 1. Poster image decode if poster attribute is present.
 * 2. Or video.readyState >= 2 (HAVE_CURRENT_DATA) for poster-less media.
 * 3. Graceful fallback on timeout or decode error without throwing.
 *
 * @param {HTMLVideoElement|null} video
 * @param {object} [options]
 * @param {number} [options.timeoutMs=2500]
 * @param {boolean} [options.checkPoster=true]
 * @returns {Promise<{ status: string, error?: any, details?: any }>}
 */
export function waitForVideoFirstFrame(video, { timeoutMs = 2500, checkPoster = true, signal = null } = {}) {
  if (!video) return Promise.resolve({ status: 'no_element' });

  if (signal && signal.aborted) {
    return Promise.resolve({ status: 'aborted' });
  }

  // 1. Poster probe if poster present
  if (checkPoster && video.poster && typeof video.poster === 'string' && video.poster.trim() !== '') {
    if (typeof Image !== 'undefined') {
      const posterImg = new Image();
      posterImg.src = video.poster;
      return waitForImageDecode(posterImg, timeoutMs, { signal }).then((res) => {
        if (res.status === 'decoded' || res.status === 'complete' || res.status === 'loaded') {
          return { status: 'poster_ready', poster: video.poster, details: res };
        }
        if (signal && signal.aborted) {
          return { status: 'aborted' };
        }
        // Fall through to video frame check if poster decode had error/timeout
        return probeVideoCurrentFrame(video, Math.max(500, Math.round(timeoutMs * 0.5)), { signal });
      });
    }
  }

  return probeVideoCurrentFrame(video, timeoutMs, { signal });
}

function probeVideoCurrentFrame(video, timeoutMs, { signal = null } = {}) {
  if (!video) return Promise.resolve({ status: 'no_element' });

  if (signal && signal.aborted) {
    return Promise.resolve({ status: 'aborted' });
  }

  return new Promise((resolve) => {
    let settled = false;
    let timerId = null;

    const cleanup = () => {
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (typeof video.removeEventListener === 'function') {
        video.removeEventListener('loadeddata', onLoadedData);
        video.removeEventListener('canplay', onCanPlay);
        video.removeEventListener('error', onError);
      }
      if (signal && typeof signal.removeEventListener === 'function') {
        signal.removeEventListener('abort', onAbort);
      }
    };

    const settle = (status, error = null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({ status, error });
    };

    const onAbort = () => settle('aborted');

    if (signal && typeof signal.addEventListener === 'function') {
      signal.addEventListener('abort', onAbort, { once: true });
    }

    timerId = setTimeout(() => settle('timeout'), timeoutMs);

    // readyState >= 2 (HAVE_CURRENT_DATA) means first frame is decoded
    if (typeof video.readyState === 'number' && video.readyState >= 2) {
      settle('frame_ready');
      return;
    }

    if (typeof video.addEventListener !== 'function') {
      settle('unsupported');
      return;
    }

    const onLoadedData = () => settle('frame_loaded');
    const onCanPlay = () => settle('can_play');
    const onError = (err) => settle('error', err);

    video.addEventListener('loadeddata', onLoadedData, { once: true });
    video.addEventListener('canplay', onCanPlay, { once: true });
    video.addEventListener('error', onError, { once: true });
  });
}

/**
 * Phase 5C Stage G1: Awaits document font set readiness with bounded timeout.
 * Never hangs or throws.
 *
 * @param {number} [timeoutMs=1500]
 * @returns {Promise<{ status: string, error?: any }>}
 */
export function waitForFontsReady(timeoutMs = 1500) {
  if (typeof document === 'undefined' || !document.fonts || typeof document.fonts.ready?.then !== 'function') {
    return Promise.resolve({ status: 'unsupported' });
  }
  return new Promise((resolve) => {
    let settled = false;
    const timerId = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({ status: 'timeout' });
      }
    }, timeoutMs);

    document.fonts.ready
      .then(() => {
        if (!settled) {
          settled = true;
          clearTimeout(timerId);
          resolve({ status: 'ready' });
        }
      })
      .catch((err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timerId);
          resolve({ status: 'fallback', error: err });
        }
      });
  });
}

/**
 * Phase 5C Stage G1: Probes background images applied via CSS or style attributes.
 *
 * @param {Array<HTMLElement|string>|HTMLElement|string} elementsOrUrls
 * @param {number} [timeoutMs=2000]
 * @returns {Promise<{ status: string, count: number, results?: any[] }>}
 */
export function waitForBackgroundImages(elementsOrUrls, timeoutMs = 2000) {
  if (!elementsOrUrls) return Promise.resolve({ status: 'no_targets', count: 0 });
  if (typeof Image === 'undefined') return Promise.resolve({ status: 'unsupported', count: 0 });

  const items = Array.isArray(elementsOrUrls) ? elementsOrUrls : [elementsOrUrls];
  const urls = [];

  for (const item of items) {
    if (typeof item === 'string') {
      urls.push(item);
    } else if (item && typeof item.getAttribute === 'function') {
      const style = item.getAttribute('style') || '';
      const match = style.match(/url\(["']?([^"')]+)["']?\)/);
      if (match && match[1]) urls.push(match[1]);
    }
  }

  if (!urls.length) return Promise.resolve({ status: 'no_urls', count: 0 });

  const probes = urls.map((url) => {
    const img = new Image();
    img.src = url;
    return waitForImageDecode(img, timeoutMs);
  });

  return Promise.all(probes).then((results) => ({
    status: 'settled',
    count: results.length,
    results
  }));
}

/**
 * Phase 5C Stage G1: Standardized Route Readiness Contracts.
 * Declarative specification of critical vs optional first-view dependencies per route.
 */
export const ROUTE_READINESS_CONTRACTS = Object.freeze({
  '/': {
    id: 'home',
    critical: ['critical_css', 'critical_fonts', 'initial_data', 'hero_brand_mark'],
    optional: ['background_imagery', 'footer_socials']
  },
  '/work': {
    id: 'work',
    critical: ['critical_css', 'critical_fonts', 'projects_data', 'above_fold_thumbnails'],
    optional: ['below_fold_thumbnails']
  },
  '/work/:slug': {
    id: 'project',
    critical: ['critical_css', 'critical_fonts', 'project_record', 'hero_media'],
    optional: ['related_thumbnails', 'background_refresh']
  },
  '/start': {
    id: 'enquiry',
    critical: ['critical_css', 'critical_fonts', 'form_structure', 'url_params'],
    optional: ['direct_contact']
  },
  '/privacy': {
    id: 'privacy',
    critical: ['critical_css', 'critical_fonts', 'static_content'],
    optional: []
  }
});

export function getRouteReadinessContract(routePath) {
  if (!routePath || typeof routePath !== 'string') return null;
  const clean = routePath.replace(/\/+$/, '') || '/';
  if (clean.startsWith('/work/') && clean !== '/work') {
    return ROUTE_READINESS_CONTRACTS['/work/:slug'];
  }
  return ROUTE_READINESS_CONTRACTS[clean] || null;
}
