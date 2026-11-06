/**
 * MONDO — Project Detail First-View Readiness (Stage G3.3-D)
 * Isolated helper assessing Project Detail visual readiness and
 * critical hero media decoding for Option C Hybrid Navigation.
 *
 * MANDATORY GOVERNANCE & AMENDMENT COMPLIANCE:
 * - Amendment D-02 (Authentic Project Readiness):
 *   Evaluates structural readiness (#project-main, #project-intro-wrap, #project-media, #project-story),
 *   project data readiness (non-empty title, absence of error host/classes),
 *   hero image/video decoding, typography gate (bounded by 200ms ceiling),
 *   and verified fallback evidence.
 *   Never accepts DATA_READY as first-view readiness unless project data/template
 *   explicitly establishes no hero media is required and essential first-view content is verified.
 * - Strict Timeout Integrity:
 *   A timeout strictly returns TIMED_OUT (NEVER CRITICAL_MEDIA_READY or VERIFIED_FALLBACK_READY).
 *   All Project-specific deadlines (safetyTimeoutMs, decodeTimeoutMs, fontGateMs)
 *   remain configurable at the helper boundary without unapproved frozen constants.
 * - STRICT DORMANCY:
 *   Zero window event listeners on import, zero top-level DOM access,
 *   zero automatic timers, zero navigation mutation.
 */

/**
 * Deterministic outcome states for Project Detail readiness assessment.
 */
export const PROJECT_READINESS_OUTCOMES = Object.freeze({
  STRUCTURAL_READY: 'STRUCTURAL_READY',
  DATA_READY: 'DATA_READY',
  CRITICAL_MEDIA_READY: 'CRITICAL_MEDIA_READY',
  VERIFIED_FALLBACK_READY: 'VERIFIED_FALLBACK_READY',
  RECOVERABLE_ERROR: 'RECOVERABLE_ERROR',
  TIMED_OUT: 'TIMED_OUT',
  ABORTED: 'ABORTED'
});

export const DEFAULT_PROJECT_READINESS_DEADLINE_MS = 3500;
export const DEFAULT_PROJECT_DECODE_DEADLINE_MS = 2500;
export const DEFAULT_PROJECT_FONT_GATE_DEADLINE_MS = 200;

/**
 * Validates the structural presence of essential Project Detail landmark containers.
 *
 * @param {Document|HTMLElement|null} [root=null] Root context to evaluate
 * @returns {{ ok: boolean, landmarkEl?: HTMLElement, projectMainEl?: HTMLElement, introWrapEl?: HTMLElement, mediaEl?: HTMLElement, storyEl?: HTMLElement, error?: string }}
 */
export function checkProjectStructure(root = (typeof document !== 'undefined' ? document : null)) {
  if (!root || typeof root.querySelector !== 'function') {
    return { ok: false, error: 'Invalid or missing document root' };
  }

  const landmarkEl = root.querySelector('main#main') || (root.getElementById ? root.getElementById('main') : null);
  if (!landmarkEl) {
    return { ok: false, error: 'Missing required landmark <main id="main">' };
  }

  const projectMainEl = landmarkEl.querySelector('#project-main') || (root.getElementById ? root.getElementById('project-main') : null);
  if (!projectMainEl) {
    return { ok: false, landmarkEl, error: 'Missing required project container #project-main' };
  }

  const introWrapEl = projectMainEl.querySelector('#project-intro-wrap') || projectMainEl.querySelector('.project-intro');
  const mediaEl = projectMainEl.querySelector('#project-media') || projectMainEl.querySelector('.project-media');
  const storyEl = projectMainEl.querySelector('#project-story') || projectMainEl.querySelector('.project-story');

  return {
    ok: true,
    landmarkEl,
    projectMainEl,
    introWrapEl,
    mediaEl,
    storyEl
  };
}

/**
 * Validates project data readiness, verifying essential title/heading presence
 * and ensuring no error state or not-found card is active.
 *
 * @param {Document|HTMLElement|null} [root=null] Root context to evaluate
 * @param {object|string} [options={}] Options or expected slug string
 * @returns {{ ok: boolean, title?: string, slug?: string, hasError?: boolean, error?: string }}
 */
export function checkProjectData(root = (typeof document !== 'undefined' ? document : null), options = {}) {
  const structure = checkProjectStructure(root);
  if (!structure.ok) {
    return { ok: false, hasError: false, error: structure.error };
  }

  const expectedSlug = typeof options === 'string' ? options : (options.slug || options.expectedSlug || '');
  const { projectMainEl, introWrapEl } = structure;

  // 1. Check for error or not-found classes on #project-main
  if (projectMainEl.classList) {
    if (projectMainEl.classList.contains('has-project-error')) {
      return { ok: false, hasError: true, error: 'Project main container has has-project-error class' };
    }
    if (projectMainEl.classList.contains('has-project-not-found')) {
      return { ok: false, hasError: true, error: 'Project main container has has-project-not-found class' };
    }
  }

  // 2. Check for active visible error host
  const errorHost = projectMainEl.querySelector('#project-error-host') ||
    (root.getElementById ? root.getElementById('project-error-host') : null);
  if (errorHost && !errorHost.hidden) {
    const hasErrorContent = (errorHost.children && errorHost.children.length > 0) ||
      (errorHost.textContent && errorHost.textContent.trim().length > 0);
    if (hasErrorContent) {
      return { ok: false, hasError: true, error: 'Project error host contains visible error content' };
    }
  }

  // 3. Check for populated heading element
  const searchRoot = introWrapEl || projectMainEl;
  const titleEl = searchRoot.querySelector('h1') || searchRoot.querySelector('.project-title');
  if (!titleEl || !titleEl.textContent || titleEl.textContent.trim().length === 0) {
    return { ok: false, hasError: false, error: 'Missing or empty project title heading' };
  }

  const title = titleEl.textContent.trim();

  // 4. Validate slug correlation if specified
  if (expectedSlug) {
    const renderedSlug = (projectMainEl.dataset && projectMainEl.dataset.projectSlug) ||
      (projectMainEl.getAttribute && projectMainEl.getAttribute('data-project-slug'));
    if (renderedSlug && renderedSlug !== expectedSlug) {
      return {
        ok: false,
        hasError: false,
        error: `Project slug mismatch: expected "${expectedSlug}", found "${renderedSlug}"`
      };
    }
  }

  return {
    ok: true,
    title,
    slug: expectedSlug || undefined
  };
}

/**
 * Checks whether an authentic visual fallback exists for a hero media element.
 * Evidence includes:
 * - Direct element marker (data-fallback-verified="true" or .has-fallback-visual)
 * - Container marker (.concept-label, .project-cover, data-fallback-verified="true")
 *
 * @param {HTMLElement} heroEl - Media element (img or video)
 * @returns {boolean} True if verified fallback evidence exists
 */
export function hasVerifiedFallback(heroEl) {
  if (!heroEl) return false;

  // Direct element marker
  if (heroEl.dataset && heroEl.dataset.fallbackVerified === 'true') {
    return true;
  }
  if (heroEl.getAttribute && heroEl.getAttribute('data-fallback-verified') === 'true') {
    return true;
  }
  if (heroEl.classList && heroEl.classList.contains('has-fallback-visual')) {
    return true;
  }

  // Inspect parent container (#project-media or .project-media-wrap)
  const container = heroEl.closest
    ? (heroEl.closest('#project-media') || heroEl.closest('.project-media-wrap') || heroEl.closest('.project-cover'))
    : heroEl.parentNode;

  if (!container) return false;

  if (container.dataset && container.dataset.fallbackVerified === 'true') {
    return true;
  }
  if (container.getAttribute && container.getAttribute('data-fallback-verified') === 'true') {
    return true;
  }
  if (container.classList && container.classList.contains('has-fallback-visual')) {
    return true;
  }

  // Authentic MONDO project detail visual features
  const hasConceptLabel = Boolean(container.querySelector && container.querySelector('.concept-label'));
  const hasProjectCover = Boolean(
    (container.classList && container.classList.contains('project-cover')) ||
    (container.querySelector && container.querySelector('.project-cover'))
  );

  return Boolean(hasProjectCover && hasConceptLabel);
}

/**
 * Evaluates the readiness of a Project hero media element (image or video).
 *
 * @param {HTMLImageElement|HTMLVideoElement} heroEl - Hero media element
 * @param {object} [options={}]
 * @param {number} [options.decodeTimeoutMs=2500] Caller-configured decode timeout
 * @param {AbortSignal|null} [options.signal=null] Cancellation signal
 * @param {Function} [options.decodeImpl] Injected decode function
 * @returns {Promise<{ status: string, error?: string }>}
 */
export function evaluateHeroMedia(heroEl, options = {}) {
  const {
    decodeTimeoutMs = DEFAULT_PROJECT_DECODE_DEADLINE_MS,
    signal = null,
    decodeImpl = null
  } = options;

  if (!heroEl) {
    return Promise.resolve({ status: 'error', error: 'Missing hero media element' });
  }

  if (signal && signal.aborted) {
    return Promise.resolve({ status: 'aborted', error: 'Readiness evaluation aborted' });
  }

  const tagName = (heroEl.tagName || '').toUpperCase();

  // ─────────────────────────────────────────────────────────────────────────
  // Branch A: Image Media
  // ─────────────────────────────────────────────────────────────────────────
  if (tagName === 'IMG') {
    // Check if already decoded
    if (heroEl.naturalWidth > 0 && heroEl.complete) {
      return Promise.resolve({ status: 'decoded' });
    }
    if (heroEl.classList && heroEl.classList.contains('is-decoded')) {
      return Promise.resolve({ status: 'decoded' });
    }

    const decodeFn = decodeImpl || (typeof heroEl.decode === 'function' ? () => heroEl.decode() : null);

    if (!decodeFn) {
      if (heroEl.complete && heroEl.naturalWidth > 0) {
        return Promise.resolve({ status: 'decoded' });
      }
      if (hasVerifiedFallback(heroEl)) {
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
          finish({ status: 'timeout', error: `Decode timed out after ${decodeTimeoutMs}ms` });
        }, decodeTimeoutMs);
      }

      decodeFn()
        .then(() => {
          if (heroEl.naturalWidth > 0 || heroEl.width > 0) {
            finish({ status: 'decoded' });
          } else {
            if (hasVerifiedFallback(heroEl)) {
              finish({ status: 'fallback', error: 'Zero dimensions decoded with fallback' });
            } else {
              finish({ status: 'error', error: 'Zero dimensions decoded' });
            }
          }
        })
        .catch((err) => {
          if (hasVerifiedFallback(heroEl)) {
            finish({ status: 'fallback', error: err ? err.message : 'Decode rejected with fallback' });
          } else {
            finish({ status: 'error', error: err ? err.message : 'Decode rejected' });
          }
        });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Branch B: Video Media
  // ─────────────────────────────────────────────────────────────────────────
  if (tagName === 'VIDEO') {
    // Video ready if readyState >= 2 (HAVE_CURRENT_DATA) or explicitly marked ready
    if ((heroEl.readyState !== undefined && heroEl.readyState >= 2) ||
        (heroEl.classList && heroEl.classList.contains('is-ready')) ||
        (heroEl.currentTime && heroEl.currentTime > 0)) {
      return Promise.resolve({ status: 'decoded' });
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
        if (typeof heroEl.removeEventListener === 'function') {
          heroEl.removeEventListener('loadeddata', onReady);
          heroEl.removeEventListener('canplay', onReady);
          heroEl.removeEventListener('error', onError);
        }
      };

      const finish = (result) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };

      const onAbort = () => finish({ status: 'aborted', error: 'Evaluation aborted' });
      const onReady = () => finish({ status: 'decoded' });
      const onError = (e) => {
        if (hasVerifiedFallback(heroEl)) {
          finish({ status: 'fallback', error: 'Video failed with verified fallback' });
        } else {
          finish({ status: 'error', error: e && e.message ? e.message : 'Video playback error' });
        }
      };

      if (signal) {
        if (signal.aborted) return onAbort();
        signal.addEventListener('abort', onAbort, { once: true });
      }

      if (decodeTimeoutMs > 0) {
        timerId = setTimeout(() => {
          timerId = null;
          finish({ status: 'timeout', error: `Video ready timed out after ${decodeTimeoutMs}ms` });
        }, decodeTimeoutMs);
      }

      if (typeof heroEl.addEventListener === 'function') {
        heroEl.addEventListener('loadeddata', onReady, { once: true });
        heroEl.addEventListener('canplay', onReady, { once: true });
        heroEl.addEventListener('error', onError, { once: true });
      } else {
        // Fallback for non-event mock video
        if (hasVerifiedFallback(heroEl)) {
          finish({ status: 'fallback' });
        } else {
          finish({ status: 'error', error: 'Video event listeners not supported' });
        }
      }
    });
  }

  return Promise.resolve({ status: 'error', error: `Unsupported media element tag: ${tagName}` });
}

/**
 * Awaits font readiness up to a caller-configured bounded ceiling.
 *
 * @param {FontFaceSet|null} fonts - document.fonts
 * @param {number} fontGateMs - Maximum gate ceiling in ms
 * @param {AbortSignal|null} signal - Cancellation signal
 * @returns {Promise<boolean>} True if ready, false if timed out or failed
 */
export function gateProjectFonts(fonts, fontGateMs = DEFAULT_PROJECT_FONT_GATE_DEADLINE_MS, signal = null) {
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
 * Primary orchestrator assessing whether the Project Detail first view is ready.
 * Evaluates structural readiness, project data, typography gate, and critical hero media.
 *
 * MANDATORY AMENDMENT D-02 COMPLIANCE:
 * - Never accepts DATA_READY unless project data/template explicitly establishes
 *   no hero media is required and essential first-view content is verified.
 * - Strict Timeout Integrity: A timeout strictly returns TIMED_OUT
 *   (NEVER CRITICAL_MEDIA_READY or VERIFIED_FALLBACK_READY).
 *
 * @param {object} [options={}]
 * @param {Document|HTMLElement|null} [options.root] Root DOM element
 * @param {string} [options.expectedSlug] Expected project slug
 * @param {number} [options.safetyTimeoutMs=3500] Caller-configurable overall ceiling
 * @param {number} [options.decodeTimeoutMs=2500] Caller-configurable media timeout
 * @param {number} [options.fontGateMs=200] Caller-configurable font gate timeout
 * @param {AbortSignal|null} [options.signal=null] Cancellation signal
 * @param {FontFaceSet|null} [options.fonts] FontFaceSet instance
 * @param {boolean} [options.allowNoMedia=false] Explicit exemption when no hero media is required
 * @param {Function} [options.now] Custom timestamp provider
 * @returns {Promise<{ outcome: string, mediaStatus?: string, durationMs: number, error?: string }>}
 */
export async function awaitProjectFirstViewReady(options = {}) {
  const {
    root = (typeof document !== 'undefined' ? document : null),
    expectedSlug = '',
    safetyTimeoutMs = DEFAULT_PROJECT_READINESS_DEADLINE_MS,
    decodeTimeoutMs = DEFAULT_PROJECT_DECODE_DEADLINE_MS,
    fontGateMs = DEFAULT_PROJECT_FONT_GATE_DEADLINE_MS,
    signal = null,
    fonts = (typeof document !== 'undefined' ? document.fonts : null),
    allowNoMedia = false,
    now = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now())
  } = options;

  const startTime = now();

  // 1. Cancellation check before start
  if (signal && signal.aborted) {
    return {
      outcome: PROJECT_READINESS_OUTCOMES.ABORTED,
      durationMs: 0,
      error: 'Readiness evaluation aborted before start'
    };
  }

  // 2. Structural Readiness Check
  const structure = checkProjectStructure(root);
  if (!structure.ok) {
    return {
      outcome: PROJECT_READINESS_OUTCOMES.RECOVERABLE_ERROR,
      durationMs: Math.round(now() - startTime),
      error: structure.error
    };
  }

  // 3. Project Data Readiness Check
  const dataCheck = checkProjectData(root, { expectedSlug });
  if (!dataCheck.ok) {
    return {
      outcome: PROJECT_READINESS_OUTCOMES.RECOVERABLE_ERROR,
      durationMs: Math.round(now() - startTime),
      error: dataCheck.error
    };
  }

  // 4. Font Gate Settlement
  if (fontGateMs > 0 && fonts) {
    await gateProjectFonts(fonts, fontGateMs, signal);
  }

  if (signal && signal.aborted) {
    return {
      outcome: PROJECT_READINESS_OUTCOMES.ABORTED,
      durationMs: Math.round(now() - startTime),
      error: 'Readiness evaluation aborted after font gate'
    };
  }

  // 5. Critical Hero Media Detection
  const { mediaEl } = structure;
  const heroImg = mediaEl ? (mediaEl.querySelector('img') || (mediaEl.tagName === 'IMG' ? mediaEl : null)) : null;
  const heroVideo = mediaEl ? (mediaEl.querySelector('video') || (mediaEl.tagName === 'VIDEO' ? mediaEl : null)) : null;
  const heroMedia = heroImg || heroVideo;

  if (!heroMedia) {
    // Amendment D-02: Never accept DATA_READY unless project data/template explicitly
    // establishes no hero media is required and essential first-view content is verified.
    const explicitNoMediaEstablished = Boolean(
      allowNoMedia ||
      (mediaEl && (
        mediaEl.dataset?.noMedia === 'true' ||
        mediaEl.getAttribute?.('data-no-media') === 'true' ||
        mediaEl.classList?.contains('no-hero-media')
      ))
    );

    if (explicitNoMediaEstablished) {
      return {
        outcome: PROJECT_READINESS_OUTCOMES.DATA_READY,
        durationMs: Math.round(now() - startTime)
      };
    }

    return {
      outcome: PROJECT_READINESS_OUTCOMES.RECOVERABLE_ERROR,
      durationMs: Math.round(now() - startTime),
      error: 'Project has no hero media element and explicit no-media exemption is not established'
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
      outcome: PROJECT_READINESS_OUTCOMES.ABORTED,
      error: 'Evaluation aborted during media decoding'
    });

    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
    }

    // Safety timeout ceiling enforcement (Amendment D-02: TIMED_OUT is NEVER READY)
    if (remainingSafetyMs > 0) {
      safetyTimerId = setTimeout(() => {
        safetyTimerId = null;
        finish({
          outcome: PROJECT_READINESS_OUTCOMES.TIMED_OUT,
          error: `Project readiness safety ceiling elapsed after ${safetyTimeoutMs}ms`
        });
      }, remainingSafetyMs);
    }

    evaluateHeroMedia(heroMedia, {
      decodeTimeoutMs: Math.min(decodeTimeoutMs, remainingSafetyMs),
      signal
    })
      .then((res) => {
        if (res.status === 'decoded') {
          finish({
            outcome: PROJECT_READINESS_OUTCOMES.CRITICAL_MEDIA_READY,
            mediaStatus: res.status
          });
        } else if (res.status === 'fallback') {
          finish({
            outcome: PROJECT_READINESS_OUTCOMES.VERIFIED_FALLBACK_READY,
            mediaStatus: res.status
          });
        } else if (res.status === 'timeout') {
          finish({
            outcome: PROJECT_READINESS_OUTCOMES.TIMED_OUT,
            mediaStatus: res.status,
            error: res.error || 'Hero media decode timed out'
          });
        } else if (res.status === 'aborted') {
          finish({
            outcome: PROJECT_READINESS_OUTCOMES.ABORTED,
            mediaStatus: res.status
          });
        } else {
          finish({
            outcome: PROJECT_READINESS_OUTCOMES.RECOVERABLE_ERROR,
            mediaStatus: res.status,
            error: res.error || 'Hero media decode failed without verified fallback'
          });
        }
      })
      .catch((err) => {
        finish({
          outcome: PROJECT_READINESS_OUTCOMES.RECOVERABLE_ERROR,
          error: err ? err.message : 'Media evaluation failure'
        });
      });
  });
}

