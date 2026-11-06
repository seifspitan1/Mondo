/**
 * MONDO — Quiet Mark Page Transition (Phase 5B.3B / Phase 5C.2A Resilience)
 *
 * Owner-approved Concept 01: a minimal, calm page transition.
 *
 * Visual sequence (420ms total):
 *   1. Existing page yields to a pure-black veil.
 *   2. White MONDO symbol appears centered with ~2% scale movement.
 *   3. Symbol holds briefly, then fades.
 *   4. Destination page is revealed.
 *
 * Architecture:
 *   - Outbound: overlay fades in over the current page, logo appears,
 *     then browser navigates. A structured sessionStorage record signals the inbound page.
 *   - Inbound: destination page detects the record, verifies route match and freshness,
 *     keeps the overlay visible while the page loads, then plays the reveal (second half).
 *
 * Session key: mondo_quiet_mark_pending (NOT mondo_transition_pending)
 */

const SESSION_KEY = 'mondo_quiet_mark_pending';
const ANIMATION_DURATION = 420; // ms — matches approved lab reference
const OUTBOUND_DURATION = Math.round(ANIMATION_DURATION * 0.54); // ~227ms — veil fully opaque + logo visible
const INBOUND_DURATION = ANIMATION_DURATION - OUTBOUND_DURATION;  // ~193ms — reveal
const MAX_TRANSITION_AGE = 15000; // ms — maximum age to recognize a slow cross-document navigation (15s)
const STALL_TIMEOUT = 8000; // ms — safety fallback if network completely hangs without unloading

// Overlay element IDs
const OVERLAY_ID = 'mondo-quiet-mark';
const LOGO_ID = 'mondo-quiet-mark-logo';
const BREATH_ID = 'mondo-quiet-mark-breath';
const STATUS_ID = 'mondo-quiet-mark-status';

// ─── Adaptive Quiet Mark Constants (Phase 5C.3.3-AQ1 Pilot) ──
export const AQM_STATES = Object.freeze({
  IDLE: 'idle',
  QUIET: 'quiet',
  BREATHING: 'breathing',
  STATUS: 'status',
  REVEALING: 'revealing',
  DISMISSED: 'dismissed'
});

export const AQM_BREATHING_THRESHOLD_MS = 250;
export const AQM_STATUS_THRESHOLD_MS = 2500;
export const AQM_SAFETY_TIMEOUT_MS = 3500;
export const AQM_ONSET_DURATION_MS = 450;
export const AQM_HOLD_SCALE = 1.0042;
export const AQM_STATUS_TEXT = 'LOADING PROJECT DETAILS…';

let hydratedLogoAttemptSeq = 0;

function bindLogoReadiness(logoEl, containerEl) {
  if (!logoEl || !containerEl || !containerEl.classList) return;
  if (typeof window !== 'undefined' && typeof window.__MONDO_BIND_LOGO_READINESS__ === 'function') {
    window.__MONDO_BIND_LOGO_READINESS__(logoEl, containerEl);
    return;
  }
  const attemptId = ++hydratedLogoAttemptSeq;
  containerEl.classList.add('is-logo-pending');

  function onDecodeSuccess() {
    if (attemptId !== hydratedLogoAttemptSeq) return;
    // Decision D27: Rely strictly on lifecycle dismissal; aria-hidden is decorative accessibility state
    if (containerEl && containerEl.getAttribute('data-qm-state') === 'dismissed') return;
    if (logoEl.naturalWidth > 0) {
      logoEl.classList.add('is-decoded');
      if (logoEl.style) {
        logoEl.style.visibility = '';
        logoEl.style.opacity = '1';
      }
      containerEl.classList.remove('is-logo-pending', 'is-logo-failed');
      containerEl.classList.add('is-logo-ready');
    } else {
      onDecodeFailure();
    }
  }

  function onDecodeFailure() {
    if (attemptId !== hydratedLogoAttemptSeq) return;
    logoEl.classList.remove('is-decoded');
    if (logoEl.style) {
      logoEl.style.visibility = 'hidden';
      logoEl.style.opacity = '0';
    }
    containerEl.classList.remove('is-logo-pending', 'is-logo-ready');
    containerEl.classList.add('is-logo-failed');
  }

  if (typeof logoEl.decode === 'function') {
    logoEl.decode().then(onDecodeSuccess).catch(() => {
      // Decision D25: Strict decode rejection — never reveal image on rejected decode()
      onDecodeFailure();
    });
  } else {
    // Unsupported browser fallback (only when HTMLImageElement.prototype.decode is absent)
    if (logoEl.complete && logoEl.naturalWidth > 0) {
      onDecodeSuccess();
    } else if (typeof logoEl.addEventListener === 'function') {
      logoEl.addEventListener('load', () => {
        if (logoEl.naturalWidth > 0) onDecodeSuccess();
        else onDecodeFailure();
      }, { once: true });
      logoEl.addEventListener('error', onDecodeFailure, { once: true });
    }
  }
}

/**
 * Pilot-scoped state machine for Adaptive Quiet Mark waiting states on /work/:slug.
 *
 * Valid transitions:
 *   idle -> quiet
 *   quiet -> revealing
 *   quiet -> breathing
 *   breathing -> revealing
 *   breathing -> status
 *   status -> revealing
 *   revealing -> dismissed
 *   any active state -> dismissed
 */
export function createAdaptiveQuietMarkController(options = {}) {
  const {
    overlay = typeof document !== 'undefined' ? document.getElementById(OVERLAY_ID) : null,
    breathEl = typeof document !== 'undefined' ? document.getElementById(BREATH_ID) : null,
    statusEl = typeof document !== 'undefined' ? document.getElementById(STATUS_ID) : null,
    breathingThresholdMs = AQM_BREATHING_THRESHOLD_MS,
    statusThresholdMs = AQM_STATUS_THRESHOLD_MS,
    reducedMotion = false,
    initialState = AQM_STATES.IDLE,
    startTime: providedStartTime = null,
    breathingAt: providedBreathingAt = null,
    statusAt: providedStatusAt = null,
    autoStart = true,
    now = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now()),
    onStateChange = null
  } = options;

  let state = AQM_STATES.IDLE;
  let startTime = providedStartTime !== null ? providedStartTime : null;
  let breathingAt = providedBreathingAt;
  let statusAt = providedStatusAt;
  let revealedAt = null;
  let dismissedAt = null;
  let breathingTimer = null;
  let statusTimer = null;
  const transitions = [];

  function recordTransition(from, to, reason) {
    const ts = now();
    state = to;
    transitions.push({ from, to, at: ts, reason });
    if (overlay && typeof overlay.setAttribute === 'function') {
      overlay.setAttribute('data-qm-state', to);
    }
    if (typeof onStateChange === 'function') {
      try {
        onStateChange({ from, to, at: ts, reason, state: to });
      } catch (_) { /* ignore listener errors */ }
    }
  }

  function clearTimers() {
    if (breathingTimer !== null) {
      clearTimeout(breathingTimer);
      breathingTimer = null;
    }
    if (statusTimer !== null) {
      clearTimeout(statusTimer);
      statusTimer = null;
    }
  }

  function enterBreathing(reason = 'threshold_250ms') {
    // Never enter breathing except from quiet; never after revealing or dismissed
    if (state !== AQM_STATES.QUIET) return false;

    // Under prefers-reduced-motion: suppress decorative breathing while preserving waiting state
    if (reducedMotion) {
      return false;
    }

    if (breathingAt === null) {
      breathingAt = now();
    }
    recordTransition(AQM_STATES.QUIET, AQM_STATES.BREATHING, reason);

    if (overlay) {
      if (overlay.classList) overlay.classList.add('is-qm-breathing');
      if (typeof overlay.setAttribute === 'function') overlay.setAttribute('aria-hidden', 'true');
    }
    if (typeof document !== 'undefined' && document.documentElement && document.documentElement.classList) {
      document.documentElement.classList.add('is-qm-breathing');
    }
    return true;
  }

  function enterStatus(reason = 'threshold_2500ms') {
    // Only allow entering status from breathing (or from quiet when reducedMotion suppresses breathing)
    if (state !== AQM_STATES.BREATHING && state !== AQM_STATES.QUIET) return false;

    if (state === AQM_STATES.QUIET && !reducedMotion) {
      enterBreathing('implicit_before_status');
    }

    if (statusAt === null) {
      statusAt = now();
    }
    recordTransition(state, AQM_STATES.STATUS, reason);

    if (overlay) {
      if (overlay.classList) overlay.classList.add('is-qm-status');
      if (typeof overlay.setAttribute === 'function') overlay.setAttribute('aria-hidden', 'false');
    }
    if (typeof document !== 'undefined' && document.documentElement && document.documentElement.classList) {
      document.documentElement.classList.add('is-qm-status');
    }
    if (statusEl) {
      if (statusEl.textContent !== AQM_STATUS_TEXT) {
        statusEl.textContent = AQM_STATUS_TEXT;
      }
      if (statusEl.classList) statusEl.classList.add('is-visible');
    }
    return true;
  }

  function reveal(reason = 'ready') {
    // Only transition to revealing from an active waiting state (quiet, breathing, status)
    if (
      state !== AQM_STATES.QUIET &&
      state !== AQM_STATES.BREATHING &&
      state !== AQM_STATES.STATUS
    ) {
      return false;
    }

    clearTimers();
    revealedAt = now();

    // Capture current computed breathing transform/opacity in-place and pause so inbound reveal never snaps
    if (breathEl && breathEl.style) {
      if (typeof window !== 'undefined' && typeof window.getComputedStyle === 'function') {
        try {
          const cs = window.getComputedStyle(breathEl);
          if (cs && cs.transform && cs.transform !== 'none') {
            breathEl.style.transform = cs.transform;
          }
          if (cs && cs.opacity) {
            breathEl.style.opacity = cs.opacity;
          }
        } catch (_) { /* ignore non-DOM test mocks */ }
      }
      breathEl.style.animationPlayState = 'paused';
    }
    if (overlay) {
      if (overlay.classList) overlay.classList.remove('is-qm-status');
      if (typeof overlay.setAttribute === 'function') overlay.setAttribute('aria-hidden', 'true');
    }
    if (typeof document !== 'undefined' && document.documentElement && document.documentElement.classList) {
      document.documentElement.classList.remove('is-qm-status');
    }
    if (statusEl) {
      if (statusEl.classList) statusEl.classList.remove('is-visible');
      statusEl.textContent = '';
    }

    recordTransition(state, AQM_STATES.REVEALING, reason);
    return true;
  }

  function dismiss(reason = 'complete') {
    if (state === AQM_STATES.DISMISSED) return false;

    clearTimers();
    dismissedAt = now();

    if (overlay) {
      if (overlay.classList) overlay.classList.remove('is-qm-breathing', 'is-qm-status');
      if (typeof overlay.setAttribute === 'function') overlay.setAttribute('aria-hidden', 'true');
    }
    if (breathEl && breathEl.style) {
      breathEl.style.animationPlayState = '';
      breathEl.style.transform = '';
      breathEl.style.opacity = '';
    }
    if (statusEl) {
      if (statusEl.classList) statusEl.classList.remove('is-visible');
      statusEl.textContent = '';
    }
    if (typeof document !== 'undefined' && document.documentElement && document.documentElement.classList) {
      document.documentElement.classList.remove('is-qm-breathing', 'is-qm-status');
    }

    recordTransition(state, AQM_STATES.DISMISSED, reason);
    return true;
  }

  function start() {
    if (state !== AQM_STATES.IDLE) return state;
    if (startTime === null) {
      startTime = now();
    }

    const preserveBreathing = initialState === AQM_STATES.BREATHING || initialState === AQM_STATES.STATUS;
    const preserveStatus = initialState === AQM_STATES.STATUS;

    if (overlay) {
      if (overlay.classList) {
        if (!preserveBreathing) overlay.classList.remove('is-qm-breathing');
        if (!preserveStatus) overlay.classList.remove('is-qm-status');
      }
      if (typeof overlay.setAttribute === 'function' && !preserveStatus) {
        overlay.setAttribute('aria-hidden', 'true');
      }
    }
    if (breathEl && breathEl.style) {
      breathEl.style.animationPlayState = '';
    }
    if (statusEl && !preserveStatus) {
      statusEl.textContent = '';
      if (statusEl.classList) statusEl.classList.remove('is-visible');
    }

    recordTransition(AQM_STATES.IDLE, AQM_STATES.QUIET, 'inbound_start');

    if (preserveBreathing) {
      enterBreathing('adopted_early');
    }
    if (preserveStatus) {
      enterStatus('adopted_early');
    }

    const elapsed = Math.max(0, now() - startTime);
    if (state === AQM_STATES.QUIET) {
      const remBreath = Math.max(0, breathingThresholdMs - elapsed);
      breathingTimer = setTimeout(() => {
        breathingTimer = null;
        enterBreathing('threshold_250ms');
      }, remBreath);
    }

    if (state === AQM_STATES.QUIET || state === AQM_STATES.BREATHING) {
      const remStatus = Math.max(0, statusThresholdMs - elapsed);
      statusTimer = setTimeout(() => {
        statusTimer = null;
        enterStatus('threshold_2500ms');
      }, remStatus);
    }

    return state;
  }

  function getSnapshot() {
    return {
      state,
      startTime,
      breathingAt,
      statusAt,
      revealedAt,
      dismissedAt,
      reducedMotion,
      isBreathing: state === AQM_STATES.BREATHING || (state === AQM_STATES.STATUS && !reducedMotion),
      isStatusVisible: state === AQM_STATES.STATUS,
      statusText: statusEl ? statusEl.textContent : (state === AQM_STATES.STATUS ? AQM_STATUS_TEXT : ''),
      transitions: [...transitions]
    };
  }

  if (autoStart) {
    start();
  }

  return {
    start,
    enterBreathing,
    enterStatus,
    reveal,
    dismiss,
    clearTimers,
    getState: () => state,
    getSnapshot
  };
}

// ─── Path normalization helper ───────────────────────────────
function normalizePath(pathname) {
  if (!pathname) return '/';
  let clean = pathname.replace(/\/+$/, '');
  if (clean === '' || clean === '/index' || clean === '/index.html') return '/';
  clean = clean.replace(/\/index\.html$/, '').replace(/\/index$/, '');
  return clean === '' ? '/' : clean;
}

// ─── Easing ──────────────────────────────────────────────────
function clamp(v) { return Math.max(0, Math.min(1, v)); }
function smoothstep(x) { x = clamp(x); return x * x * (3 - 2 * x); }
function ease(x, a, b) { return smoothstep((x - a) / (b - a)); }

/**
 * Evaluates whether an anchor link targets the current document.
 * Distinguishes same-document navigation (including hash links, in-page section links
 * like /#services while on the Homepage, and same-page root links) from cross-document navigation.
 *
 * @param {HTMLAnchorElement|Element} anchor
 * @returns {boolean}
 */
export function isSameDocumentLink(anchor) {
  if (!anchor || typeof anchor.getAttribute !== 'function') return false;

  const rawHref = (anchor.getAttribute('href') || '').trim();
  if (!rawHref) return true;
  // Fragment-only links (e.g. "#services", "#main")
  if (rawHref.startsWith('#')) return true;

  // Non-HTTP protocols
  if (/^(mailto|tel|javascript|blob|data):/i.test(rawHref)) return false;

  try {
    const origin = (typeof location !== 'undefined' && location.origin) ? location.origin : 'http://localhost:3000';
    const targetUrl = new URL(anchor.href || rawHref, origin);

    // Cross-origin cannot be same document
    if (typeof location !== 'undefined' && location.origin && targetUrl.origin !== location.origin) {
      return false;
    }

    const currentCanonical = typeof location !== 'undefined' ? normalizePath(location.pathname) : '/';
    const targetCanonical = normalizePath(targetUrl.pathname);

    // If canonical routes differ, it is a cross-document navigation
    if (targetCanonical !== currentCanonical) {
      return false;
    }

    // Both point to the same canonical document!
    // 1. Same-page hash/section link (e.g. /#services while on / or /index.html)
    if (targetUrl.hash) return true;

    // 2. Same-page link targeting current page root (e.g. brand logo click on /)
    const currentSearch = (typeof location !== 'undefined' && location.search) ? location.search : '';
    if ((targetUrl.search || '') === currentSearch) return true;

    return false;
  } catch (_) {
    return false;
  }
}

// ─── Eligibility ─────────────────────────────────────────────
export function isEligibleLink(anchor) {
  if (!anchor || !anchor.href) return false;

  // Skip all same-document navigation (never trigger logo transition, veil, or coordinator)
  if (isSameDocumentLink(anchor)) return false;

  // Must be same origin
  try {
    const url = new URL(anchor.href, location.origin);
    if (url.origin !== location.origin) return false;
    // Skip admin pages
    if (url.pathname.startsWith('/admin')) return false;
  } catch (_) {
    return false;
  }

  // Skip downloads
  if (anchor.hasAttribute('download')) return false;
  // Skip target="_blank"
  if (anchor.target === '_blank') return false;

  return true;
}

// ─── Create overlay DOM ──────────────────────────────────────
function ensureOverlay() {
  let overlay = document.getElementById(OVERLAY_ID);
  if (overlay) {
    // Ensure Adaptive Quiet Mark inner structure exists around the SINGLE logo
    let inner = overlay.querySelector('.mondo-quiet-mark__inner');
    let breath = document.getElementById(BREATH_ID);
    let logo = document.getElementById(LOGO_ID);
    let status = document.getElementById(STATUS_ID);

    if (!logo) {
      logo = document.createElement('img');
      logo.id = LOGO_ID;
      logo.className = 'mondo-quiet-mark__logo';
      logo.src = '/assets/intro/mondo-white.png';
      logo.alt = '';
      logo.width = 610;
      logo.height = 870;
      logo.draggable = false;
    }

    if (!inner) {
      inner = document.createElement('div');
      inner.className = 'mondo-quiet-mark__inner';
      overlay.appendChild(inner);
    }

    if (!breath) {
      breath = document.createElement('div');
      breath.id = BREATH_ID;
      breath.className = 'mondo-quiet-mark__breath';
      inner.appendChild(breath);
    }

    if (logo.parentNode !== breath) {
      breath.appendChild(logo);
    }

    if (!status) {
      status = document.createElement('p');
      status.id = STATUS_ID;
      status.className = 'mondo-quiet-mark__status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      inner.appendChild(status);
    }

    bindLogoReadiness(logo, overlay);
    return overlay;
  }

  overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'mondo-quiet-mark';
  overlay.setAttribute('aria-hidden', 'true');

  const inner = document.createElement('div');
  inner.className = 'mondo-quiet-mark__inner';

  const breath = document.createElement('div');
  breath.id = BREATH_ID;
  breath.className = 'mondo-quiet-mark__breath';

  const logo = document.createElement('img');
  logo.id = LOGO_ID;
  logo.className = 'mondo-quiet-mark__logo';
  logo.src = '/assets/intro/mondo-white.png';
  logo.alt = '';
  logo.width = 610;
  logo.height = 870;
  logo.draggable = false;

  const status = document.createElement('p');
  status.id = STATUS_ID;
  status.className = 'mondo-quiet-mark__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  breath.appendChild(logo);
  inner.appendChild(breath);
  inner.appendChild(status);
  overlay.appendChild(inner);
  document.body.appendChild(overlay);
  bindLogoReadiness(logo, overlay);
  return overlay;
}

// ─── Outbound animation ──────────────────────────────────────
function playOutbound(href) {
  const overlay = ensureOverlay();
  const logo = document.getElementById(LOGO_ID);
  const breath = document.getElementById(BREATH_ID);
  const status = document.getElementById(STATUS_ID);

  // Ensure overlay is clean of any previous inbound waiting state
  overlay.classList.remove('is-qm-breathing', 'is-qm-status');
  overlay.removeAttribute('data-qm-state');
  overlay.setAttribute('aria-hidden', 'true');
  if (breath) {
    breath.style.animationPlayState = '';
    breath.style.transform = '';
    breath.style.opacity = '';
  }
  if (status) {
    status.textContent = '';
    status.classList.remove('is-visible');
  }

  // Ensure overlay is visible and reset
  overlay.style.opacity = '0';
  overlay.style.display = '';
  logo.style.opacity = '0';
  logo.style.transform = 'scale(0.978)';

  // Force reflow so the initial state applies
  overlay.offsetHeight; // eslint-disable-line no-unused-expressions

  const start = performance.now();

  return new Promise((resolve) => {
    function tick(now) {
      const elapsed = now - start;
      // Normalized progress for outbound: 0→0.54 of overall animation maps to 0→1.0
      const overallP = clamp(elapsed / ANIMATION_DURATION);

      // Veil opacity: ease in from p=0 to p=0.47
      const veilOpacity = ease(overallP, 0, 0.47);
      overlay.style.opacity = String(veilOpacity);

      // Logo opacity: ease in from p=0.10 to p=0.31
      const logoOpacity = ease(overallP, 0.10, 0.31);
      logo.style.opacity = String(logoOpacity);

      // Logo scale: 0.978 → ~1.02 from p=0.12 to p=0.84
      const scaleProgress = ease(overallP, 0.12, 0.84);
      const scale = 0.978 + 0.042 * scaleProgress;
      logo.style.transform = `scale(${scale.toFixed(4)})`;

      if (elapsed < OUTBOUND_DURATION) {
        requestAnimationFrame(tick);
      } else {
        // Ensure veil is fully opaque before navigation
        overlay.style.opacity = '1';
        resolve();
      }
    }
    requestAnimationFrame(tick);
  });
}

// ─── Inbound animation ───────────────────────────────────────
function playInbound() {
  const overlay = document.getElementById(OVERLAY_ID);
  const logo = document.getElementById(LOGO_ID);
  if (!overlay || !logo) return Promise.resolve();

  if (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    overlay.style.opacity = '0';
    overlay.style.display = 'none';
    logo.style.opacity = '0';
    document.documentElement.style.background = '';
    return Promise.resolve();
  }

  // Start state: veil opaque, logo visible at midpoint
  overlay.style.opacity = '1';
  overlay.style.display = '';

  const start = performance.now();

  return new Promise((resolve) => {
    function tick(now) {
      const elapsed = now - start;
      // Map elapsed time to the second half of the overall animation (p = 0.54 → 1.0)
      const overallP = clamp(0.54 + (elapsed / ANIMATION_DURATION) * 0.46);

      // Veil fades out: from p=0.54 to p=1.0
      const veilOpacity = 1 - ease(overallP, 0.54, 1);
      overlay.style.opacity = String(veilOpacity);

      // Logo fades out: from p=0.72 to p=0.91
      const logoOpacity = 1 - ease(overallP, 0.72, 0.91);
      logo.style.opacity = String(logoOpacity);

      // Logo scale continues
      const scaleProgress = ease(overallP, 0.12, 0.84);
      const scale = 0.978 + 0.042 * scaleProgress;
      logo.style.transform = `scale(${scale.toFixed(4)})`;

      if (elapsed < INBOUND_DURATION) {
        requestAnimationFrame(tick);
      } else {
        // Cleanup
        overlay.style.opacity = '0';
        overlay.style.display = 'none';
        logo.style.opacity = '0';
        document.documentElement.style.background = '';
        resolve();
      }
    }
    requestAnimationFrame(tick);
  });
}

// ─── Session State Helpers ───────────────────────────────────
function readPendingTransition() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    // Support legacy '1' for test compatibility
    if (raw === '1') {
      return { to: normalizePath(location.pathname), ts: Date.now() };
    }
    const data = JSON.parse(raw);
    if (data && typeof data === 'object' && typeof data.to === 'string') {
      const isFiniteTs = typeof data.ts === 'number' && isFinite(data.ts);
      const age = isFiniteTs ? Date.now() - data.ts : -1;
      if (age >= 0 && age <= MAX_TRANSITION_AGE) {
        return data;
      }
    }
    return null;
  } catch (_) {
    return null;
  }
}

function clearStaleState() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch (_) { /* ignore */ }
  document.documentElement.style.background = '';
  document.documentElement.classList.remove('is-quiet-mark-inbound');
  document.documentElement.classList.remove('is-qm-breathing', 'is-qm-status');
}

function cleanupAdaptiveControllers(reason) {
  if (typeof window === 'undefined') return;
  if (window.__MONDO_EARLY_QM__ && typeof window.__MONDO_EARLY_QM__.clearTimers === 'function') {
    window.__MONDO_EARLY_QM__.clearTimers();
  }
  if (window.__MONDO_ADAPTIVE_QM__ && typeof window.__MONDO_ADAPTIVE_QM__.dismiss === 'function') {
    window.__MONDO_ADAPTIVE_QM__.dismiss(reason);
  }
}

// ─── Dismiss overlay on demand (bfcache or visual cleanup) ──
let isNavigating = false;
let stallTimerId = null;

function dismissOverlay() {
  if (stallTimerId) {
    clearTimeout(stallTimerId);
    stallTimerId = null;
  }
  cleanupAdaptiveControllers('dismiss_overlay');
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) {
    overlay.style.opacity = '0';
    overlay.style.display = 'none';
  }
  const logo = document.getElementById(LOGO_ID);
  if (logo) {
    logo.style.opacity = '0';
  }
  document.documentElement.style.background = '';
  isNavigating = false;
  clearStaleState();
}

/**
 * Explicit cancellation pathway for in-flight outbound navigation.
 * Distinct from generic dismissOverlay() to prevent unintended window.stop()
 * during normal lifecycle events like bfcache restoration.
 */
function cancelPendingNavigation(reason) {
  if (!isNavigating) return;

  // 1. Clear stall safety timer
  if (stallTimerId) {
    clearTimeout(stallTimerId);
    stallTimerId = null;
  }

  cleanupAdaptiveControllers(reason || 'cancel_navigation');

  // 2. Attempt native browser navigation cancellation
  if (typeof window !== 'undefined' && typeof window.stop === 'function') {
    try {
      window.stop();
    } catch (_) { /* ignore environment restrictions */ }
  }

  // 3. Clear pending session state so destination cannot consume it
  clearStaleState();

  // 4. Dismiss visual overlay & restore background
  const overlay = document.getElementById(OVERLAY_ID);
  if (overlay) {
    overlay.style.opacity = '0';
    overlay.style.display = 'none';
  }
  const logo = document.getElementById(LOGO_ID);
  if (logo) {
    logo.style.opacity = '0';
  }
  document.documentElement.style.background = '';

  // 5. Release navigation lock so subsequent interactions succeed
  isNavigating = false;
}

// ─── Click interception ──────────────────────────────────────
function handleClick(e) {
  if (e.defaultPrevented) return;
  // Skip if modifier keys (user wants new tab)
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  // Skip non-left clicks
  if (e.button !== 0) return;

  // Skip if Main Intro is actively running on this page (dynamically checked at click time)
  if (document.documentElement.classList.contains('has-intro')) return;

  const anchor = e.target.closest('a');
  if (!anchor) return;

  // 1. Same-document navigation: explicit handling with ZERO logo transitions
  if (isSameDocumentLink(anchor)) {
    // Dismiss any residual transition overlay state
    dismissOverlay();

    const rawHref = (anchor.getAttribute('href') || '').trim();
    let hash = '';
    let targetPath = '';
    try {
      const parsed = new URL(anchor.href || rawHref, location.origin);
      hash = parsed.hash || '';
      targetPath = parsed.pathname || '';
    } catch (_) {
      if (rawHref.startsWith('#')) hash = rawHref;
    }

    const isReduced = Boolean(
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );

    // Case A: Link targets top of current document without hash (e.g. brand logo click on /)
    if (!hash) {
      if (typeof window !== 'undefined' && window.scrollY > 0) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: isReduced ? 'auto' : 'smooth' });
        if (location.hash && history.pushState) {
          history.pushState(null, '', location.pathname + location.search);
        }
      }
      return;
    }

    // Case B: Link targets a section anchor with hash (e.g. /#services, /#packages, #process)
    const targetId = decodeURIComponent(hash.slice(1));
    const targetEl = targetId
      ? (document.getElementById(targetId) || document.querySelector(`[name="${CSS.escape(targetId)}"]`))
      : null;

    if (targetEl) {
      e.preventDefault();
      if (location.hash !== hash) {
        if (typeof history !== 'undefined' && typeof history.pushState === 'function') {
          history.pushState(null, '', hash);
        } else {
          location.hash = hash;
        }
      }
      targetEl.scrollIntoView({ behavior: isReduced ? 'auto' : 'smooth' });
      return;
    }

    // Otherwise allow normal native fragment navigation to proceed
    return;
  }

  // 2. Cross-document navigation
  if (!isEligibleLink(anchor)) return;

  const href = anchor.href;
  let targetUrl;
  try {
    targetUrl = new URL(href, location.origin);
  } catch (_) {
    return;
  }
  const targetPath = normalizePath(targetUrl.pathname);

  // Decision D28: Reduced-motion transition token priming for eligible pilot routes (/work/:slug)
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const isPilotTarget = targetPath.startsWith('/work/') &&
      targetPath !== '/work' &&
      !targetPath.endsWith('.html');
    if (isPilotTarget) {
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({
          to: targetPath,
          ts: Date.now()
        }));
      } catch (_) { /* storage unavailable — fail safely */ }
    }
    // Allow ordinary browser navigation immediately; do not prevent default, do not animate
    return;
  }

  // Prevent duplicate concurrent transitions
  if (isNavigating) {
    e.preventDefault();
    return;
  }

  isNavigating = true;
  e.preventDefault();

  // Safety fallback: if page hasn't unloaded after STALL_TIMEOUT (8s),
  // cancel the stalled browser navigation and restore the source page
  if (stallTimerId) clearTimeout(stallTimerId);
  stallTimerId = setTimeout(() => {
    if (isNavigating) {
      cancelPendingNavigation('timeout');
    }
  }, STALL_TIMEOUT);

  playOutbound(href).then(() => {
    // If navigation was canceled while outbound was playing (e.g. Escape key), abort
    if (!isNavigating) return;

    // Store pending transition state associated with target destination and timestamp
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        to: targetPath,
        ts: Date.now()
      }));
    } catch (_) { /* storage unavailable */ }

    // Initiate native document navigation
    location.href = href;
  });
}

function renderPilotFallbackErrorIfNeeded() {
  if (typeof document === 'undefined') return;
  if (typeof window !== 'undefined' && window.__MONDO_PROJECT_READY__) return;
  if (typeof window !== 'undefined' && typeof window.__MONDO_MOUNT_PILOT_ERROR__ === 'function') {
    window.__MONDO_MOUNT_PILOT_ERROR__();
    return;
  }

  const main = document.getElementById('project-main');
  if (!main) return;

  if (typeof window !== 'undefined') {
    window.__MONDO_WATCHDOG_FIRED__ = true;
    if (typeof window.__MONDO_ABORT_PROJECT_OPERATION__ === 'function') {
      try { window.__MONDO_ABORT_PROJECT_OPERATION__(); } catch (_) { }
    }
  }
  if (document.documentElement && document.documentElement.classList) {
    document.documentElement.classList.add('is-project-pilot-error');
  }
  if (main.classList) {
    main.classList.add('has-project-error');
  }

  let host = document.getElementById('project-error-host');
  if (!host && typeof document.createElement === 'function' && typeof main.insertBefore === 'function') {
    host = document.createElement('div');
    host.id = 'project-error-host';
    host.className = 'project-error-host';
    main.insertBefore(host, main.firstChild || null);
  }

  const targetContainer = host || main;
  if (host) host.hidden = false;

  const isScriptFailed = typeof window !== 'undefined' && Boolean(
    window.__MONDO_SCRIPT_ERROR__ ||
    window.__MONDO_BOOTSTRAP_STATE__ === 'script_error'
  );
  const targetNoticeType = isScriptFailed ? 'error' : 'slow_startup';
  const currentNoticeType = host && typeof host.getAttribute === 'function' ? host.getAttribute('data-notice-type') : null;
  const existingErr = targetContainer.querySelector && targetContainer.querySelector('.project-error-state');

  if (!existingErr || currentNoticeType !== targetNoticeType) {
    if (host && typeof host.setAttribute === 'function') {
      host.setAttribute('data-notice-type', targetNoticeType);
    }
    const eyebrow = isScriptFailed ? 'CONNECTION ISSUE' : 'STARTUP NOTICE';
    const title = isScriptFailed ? 'Unable to load project.' : 'Loading is taking longer than expected.';
    const body = isScriptFailed
      ? 'We encountered a problem loading this project brief. Your connection may be offline or interrupted.'
      : 'The project assets are taking longer to load over your network connection. We are still connecting in the background.';
    const isRetryPending = typeof window !== 'undefined' && Boolean(window.__MONDO_RETRY_INTENT__);
    const btnLabel = isRetryPending ? 'Connecting\u2026' : 'Try again';
    const btnAttrs = isRetryPending ? ' disabled aria-busy="true" style="pointer-events: none;"' : '';

    targetContainer.innerHTML = '<div class="project-error-state" role="alert" tabindex="-1" style="text-align: center; padding: 100px 20px;">' +
      '<p class="eyebrow"><span class="lime-dot"></span> ' + eyebrow + '</p>' +
      '<h1>' + title + '</h1>' +
      '<p class="muted" style="max-width: 480px; margin: 16px auto 32px;">' + body + '</p>' +
      '<div style="display: flex; gap: 16px; justify-content: center; flex-wrap: wrap;">' +
      '<button class="button" id="project-retry-btn" type="button"' + btnAttrs + ' onclick="if(window.__MONDO_HANDLE_RETRY__){window.__MONDO_HANDLE_RETRY__();}else if(window.__MONDO_RETRY_PROJECT__){window.__MONDO_RETRY_PROJECT__();}else{window.location.reload();}">'+ btnLabel + '</button>' +
      '<a class="button button-outline" href="/work">Back to our work</a>' +
      '</div>' +
      '</div>';
  }
}

function focusPilotFallbackErrorIfPresent() {
  if (typeof document === 'undefined') return;
  const errBox = document.querySelector('.project-error-state');
  if (!errBox || typeof errBox.focus !== 'function') return;
  if (errBox.getAttribute && errBox.getAttribute('data-focus-managed') === 'true') return;
  const host = document.getElementById('project-error-host');
  const active = document.activeElement;
  if (host && active && typeof host.contains === 'function' && host.contains(active)) return;
  if (typeof errBox.setAttribute === 'function') {
    errBox.setAttribute('data-focus-managed', 'true');
  }
  try { errBox.focus(); } catch (_) { /* ignore */ }
}

// ─── Initialization ──────────────────────────────────────────
let listenersBound = false;

function bindEventListenersOnce() {
  if (listenersBound) return;
  listenersBound = true;

  // Intercept clicks for outbound transitions (checks has-intro dynamically at click time)
  document.addEventListener('click', handleClick, { passive: false });

  // Handle bfcache restoration (back / forward cache)
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      dismissOverlay();
    }
  });

  // Handle Escape key to cancel pending navigation or dismiss overlay
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const hybridPilot = typeof window !== 'undefined' ? window.__MONDO_HYBRID_PILOT__ : null;
      if (hybridPilot && typeof hybridPilot.isBusy === 'function' && hybridPilot.isBusy()) {
        if (typeof hybridPilot.handleEscape === 'function') {
          hybridPilot.handleEscape();
        }
        return;
      }
      if (isNavigating) {
        cancelPendingNavigation('escape');
      } else {
        dismissOverlay();
      }
    }
  });

  // Clear stall timer and adaptive waiting timers if page begins unloading
  window.addEventListener('pagehide', () => {
    if (stallTimerId) {
      clearTimeout(stallTimerId);
      stallTimerId = null;
    }
    cleanupAdaptiveControllers('pagehide');
  });
}

export function initQuietMark() {
  // Ensure outbound click, bfcache, and keyboard listeners are always bound
  bindEventListenersOnce();

  const isPilotRoute = typeof location !== 'undefined' &&
    normalizePath(location.pathname).startsWith('/work/') &&
    normalizePath(location.pathname) !== '/work' &&
    !normalizePath(location.pathname).endsWith('.html');

  const isReducedMotion = Boolean(
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  // Respect reduced motion on normal navigation (unless adaptive pilot waiting was explicitly primed)
  if (isReducedMotion && !(isPilotRoute && document.documentElement.classList.contains('is-quiet-mark-inbound'))) {
    cleanupAdaptiveControllers('reduced_motion');
    clearStaleState();
    return;
  }

  // If Main Intro is active on this page, clear any stale state and do NOT play inbound transition
  const isIntroActive = document.documentElement.classList.contains('has-intro');

  if (isIntroActive) {
    cleanupAdaptiveControllers('intro_active');
    clearStaleState();
  } else {
    // Check for legitimate inbound transition targeted for this page
    const pending = readPendingTransition();
    let isPendingValid = false;

    if (pending) {
      const currentPath = normalizePath(location.pathname);
      const isTargetMatch = pending.to === currentPath;
      const isFresh = (Date.now() - (pending.ts || 0)) <= MAX_TRANSITION_AGE;
      // Inbound guard check: ensure the inbound visibility guard is actively holding
      // before mounting overlay. If watchdog already fired and dismissed the guard,
      // content is already visible to the user — suppress late overlay to avoid secondary flash.
      const isGuardActive = document.documentElement.classList.contains('is-quiet-mark-inbound');

      if (isTargetMatch && isFresh && isGuardActive) {
        isPendingValid = true;
      }
      if (isPendingValid && isPilotRoute) {
        // Consume session token without stripping early is-qm-breathing / is-qm-status classes
        try { sessionStorage.removeItem(SESSION_KEY); } catch (_) { /* ignore */ }
      } else {
        // Always consume/clear the pending state so it cannot apply a second time
        clearStaleState();
      }
    } else {
      clearStaleState();
    }

    if (isPendingValid) {
      // The synchronous head script has already primed document.documentElement.style.background = '#000'
      const overlay = ensureOverlay();
      overlay.style.opacity = '1';
      overlay.style.display = '';

      // Remove the inbound visibility guard — overlay is now mounted and covering content
      document.documentElement.classList.remove('is-quiet-mark-inbound');

      const logo = document.getElementById(LOGO_ID);
      if (logo) {
        // Logo should be visible at unified static hold midpoint state (scale(1.0042))
        logo.style.opacity = '1';
        const midScale = isPilotRoute ? AQM_HOLD_SCALE : (0.978 + 0.042 * ease(0.54, 0.12, 0.84));
        logo.style.transform = isPilotRoute ? `scale(${AQM_HOLD_SCALE})` : `scale(${midScale.toFixed(4)})`;
      }

      if (isPilotRoute && typeof window !== 'undefined') {
        const earlyQm = window.__MONDO_EARLY_QM__ || null;
        if (earlyQm && typeof earlyQm.clearTimers === 'function') {
          earlyQm.clearTimers();
        }

        const aqmController = createAdaptiveQuietMarkController({
          overlay,
          breathEl: document.getElementById(BREATH_ID),
          statusEl: document.getElementById(STATUS_ID),
          reducedMotion: isReducedMotion,
          initialState: earlyQm && earlyQm.state ? earlyQm.state : AQM_STATES.QUIET,
          startTime: earlyQm && typeof earlyQm.startTime === 'number' ? earlyQm.startTime : null,
          breathingAt: earlyQm ? earlyQm.breathingAt : null,
          statusAt: earlyQm ? earlyQm.statusAt : null
        });
        window.__MONDO_ADAPTIVE_QM__ = aqmController;

        const schedulePilotInbound = (reason = 'ready') => {
          aqmController.reveal(reason);
          if (isReducedMotion) {
            playInbound().then(() => {
              aqmController.dismiss('inbound_complete');
              focusPilotFallbackErrorIfPresent();
            });
            return;
          }
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              playInbound().then(() => {
                aqmController.dismiss('inbound_complete');
                focusPilotFallbackErrorIfPresent();
              });
            });
          });
        };

        if (window.__MONDO_PROJECT_READY__) {
          schedulePilotInbound('ready_immediate');
        } else {
          // Phase 5C.3.3-AQ1 Pilot: hold existing Quiet Mark veil with progressive waiting states
          // until project readiness is satisfied or 3,500ms safety ceiling fires
          let triggered = false;
          let safetyTimerId = null;

          const triggerInbound = (reason = 'project_ready_event') => {
            if (triggered) return;
            triggered = true;
            if (safetyTimerId !== null) {
              clearTimeout(safetyTimerId);
              safetyTimerId = null;
            }
            window.removeEventListener('mondo:project-ready', onProjectReady);
            if (reason === 'safety_timeout_3500ms' && !window.__MONDO_PROJECT_READY__) {
              renderPilotFallbackErrorIfNeeded();
            }
            schedulePilotInbound(reason);
          };

          const onProjectReady = () => triggerInbound('project_ready_event');
          window.addEventListener('mondo:project-ready', onProjectReady, { once: true });

          // Bounded safety fallback: never hold veil past 3,500ms from navigation landing
          const nowTs = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
          const elapsedMs = earlyQm && typeof earlyQm.startTime === 'number' ? Math.max(0, nowTs - earlyQm.startTime) : 0;
          const remainingSafetyMs = Math.max(0, 3500 - elapsedMs);
          safetyTimerId = setTimeout(() => {
            safetyTimerId = null;
            triggerInbound('safety_timeout_3500ms');
          }, remainingSafetyMs);
        }
      } else {
        const scheduleInbound = () => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              playInbound();
            });
          });
        };
        scheduleInbound();
      }
    } else {
      // Not a valid pending transition for this route (e.g. direct load, refresh, or route mismatch).
      // Ensure background primed by head script is cleared cleanly.
      cleanupAdaptiveControllers('invalid_pending');
      document.documentElement.style.background = '';
      document.documentElement.classList.remove('is-quiet-mark-inbound');
    }
  }

  // Ensure event listeners are bound
  bindEventListenersOnce();
}
