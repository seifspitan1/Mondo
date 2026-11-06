/**
 * MONDO — Work Portfolio First-View Readiness (Stage G3.3-A)
 * Isolated helper assessing Work Portfolio visual readiness and
 * critical media decoding for Option C Hybrid Navigation.
 *
 * MANDATORY GOVERNANCE & AMENDMENT COMPLIANCE:
 * - Amendment 3: Critical image selection evaluates both vertical and horizontal
 *   viewport intersection. Excludes hidden, filtered, and entirely offscreen elements.
 *   Preserves approved G3-D04 Option C hybrid strategy.
 * - Amendment 4: All Work-specific deadlines (safetyTimeoutMs, decodeTimeoutMs, fontGateMs)
 *   remain configurable at the helper boundary without unapproved frozen constants.
 *   A timeout strictly returns TIMED_OUT (NEVER CRITICAL_MEDIA_READY or VERIFIED_FALLBACK_READY).
 *   A verified fallback requires actual evidence of a usable visual alternative.
 * - STRICT DORMANCY: Zero window event listeners on import, zero top-level DOM access,
 *   zero automatic timers, zero navigation mutation.
 */

/**
 * Deterministic outcome states for Work Portfolio readiness assessment.
 */
export const WORK_READINESS_OUTCOMES = Object.freeze({
  STRUCTURAL_READY: 'STRUCTURAL_READY',
  DATA_READY: 'DATA_READY',
  CRITICAL_MEDIA_READY: 'CRITICAL_MEDIA_READY',
  VERIFIED_FALLBACK_READY: 'VERIFIED_FALLBACK_READY',
  RECOVERABLE_ERROR: 'RECOVERABLE_ERROR',
  TIMED_OUT: 'TIMED_OUT',
  ABORTED: 'ABORTED'
});

/**
 * Validates the structural presence of essential Work Portfolio landmark containers.
 *
 * @param {Document|HTMLElement|null} [root=null] Root context to evaluate
 * @returns {{ ok: boolean, landmarkEl?: HTMLElement, gridEl?: HTMLElement, countEl?: HTMLElement, error?: string }}
 */
export function checkWorkStructure(root = (typeof document !== 'undefined' ? document : null)) {
  if (!root || typeof root.querySelector !== 'function') {
    return { ok: false, error: 'Invalid or missing document root' };
  }

  const landmarkEl = root.querySelector('main#main') || (root.getElementById ? root.getElementById('main') : null);
  if (!landmarkEl) {
    return { ok: false, error: 'Missing required landmark <main id="main">' };
  }

  const gridEl = landmarkEl.querySelector('#work-grid') || (root.getElementById ? root.getElementById('work-grid') : null);
  if (!gridEl) {
    return { ok: false, landmarkEl, error: 'Missing required portfolio grid container #work-grid' };
  }

  const countEl = landmarkEl.querySelector('#project-count') || (root.getElementById ? root.getElementById('project-count') : null);

  return {
    ok: true,
    landmarkEl,
    gridEl,
    countEl
  };
}

/**
 * Checks if a card element is visibly rendered and not hidden or filtered out.
 *
 * @param {HTMLElement} card - Card container element
 * @returns {boolean} True if card is visible
 */
function isCardVisible(card) {
  if (!card) return false;
  if (card.hidden) return false;
  if (card.getAttribute && card.getAttribute('aria-hidden') === 'true') return false;

  if (card.classList && (
    card.classList.contains('is-filtered-out') ||
    card.classList.contains('is-hidden') ||
    card.classList.contains('hidden')
  )) {
    return false;
  }

  if (card.style) {
    if (card.style.display === 'none' || card.style.visibility === 'hidden') {
      return false;
    }
  }

  return true;
}

/**
 * Determines whether a card element intersects the active viewport both horizontally and vertically.
 *
 * @param {HTMLElement} card - Card element
 * @param {object} viewport - { width, height }
 * @param {Function} getBounds - Bounding rect resolver
 * @returns {boolean} True if card intersects visible viewport
 */
function intersectsViewport(card, viewport, getBounds) {
  if (typeof getBounds !== 'function') return false;

  const rect = getBounds(card);
  if (!rect) return false;

  // If width or height is 0, geometry is unmeasurable or collapsed
  if (rect.width <= 0 || rect.height <= 0) return false;

  // Both vertical and horizontal intersection check (Amendment 3)
  const verticallyVisible = rect.bottom > 0 && rect.top < viewport.height;
  const horizontallyVisible = rect.right > 0 && rect.left < viewport.width;

  return verticallyVisible && horizontallyVisible;
}

/**
 * Selects first-view critical images from the Work grid using viewport geometry and eager hints.
 * Enforces Owner Decision G3-D04 Option C (Hybrid Viewport-Aware Selection).
 *
 * @param {HTMLElement} gridEl - Grid container (#work-grid)
 * @param {object} [options={}]
 * @param {number} [options.viewportWidth] Viewport width (default window.innerWidth)
 * @param {number} [options.viewportHeight] Viewport height (default window.innerHeight)
 * @param {Function} [options.getBounds] getBoundingClientRect implementation
 * @returns {HTMLImageElement[]} Array of critical image elements
 */
export function selectCriticalWorkImages(gridEl, options = {}) {
  if (!gridEl || typeof gridEl.querySelectorAll !== 'function') return [];

  const viewportWidth = typeof options.viewportWidth === 'number'
    ? options.viewportWidth
    : (typeof window !== 'undefined' ? (window.innerWidth || 1200) : 1200);

  const viewportHeight = typeof options.viewportHeight === 'number'
    ? options.viewportHeight
    : (typeof window !== 'undefined' ? (window.innerHeight || 800) : 800);

  const getBounds = typeof options.getBounds === 'function'
    ? options.getBounds
    : ((el) => (typeof el.getBoundingClientRect === 'function' ? el.getBoundingClientRect() : { width: 0, height: 0, top: 0, bottom: 0, left: 0, right: 0 }));

  const cards = Array.from(gridEl.querySelectorAll('.project-card'));
  if (cards.length === 0) return [];

  const viewport = { width: viewportWidth, height: viewportHeight };
  const visibleCards = [];
  let measurableCount = 0;

  for (const card of cards) {
    if (!isCardVisible(card)) continue;

    const rect = getBounds(card);
    if (rect && rect.width > 0 && rect.height > 0) {
      measurableCount++;
      if (intersectsViewport(card, viewport, () => rect)) {
        visibleCards.push(card);
      }
    }
  }

  // Strategy 1: Real Viewport Geometry (when geometry is measurable)
  if (measurableCount > 0) {
    const criticalImages = [];
    for (const card of visibleCards) {
      const img = card.querySelector('img');
      if (img) criticalImages.push(img);
    }
    return criticalImages;
  }

  // Strategy 2: Hybrid Fallback (when geometry is unmeasurable, e.g. mock DOM)
  // Uses existing eager-loading hints (cards with img[loading="eager"], up to 3)
  const fallbackImages = [];
  for (const card of cards) {
    if (!isCardVisible(card)) continue;
    const img = card.querySelector('img');
    if (!img) continue;

    if (img.getAttribute && img.getAttribute('loading') === 'eager') {
      fallbackImages.push(img);
    }
    if (fallbackImages.length >= 3) break;
  }

  // If no eager hints were found, take first 3 visible cards
  if (fallbackImages.length === 0) {
    for (const card of cards) {
      if (!isCardVisible(card)) continue;
      const img = card.querySelector('img');
      if (img) fallbackImages.push(img);
      if (fallbackImages.length >= 3) break;
    }
  }

  return fallbackImages;
}

/**
 * Checks whether an image element that failed decode has verified visual fallback evidence.
 * A broken or empty rectangle does NOT qualify (Amendment 4).
 *
 * Evidence includes:
 * - Card has an authentic concept label (.concept-label)
 * - Card has a stylized preview action icon (.project-view)
 * - Image or card has an explicit verified fallback marker (data-fallback-verified="true" or .has-fallback-visual)
 *
 * @param {HTMLImageElement} img - Image element
 * @returns {boolean} True if verified fallback evidence exists
 */
export function hasVerifiedFallback(img) {
  if (!img) return false;

  // Direct element marker
  if (img.dataset && img.dataset.fallbackVerified === 'true') {
    return true;
  }
  if (img.getAttribute && img.getAttribute('data-fallback-verified') === 'true') {
    return true;
  }

  // Inspect parent card container
  const card = img.closest ? img.closest('.project-card') : null;
  if (!card) return false;

  if (card.dataset && card.dataset.fallbackVerified === 'true') {
    return true;
  }
  if (card.classList && card.classList.contains('has-fallback-visual')) {
    return true;
  }

  // Authentic MONDO card visual features that provide structured UI in place of raw image
  const hasConceptLabel = Boolean(card.querySelector && card.querySelector('.concept-label'));
  const hasProjectView = Boolean(card.querySelector && card.querySelector('.project-view'));
  const hasCover = Boolean(card.querySelector && card.querySelector('.project-cover'));

  // Requires structured cover container AND at least one authentic brand/icon badge
  return Boolean(hasCover && (hasConceptLabel || hasProjectView));
}

/**
 * Evaluates the readiness of a single critical image element.
 *
 * @param {HTMLImageElement} img - Image element to assess
 * @param {object} [options={}]
 * @param {number} [options.decodeTimeoutMs=1500] Caller-configured decode timeout
 * @param {AbortSignal|null} [options.signal=null] Cancellation signal
 * @param {Function} [options.decodeImpl] Injected decode function
 * @returns {Promise<{ status: string, error?: string }>}
 */
export function evaluateImageReadiness(img, options = {}) {
  const {
    decodeTimeoutMs = 1500,
    signal = null,
    decodeImpl = null
  } = options;

  if (!img) {
    return Promise.resolve({ status: 'error', error: 'Missing image element' });
  }

  if (signal && signal.aborted) {
    return Promise.resolve({ status: 'aborted', error: 'Readiness evaluation aborted' });
  }

  // Check if image is already successfully decoded and non-empty
  if (img.naturalWidth > 0 && img.complete) {
    return Promise.resolve({ status: 'decoded' });
  }

  const decodeFn = decodeImpl || (typeof img.decode === 'function' ? () => img.decode() : null);

  if (!decodeFn) {
    // Unsupported decode environment fallback
    if (img.complete && img.naturalWidth > 0) {
      return Promise.resolve({ status: 'decoded' });
    }
    if (hasVerifiedFallback(img)) {
      return Promise.resolve({ status: 'fallback' });
    }
    return Promise.resolve({ status: 'error', error: 'Image decode API unavailable and image incomplete' });
  }

  return new Promise((resolve) => {
    let settled = false;
    let timerId = null;

    const cleanup = () => {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
      if (signal && typeof signal.removeEventListener === 'function') {
        signal.removeEventListener('abort', onAbort);
      }
    };

    const finish = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const onAbort = () => finish({ status: 'aborted', error: 'Evaluation aborted' });

    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
    }

    if (decodeTimeoutMs > 0) {
      timerId = setTimeout(() => {
        timerId = null;
        // Strict Amendment 4: Timeout must always be classified as timeout, never fallback
        finish({ status: 'timeout', error: `Decode timed out after ${decodeTimeoutMs}ms` });
      }, decodeTimeoutMs);
    }

    decodeFn()
      .then(() => {
        if (img.naturalWidth > 0 || img.width > 0) {
          finish({ status: 'decoded' });
        } else {
          // Zero dimensions on resolved decode: check fallback
          if (hasVerifiedFallback(img)) {
            finish({ status: 'fallback', error: 'Zero dimensions decoded with fallback' });
          } else {
            finish({ status: 'error', error: 'Zero dimensions decoded' });
          }
        }
      })
      .catch((err) => {
        if (hasVerifiedFallback(img)) {
          finish({ status: 'fallback', error: err ? err.message : 'Decode rejected with fallback' });
        } else {
          finish({ status: 'error', error: err ? err.message : 'Decode rejected' });
        }
      });
  });
}

/**
 * Awaits font readiness up to a caller-configured bounded ceiling.
 *
 * @param {FontFaceSet|null} fonts - document.fonts
 * @param {number} fontGateMs - Maximum gate ceiling in ms
 * @param {AbortSignal|null} signal - Cancellation signal
 * @returns {Promise<boolean>} True if ready, false if timed out
 */
function gateFonts(fonts, fontGateMs, signal) {
  if (!fonts || typeof fonts.ready !== 'object' || typeof fonts.ready.then !== 'function') {
    return Promise.resolve(true);
  }

  if (fontGateMs <= 0) return Promise.resolve(true);
  if (signal && signal.aborted) return Promise.resolve(false);

  return new Promise((resolve) => {
    let timerId = null;
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      if (timerId !== null) clearTimeout(timerId);
      resolve(result);
    };

    timerId = setTimeout(() => finish(false), fontGateMs);
    fonts.ready.then(() => finish(true)).catch(() => finish(false));
  });
}

/**
 * Primary orchestrator assessing whether the Work Portfolio first view is ready.
 * Evaluates structural readiness, data hydration, font gate, and critical media decoding.
 * Enforces strict timeout integrity: TIMEOUT MUST NEVER BE CLASSIFIED AS READY.
 *
 * @param {object} [options={}]
 * @param {Document|HTMLElement|null} [options.root] Root DOM element
 * @param {number} [options.safetyTimeoutMs=2500] Caller-configurable overall ceiling
 * @param {number} [options.decodeTimeoutMs=1500] Caller-configurable per-image timeout
 * @param {number} [options.fontGateMs=200] Caller-configurable font gate timeout
 * @param {AbortSignal|null} [options.signal=null] Cancellation signal
 * @param {FontFaceSet|null} [options.fonts] FontFaceSet instance
 * @param {boolean} [options.allowEmptyGrid=false] Whether an empty grid without .empty-state is permitted
 * @param {number} [options.viewportWidth] Custom viewport width
 * @param {number} [options.viewportHeight] Custom viewport height
 * @param {Function} [options.getBounds] Custom bounding rect getter
 * @param {Function} [options.now] Custom timestamp provider
 * @returns {Promise<{ outcome: string, criticalCount: number, decodedCount: number, fallbackCount: number, durationMs: number, error?: string }>}
 */
export async function awaitWorkFirstViewReady(options = {}) {
  const {
    root = (typeof document !== 'undefined' ? document : null),
    safetyTimeoutMs = 2500,
    decodeTimeoutMs = 1500,
    fontGateMs = 200,
    signal = null,
    fonts = (typeof document !== 'undefined' ? document.fonts : null),
    allowEmptyGrid = false,
    viewportWidth,
    viewportHeight,
    getBounds,
    now = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now())
  } = options;

  const startTime = now();

  // 1. Cancellation check
  if (signal && signal.aborted) {
    return {
      outcome: WORK_READINESS_OUTCOMES.ABORTED,
      criticalCount: 0,
      decodedCount: 0,
      fallbackCount: 0,
      durationMs: 0,
      error: 'Readiness evaluation aborted before start'
    };
  }

  // 2. Structural Readiness Check
  const structure = checkWorkStructure(root);
  if (!structure.ok) {
    return {
      outcome: WORK_READINESS_OUTCOMES.RECOVERABLE_ERROR,
      criticalCount: 0,
      decodedCount: 0,
      fallbackCount: 0,
      durationMs: Math.round(now() - startTime),
      error: structure.error
    };
  }

  const { gridEl } = structure;

  // 3. Data Readiness Check
  const cards = gridEl.querySelectorAll('.project-card');
  const emptyStateEl = gridEl.querySelector('.empty-state');

  if (cards.length === 0) {
    if (emptyStateEl || allowEmptyGrid) {
      // Legitimate empty state
      return {
        outcome: WORK_READINESS_OUTCOMES.DATA_READY,
        criticalCount: 0,
        decodedCount: 0,
        fallbackCount: 0,
        durationMs: Math.round(now() - startTime)
      };
    }
    // Unexpected missing content
    return {
      outcome: WORK_READINESS_OUTCOMES.RECOVERABLE_ERROR,
      criticalCount: 0,
      decodedCount: 0,
      fallbackCount: 0,
      durationMs: Math.round(now() - startTime),
      error: 'Work grid contains no cards and no valid empty state'
    };
  }

  // 4. Font Gate Settlement
  if (fontGateMs > 0 && fonts) {
    await gateFonts(fonts, fontGateMs, signal);
  }

  if (signal && signal.aborted) {
    return {
      outcome: WORK_READINESS_OUTCOMES.ABORTED,
      criticalCount: 0,
      decodedCount: 0,
      fallbackCount: 0,
      durationMs: Math.round(now() - startTime),
      error: 'Readiness evaluation aborted after font gate'
    };
  }

  // 5. Critical Media Selection
  const criticalImages = selectCriticalWorkImages(gridEl, {
    viewportWidth,
    viewportHeight,
    getBounds
  });

  if (criticalImages.length === 0) {
    return {
      outcome: WORK_READINESS_OUTCOMES.DATA_READY,
      criticalCount: 0,
      decodedCount: 0,
      fallbackCount: 0,
      durationMs: Math.round(now() - startTime)
    };
  }

  // 6. Media Decoding Evaluation with Caller-Configurable Safety Ceiling
  let settled = false;
  let safetyTimerId = null;

  const elapsedBeforeMedia = now() - startTime;
  const remainingSafetyMs = Math.max(0, safetyTimeoutMs - elapsedBeforeMedia);

  return new Promise((resolve) => {
    const cleanup = () => {
      if (safetyTimerId !== null) {
        clearTimeout(safetyTimerId);
        safetyTimerId = null;
      }
      if (signal && typeof signal.removeEventListener === 'function') {
        signal.removeEventListener('abort', onAbort);
      }
    };

    const finish = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve({
        ...result,
        durationMs: Math.round(now() - startTime)
      });
    };

    const onAbort = () => finish({
      outcome: WORK_READINESS_OUTCOMES.ABORTED,
      criticalCount: criticalImages.length,
      decodedCount: 0,
      fallbackCount: 0,
      error: 'Evaluation aborted during media decoding'
    });

    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
    }

    // Safety timeout ceiling enforcement (Amendment 4: TIMED_OUT is NEVER READY)
    if (remainingSafetyMs > 0) {
      safetyTimerId = setTimeout(() => {
        safetyTimerId = null;
        finish({
          outcome: WORK_READINESS_OUTCOMES.TIMED_OUT,
          criticalCount: criticalImages.length,
          decodedCount: 0,
          fallbackCount: 0,
          error: `Work readiness safety ceiling elapsed after ${safetyTimeoutMs}ms`
        });
      }, remainingSafetyMs);
    }

    // Run parallel image decodes
    const decodePromises = criticalImages.map((img) =>
      evaluateImageReadiness(img, {
        decodeTimeoutMs,
        signal
      })
    );

    Promise.all(decodePromises)
      .then((results) => {
        let decodedCount = 0;
        let fallbackCount = 0;
        let errorCount = 0;
        let timeoutCount = 0;

        for (const res of results) {
          if (res.status === 'decoded') decodedCount++;
          else if (res.status === 'fallback') fallbackCount++;
          else if (res.status === 'timeout') timeoutCount++;
          else errorCount++;
        }

        // Strict Outcome Evaluation
        if (timeoutCount > 0) {
          finish({
            outcome: WORK_READINESS_OUTCOMES.TIMED_OUT,
            criticalCount: criticalImages.length,
            decodedCount,
            fallbackCount,
            error: `${timeoutCount} critical image(s) timed out`
          });
        } else if (errorCount > 0) {
          finish({
            outcome: WORK_READINESS_OUTCOMES.RECOVERABLE_ERROR,
            criticalCount: criticalImages.length,
            decodedCount,
            fallbackCount,
            error: `${errorCount} critical image(s) failed without verified fallback`
          });
        } else if (decodedCount === criticalImages.length) {
          finish({
            outcome: WORK_READINESS_OUTCOMES.CRITICAL_MEDIA_READY,
            criticalCount: criticalImages.length,
            decodedCount,
            fallbackCount: 0
          });
        } else if (decodedCount + fallbackCount === criticalImages.length && fallbackCount > 0) {
          finish({
            outcome: WORK_READINESS_OUTCOMES.VERIFIED_FALLBACK_READY,
            criticalCount: criticalImages.length,
            decodedCount,
            fallbackCount
          });
        } else {
          finish({
            outcome: WORK_READINESS_OUTCOMES.RECOVERABLE_ERROR,
            criticalCount: criticalImages.length,
            decodedCount,
            fallbackCount,
            error: 'Incomplete media readiness resolution'
          });
        }
      })
      .catch((err) => {
        finish({
          outcome: WORK_READINESS_OUTCOMES.RECOVERABLE_ERROR,
          criticalCount: criticalImages.length,
          decodedCount: 0,
          fallbackCount: 0,
          error: err ? err.message : 'Media readiness failure'
        });
      });
  });
}
