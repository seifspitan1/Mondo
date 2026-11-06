/**
 * MONDO — Quiet Mark Transition Veil Adapter (Stage G3.3-C)
 * Encapsulates MONDO's protective visual transition veil, ensuring strict
 * fail-closed occlusion, adaptive breathing/status states, reduced-motion compliance,
 * watchdog resilience, and accessible focus containment for Option C Hybrid Navigation.
 *
 * STRICT GOVERNANCE & AMENDMENT COMPLIANCE:
 * - Amendment C-01: Fail-closed protective veil.
 *   isVeilVisible() is strictly a read-only observation.
 *   Never claims effective occlusion unless computed/effective opacity >= 0.99,
 *   element is attached to document.body, display is not none, and aria-hidden is false.
 * - Adopts existing singleton overlay (#mondo-quiet-mark); zero duplicate overlays created.
 * - Outbound duration: 227ms; Inbound duration: 193ms.
 * - Adaptive states: Breathing at 250ms, status at 2500ms ('LOADING PROJECT DETAILS…') for /work/:slug.
 * - Reduced motion: 0ms instant transition, transform animations disabled, announcements preserved.
 * - Focus containment: Marks main#main inert/aria-hidden while veil is active; restores upon reveal.
 * - Zero side effects on import; pure instance factory createQuietMarkAdapter().
 */

export const OVERLAY_ID = 'mondo-quiet-mark';
export const INNER_CLASS = 'mondo-quiet-mark__inner';
export const BREATH_ID = 'mondo-quiet-mark-breath';
export const BREATH_CLASS = 'mondo-quiet-mark__breath';
export const LOGO_ID = 'mondo-quiet-mark-logo';
export const LOGO_CLASS = 'mondo-quiet-mark__logo';
export const STATUS_ID = 'mondo-quiet-mark-status';
export const STATUS_CLASS = 'mondo-quiet-mark__status';

export const OUTBOUND_DURATION_MS = 227;
export const INBOUND_DURATION_MS = 193;
export const AQM_BREATHING_THRESHOLD_MS = 250;
export const AQM_STATUS_THRESHOLD_MS = 2500;
export const AQM_STATUS_TEXT = 'LOADING PROJECT DETAILS…';

/**
 * Ensures the singleton Quiet Mark overlay DOM elements exist in the document.
 * Adopts existing structure if present, or constructs it cleanly with zero duplicate elements.
 *
 * @param {Document} doc - Active Document context
 * @returns {HTMLElement} The overlay container element
 */
export function ensureOverlay(doc = (typeof document !== 'undefined' ? document : null)) {
  if (!doc || typeof doc.getElementById !== 'function') return null;

  let overlay = doc.getElementById(OVERLAY_ID);
  if (overlay) {
    // Adopt and format inner hierarchy if elements are missing
    let inner = overlay.querySelector(`.${INNER_CLASS}`) || overlay.querySelector('.mondo-quiet-mark-inner');
    let breath = doc.getElementById(BREATH_ID);
    let logo = doc.getElementById(LOGO_ID);
    let status = doc.getElementById(STATUS_ID);

    if (!inner) {
      inner = doc.createElement('div');
      inner.className = INNER_CLASS;
      overlay.appendChild(inner);
    }

    if (!breath) {
      breath = doc.createElement('div');
      breath.id = BREATH_ID;
      breath.className = BREATH_CLASS;
      inner.appendChild(breath);
    }

    if (!logo) {
      logo = doc.createElement('img');
      logo.id = LOGO_ID;
      logo.className = LOGO_CLASS;
      logo.src = '/assets/intro/mondo-white.png';
      logo.alt = '';
      logo.width = 610;
      logo.height = 870;
      logo.draggable = false;
      breath.appendChild(logo);
    } else if (logo.parentNode !== breath) {
      breath.appendChild(logo);
    }

    if (!status) {
      status = doc.createElement('p');
      status.id = STATUS_ID;
      status.className = STATUS_CLASS;
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      inner.appendChild(status);
    }

    if (overlay.classList && typeof overlay.classList.add === 'function') {
      overlay.classList.add('is-logo-ready');
    }
    if (logo) {
      if (logo.classList && typeof logo.classList.add === 'function') {
        logo.classList.add('is-decoded');
      }
      if (logo.style) {
        logo.style.visibility = '';
      }
    }

    return overlay;
  }

  // Construct singleton overlay
  overlay = doc.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.className = 'mondo-quiet-mark is-logo-ready';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.setAttribute('data-qm-state', 'dismissed');
  overlay.style.opacity = '0';
  overlay.style.display = 'none';

  const inner = doc.createElement('div');
  inner.className = INNER_CLASS;

  const breath = doc.createElement('div');
  breath.id = BREATH_ID;
  breath.className = BREATH_CLASS;

  const logo = doc.createElement('img');
  logo.id = LOGO_ID;
  logo.className = `${LOGO_CLASS} is-decoded`;
  logo.src = '/assets/intro/mondo-white.png';
  logo.alt = '';
  logo.width = 610;
  logo.height = 870;
  logo.draggable = false;

  const status = doc.createElement('p');
  status.id = STATUS_ID;
  status.className = STATUS_CLASS;
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');

  breath.appendChild(logo);
  inner.appendChild(breath);
  inner.appendChild(status);
  overlay.appendChild(inner);

  if (doc.body && typeof doc.body.appendChild === 'function') {
    doc.body.appendChild(overlay);
  }

  return overlay;
}

/**
 * Creates an instance of the Quiet Mark Transition Veil Adapter.
 *
 * @param {object} [options={}] Configuration options
 * @param {Document} [options.document] Active document context
 * @param {Window} [options.window] Active window context
 * @param {number} [options.outboundDurationMs=227] Outbound fade duration in ms
 * @param {number} [options.inboundDurationMs=193] Inbound fade duration in ms
 * @param {number} [options.watchdogPaddingMs=300] Safety padding before watchdog force-flush
 * @param {boolean|null} [options.reducedMotion=null] Explicit reduced-motion override
 * @returns {object} Veil adapter instance satisfying transitionVeilAdapter interface
 */
export function createQuietMarkAdapter(options = {}) {
  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  const win = options.window || (typeof window !== 'undefined' ? window : null);

  const outboundDurationMs = typeof options.outboundDurationMs === 'number' ? options.outboundDurationMs : OUTBOUND_DURATION_MS;
  const inboundDurationMs = typeof options.inboundDurationMs === 'number' ? options.inboundDurationMs : INBOUND_DURATION_MS;
  const watchdogPaddingMs = typeof options.watchdogPaddingMs === 'number' ? options.watchdogPaddingMs : 300;

  let activeVeilOpId = 0;
  let isOccluded = false;
  let previousFocusedElement = null;

  // Active timers and handles for deterministic cancellation
  let activeTimers = new Set();
  let activeRafHandle = null;
  let activePromiseCleanup = null;

  function flushActivePromiseCleanup() {
    if (typeof activePromiseCleanup === 'function') {
      const fn = activePromiseCleanup;
      activePromiseCleanup = null;
      try { fn(); } catch (_) {}
    }
  }

  function trackTimer(timerId) {
    activeTimers.add(timerId);
    return timerId;
  }

  function clearTrackedTimer(timerId) {
    if (timerId !== null) {
      clearTimeout(timerId);
      activeTimers.delete(timerId);
    }
  }

  function clearAllTimers() {
    for (const t of activeTimers) {
      clearTimeout(t);
    }
    activeTimers.clear();
    if (activeRafHandle !== null && win && typeof win.cancelAnimationFrame === 'function') {
      win.cancelAnimationFrame(activeRafHandle);
      activeRafHandle = null;
    }
  }

  /**
   * Evaluates whether reduced motion is requested.
   */
  function isReducedMotionActive() {
    if (options.reducedMotion !== null && options.reducedMotion !== undefined) {
      return Boolean(options.reducedMotion);
    }
    if (win && typeof win.matchMedia === 'function') {
      try {
        return Boolean(win.matchMedia('(prefers-reduced-motion: reduce)').matches);
      } catch (_) {
        return false;
      }
    }
    return false;
  }

  /**
   * Strictly verifies whether genuine visual protective occlusion is established.
   * Read-only: never mutates DOM, never instantiates overlays.
   *
   * @returns {boolean} True if and only if overlay is attached, displayed, visible, and fully opaque
   */
  function verifyEffectiveOcclusion() {
    if (!doc || !doc.body || typeof doc.getElementById !== 'function') return false;

    const overlay = doc.getElementById(OVERLAY_ID);
    if (!overlay) return false;

    // 1. Structural attachment check
    if (typeof doc.body.contains === 'function' && !doc.body.contains(overlay)) return false;

    // 2. Inline display check
    if (overlay.style.display === 'none') return false;

    // 3. Accessibility visibility check
    if (overlay.getAttribute('aria-hidden') === 'true') return false;

    // 4. Computed / effective opacity check
    if (win && typeof win.getComputedStyle === 'function') {
      try {
        const cs = win.getComputedStyle(overlay);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        const computedOpacity = parseFloat(cs.opacity);
        if (isNaN(computedOpacity) || computedOpacity < 0.99) return false;
      } catch (_) {
        // Fallback to inline opacity if getComputedStyle throws
        const inlineOpacity = parseFloat(overlay.style.opacity);
        if (isNaN(inlineOpacity) || inlineOpacity < 0.99) return false;
      }
    } else {
      const inlineOpacity = parseFloat(overlay.style.opacity);
      if (isNaN(inlineOpacity) || inlineOpacity < 0.99) return false;
    }

    return true;
  }

  /**
   * Applies accessible focus containment and inert background landmark marking.
   */
  function containFocus(overlay) {
    if (!doc) return;
    try {
      previousFocusedElement = doc.activeElement;
    } catch (_) {}

    const mainEl = doc.querySelector ? doc.querySelector('main#main') : (doc.getElementById ? doc.getElementById('main') : null);
    if (mainEl) {
      mainEl.setAttribute('aria-hidden', 'true');
      if ('inert' in mainEl) {
        mainEl.inert = true;
      }
    }

    if (overlay && typeof overlay.focus === 'function') {
      if (!overlay.hasAttribute('tabindex')) {
        overlay.setAttribute('tabindex', '-1');
      }
      try {
        overlay.focus({ preventScroll: true });
      } catch (_) {
        try { overlay.focus(); } catch (_) {}
      }
    }
  }

  /**
   * Restores focus to the destination primary landmark or previously focused element.
   */
  function restoreFocus() {
    if (!doc) return;

    const mainEl = doc.querySelector ? doc.querySelector('main#main') : (doc.getElementById ? doc.getElementById('main') : null);
    if (mainEl) {
      mainEl.removeAttribute('aria-hidden');
      if ('inert' in mainEl) {
        mainEl.inert = false;
      }
    }

    // Attempt to focus destination heading or main landmark
    const targetHeading = doc.querySelector ? (doc.querySelector('main#main h1') || doc.querySelector('main#main')) : null;
    if (targetHeading && typeof targetHeading.focus === 'function') {
      if (!targetHeading.hasAttribute('tabindex')) {
        targetHeading.setAttribute('tabindex', '-1');
      }
      try {
        targetHeading.focus({ preventScroll: true });
        return;
      } catch (_) {}
    }

    if (previousFocusedElement && typeof previousFocusedElement.focus === 'function') {
      try {
        previousFocusedElement.focus({ preventScroll: true });
      } catch (_) {}
    }
  }

  /**
   * Starts adaptive waiting states (breathing and status text) if target is /work/:slug.
   */
  function startAdaptiveController(targetRoute, opId) {
    if (!targetRoute) return;
    const isProjectRoute = targetRoute.type === 'project' ||
      (targetRoute.id === 'project') ||
      (typeof targetRoute.pathname === 'string' && targetRoute.pathname.startsWith('/work/') && targetRoute.pathname !== '/work');

    if (!isProjectRoute) return;

    const overlay = doc ? doc.getElementById(OVERLAY_ID) : null;
    const breath = doc ? doc.getElementById(BREATH_ID) : null;
    const status = doc ? doc.getElementById(STATUS_ID) : null;

    // Trigger breathing at 250ms (disabled under reduced motion)
    if (!isReducedMotionActive()) {
      trackTimer(setTimeout(() => {
        if (opId !== activeVeilOpId || !isOccluded) return;
        if (overlay) {
          overlay.classList.add('is-qm-breathing');
          overlay.setAttribute('data-qm-state', 'breathing');
        }
        if (breath) {
          breath.style.transform = 'scale(1.0042)';
          breath.style.transition = 'transform 1200ms ease-in-out';
        }
      }, AQM_BREATHING_THRESHOLD_MS));
    }

    // Trigger status text at 2500ms (preserved under reduced motion)
    trackTimer(setTimeout(() => {
      if (opId !== activeVeilOpId || !isOccluded) return;
      if (overlay) {
        overlay.classList.add('is-qm-status');
        overlay.setAttribute('data-qm-state', 'status');
      }
      if (status) {
        status.textContent = AQM_STATUS_TEXT;
        status.classList.add('is-visible');
        status.style.opacity = '1';
      }
    }, AQM_STATUS_THRESHOLD_MS));
  }

  /**
   * Stops and clears any active adaptive breathing and status controllers.
   */
  function stopAdaptiveController() {
    if (!doc) return;
    const overlay = doc.getElementById(OVERLAY_ID);
    const breath = doc.getElementById(BREATH_ID);
    const status = doc.getElementById(STATUS_ID);

    if (overlay) {
      overlay.classList.remove('is-qm-breathing', 'is-qm-status');
    }
    if (breath) {
      breath.style.transform = '';
      breath.style.transition = '';
    }
    if (status) {
      status.textContent = '';
      status.classList.remove('is-visible');
      status.style.opacity = '';
    }
  }

  /**
   * Shows the protective transition veil.
   * Resolves ONLY when genuine effective visual occlusion is established (opacity >= 0.99).
   *
   * @param {object} context
   * @param {object} [context.sourceRoute] Source route descriptor
   * @param {object} [context.targetRoute] Destination route descriptor
   * @param {number|string} [context.operationId] Operation identifier
   * @param {AbortSignal} [context.signal] Cancellation signal
   * @returns {Promise<void>}
   */
  async function showVeil({ sourceRoute, targetRoute, operationId, signal } = {}) {
    const currentOpId = ++activeVeilOpId;
    flushActivePromiseCleanup();
    clearAllTimers();

    if (signal && signal.aborted) {
      reset();
      const abortErr = new Error('aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    const overlay = ensureOverlay(doc);
    if (!overlay || !doc.body || (typeof doc.body.contains === 'function' && !doc.body.contains(overlay))) {
      reset();
      throw new Error('VEIL_OPACITY_UNVERIFIED');
    }

    const logo = doc ? doc.getElementById(LOGO_ID) : null;

    // Reset styles for outbound entry
    stopAdaptiveController();
    overlay.setAttribute('aria-hidden', 'false');
    overlay.setAttribute('data-qm-state', 'quiet');
    if (overlay.classList && typeof overlay.classList.add === 'function') {
      overlay.classList.add('is-logo-ready');
    }
    overlay.style.display = '';
    overlay.style.pointerEvents = 'all';

    if (logo) {
      if (logo.classList && typeof logo.classList.add === 'function') {
        logo.classList.add('is-decoded');
      }
      if (logo.style) {
        logo.style.visibility = '';
      }
    }

    containFocus(overlay);

    const isReduced = isReducedMotionActive();

    if (isReduced) {
      overlay.style.transition = 'none';
      overlay.style.opacity = '1';
      if (logo && logo.style) {
        logo.style.transition = 'none';
        logo.style.opacity = '1';
        logo.style.transform = 'none';
      }
      if (overlay.offsetHeight) {} // Force layout sync

      if (verifyEffectiveOcclusion()) {
        isOccluded = true;
        startAdaptiveController(targetRoute, currentOpId);
        return;
      }
      reset();
      throw new Error('VEIL_OPACITY_UNVERIFIED');
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      let watchdogTimer = null;

      const finish = (ok, error) => {
        if (settled) return;
        settled = true;
        if (activePromiseCleanup === cleanupFn) {
          activePromiseCleanup = null;
        }
        clearTrackedTimer(watchdogTimer);
        if (signal && typeof signal.removeEventListener === 'function') {
          signal.removeEventListener('abort', onAbort);
        }

        if (currentOpId !== activeVeilOpId) {
          const abortErr = error || new Error('superseded');
          abortErr.name = 'AbortError';
          reject(abortErr);
          return;
        }

        if (ok && verifyEffectiveOcclusion()) {
          isOccluded = true;
          startAdaptiveController(targetRoute, currentOpId);
          resolve();
        } else {
          isOccluded = false;
          reset();
          reject(error || new Error('VEIL_OPACITY_UNVERIFIED'));
        }
      };

      const cleanupFn = () => finish(false, new Error('superseded'));
      activePromiseCleanup = cleanupFn;

      const onAbort = () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        finish(false, err);
      };

      if (signal) {
        if (signal.aborted) return onAbort();
        signal.addEventListener('abort', onAbort, { once: true });
      }

      // Fail-closed Watchdog Timer: arms at outboundDurationMs + watchdogPaddingMs
      watchdogTimer = trackTimer(setTimeout(() => {
        if (settled) return;
        if (currentOpId !== activeVeilOpId) {
          finish(false, new Error('superseded'));
          return;
        }

        // Force synchronous completion upon watchdog trip
        overlay.style.transition = 'none';
        overlay.style.opacity = '1';
        if (logo && logo.style) {
          logo.style.transition = 'none';
          logo.style.opacity = '1';
          logo.style.transform = 'scale(1.0042)';
        }
        if (overlay.offsetHeight) {} // Force layout reflow

        if (verifyEffectiveOcclusion()) {
          finish(true);
        } else {
          finish(false, new Error('VEIL_OPACITY_UNVERIFIED'));
        }
      }, outboundDurationMs + watchdogPaddingMs));

      // Standard animation using rAF or setTimeout fallback
      const nowFn = () => (win && win.performance && typeof win.performance.now === 'function' ? win.performance.now() : Date.now());
      const startTime = nowFn();

      const tick = () => {
        if (settled) return;
        if (currentOpId !== activeVeilOpId) {
          finish(false, new Error('superseded'));
          return;
        }
        const elapsed = nowFn() - startTime;
        const progress = Math.min(1, Math.max(0, elapsed / outboundDurationMs));

        overlay.style.opacity = String(progress);
        if (logo && logo.style) {
          logo.style.opacity = String(progress);
          const scale = 0.978 + (1.0042 - 0.978) * progress;
          logo.style.transform = `scale(${scale.toFixed(4)})`;
        }

        if (progress < 1) {
          if (win && typeof win.requestAnimationFrame === 'function') {
            activeRafHandle = win.requestAnimationFrame(tick);
          } else {
            activeRafHandle = setTimeout(tick, 16);
          }
        } else {
          overlay.style.opacity = '1';
          if (logo && logo.style) {
            logo.style.opacity = '1';
            logo.style.transform = 'scale(1.0042)';
          }
          if (overlay.offsetHeight) {} // Force layout reflow
          finish(true);
        }
      };

      if (win && typeof win.requestAnimationFrame === 'function') {
        activeRafHandle = win.requestAnimationFrame(tick);
      } else {
        activeRafHandle = setTimeout(tick, 16);
      }
    });
  }

  /**
   * Dismisses the protective transition veil.
   * Fades out over inboundDurationMs and hides the overlay completely.
   *
   * @param {object} context
   * @param {object} [context.sourceRoute]
   * @param {object} [context.targetRoute]
   * @param {number|string} [context.operationId]
   * @param {AbortSignal} [context.signal]
   * @returns {Promise<void>}
   */
  async function dismissVeil({ sourceRoute, targetRoute, operationId, signal } = {}) {
    const currentOpId = ++activeVeilOpId;
    flushActivePromiseCleanup();
    clearAllTimers();
    stopAdaptiveController();

    const overlay = doc ? doc.getElementById(OVERLAY_ID) : null;
    if (!overlay) {
      isOccluded = false;
      restoreFocus();
      return;
    }

    const logo = doc ? doc.getElementById(LOGO_ID) : null;
    const isReduced = isReducedMotionActive();

    if (isReduced) {
      overlay.style.transition = 'none';
      overlay.style.opacity = '0';
      overlay.style.display = 'none';
      overlay.style.pointerEvents = 'none';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.setAttribute('data-qm-state', 'dismissed');
      if (logo && logo.style) {
        logo.style.transition = 'none';
        logo.style.opacity = '0';
        logo.style.transform = '';
      }
      isOccluded = false;
      restoreFocus();
      return;
    }

    return new Promise((resolve) => {
      let settled = false;
      let watchdogTimer = null;

      const finish = () => {
        if (settled) return;
        settled = true;
        if (activePromiseCleanup === cleanupFn) {
          activePromiseCleanup = null;
        }
        clearTrackedTimer(watchdogTimer);
        if (signal && typeof signal.removeEventListener === 'function') {
          signal.removeEventListener('abort', onAbort);
        }

        if (currentOpId !== activeVeilOpId) {
          resolve();
          return;
        }

        overlay.style.transition = 'none';
        overlay.style.opacity = '0';
        overlay.style.display = 'none';
        overlay.style.pointerEvents = 'none';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.setAttribute('data-qm-state', 'dismissed');
        if (logo && logo.style) {
          logo.style.transition = 'none';
          logo.style.opacity = '0';
          logo.style.transform = '';
        }
        isOccluded = false;
        restoreFocus();
        resolve();
      };

      const cleanupFn = () => finish();
      activePromiseCleanup = cleanupFn;

      const onAbort = () => finish();
      if (signal) {
        if (signal.aborted) return finish();
        signal.addEventListener('abort', onAbort, { once: true });
      }

      watchdogTimer = trackTimer(setTimeout(finish, inboundDurationMs + watchdogPaddingMs));

      const nowFn = () => (win && win.performance && typeof win.performance.now === 'function' ? win.performance.now() : Date.now());
      const startTime = nowFn();

      const tick = () => {
        if (settled) return;
        if (currentOpId !== activeVeilOpId) {
          finish();
          return;
        }
        const elapsed = nowFn() - startTime;
        const progress = Math.min(1, Math.max(0, elapsed / inboundDurationMs));

        overlay.style.opacity = String(1 - progress);
        if (logo && logo.style) {
          logo.style.opacity = String(1 - progress);
          const scale = 1.0042 + (1.02 - 1.0042) * progress;
          logo.style.transform = `scale(${scale.toFixed(4)})`;
        }

        if (progress < 1) {
          if (win && typeof win.requestAnimationFrame === 'function') {
            activeRafHandle = win.requestAnimationFrame(tick);
          } else {
            activeRafHandle = setTimeout(tick, 16);
          }
        } else {
          finish();
        }
      };

      if (win && typeof win.requestAnimationFrame === 'function') {
        activeRafHandle = win.requestAnimationFrame(tick);
      } else {
        activeRafHandle = setTimeout(tick, 16);
      }
    });
  }

  /**
   * Synchronously reports whether protective occlusion is genuinely active.
   * Strictly read-only observation. Never mutates DOM or creates overlays.
   *
   * @returns {boolean} True if veil is verified opaque and active
   */
  function isVeilVisible() {
    return Boolean(isOccluded && verifyEffectiveOcclusion());
  }

  /**
   * Synchronously and idempotently resets the veil to hidden state and clears all timers.
   */
  function reset() {
    activeVeilOpId++;
    flushActivePromiseCleanup();
    clearAllTimers();
    stopAdaptiveController();

    if (doc) {
      const overlay = doc.getElementById(OVERLAY_ID);
      if (overlay) {
        overlay.style.transition = 'none';
        overlay.style.opacity = '0';
        overlay.style.display = 'none';
        overlay.style.pointerEvents = 'none';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.setAttribute('data-qm-state', 'dismissed');
      }
      const logo = doc.getElementById(LOGO_ID);
      if (logo && logo.style) {
        logo.style.transition = 'none';
        logo.style.opacity = '0';
        logo.style.transform = '';
      }
      const mainEl = doc.querySelector ? doc.querySelector('main#main') : (doc.getElementById ? doc.getElementById('main') : null);
      if (mainEl) {
        mainEl.removeAttribute('aria-hidden');
        if ('inert' in mainEl) {
          mainEl.inert = false;
        }
      }
    }

    isOccluded = false;
  }

  return {
    showVeil,
    dismissVeil,
    isVeilVisible,
    reset
  };
}
