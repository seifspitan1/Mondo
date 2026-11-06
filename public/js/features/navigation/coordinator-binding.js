/**
 * MONDO — Coordinator Binding & Feature-Gated Pilot Controller (Stage G3.3-E-G1)
 * Pure factory composing the Navigation Coordinator with the Quiet Mark Veil Adapter,
 * Route Lifecycle Adapter, DOM Adapter, History Manager, and the disabled-by-default
 * Gate 1 Feature-Gated Pilot Controller.
 *
 * STRICT GOVERNANCE & MANDATORY CORRECTIONS (E-G1-01 .. E-G1-05):
 * - E-G1-01 (No Phantom Coordinator APIs):
 *   Uses strictly verified public methods on createNavigationCoordinator() and createHistoryManager().
 * - E-G1-02 (Real Event Ownership):
 *   Uses capture-phase document click interception ({ capture: true, passive: false })
 *   that runs before legacy MPA Quiet Mark bubble handlers for eligible pilot links
 *   while leaving ineligible links untouched and preserving mobile drawer closing.
 * - E-G1-03 (Strictly Disabled Runtime — Option A):
 *   DEFAULT_HYBRID_PILOT_ENABLED = false and GATE_1_ACTIVATION_LOCK = true.
 *   During Gate 1, Hybrid Navigation remains completely inactive on all live public pages.
 *   No URL parameter (?hybrid=1) or sessionStorage override may bypass the Gate 1 lock.
 *   Importing or calling initHybridNavigationPilot() in runtime installs ZERO active
 *   click or popstate handlers.
 * - E-G1-04 (Popstate & Scroll Integrity):
 *   Seeds initial managed History entry preserving unrelated history.state fields,
 *   captures outgoing scroll coordinates, preserves and restores history.scrollRestoration,
 *   and never calls pushState during popstate.
 * - Section 7 (Deterministic Kill-Switch & Deferred Rollback):
 *   Immediately blocks new hybrid operations, cancels pre-boundary work safely,
 *   defers final listener/veil teardown while post-boundary work is active, and
 *   returns deterministically to native MPA behavior.
 */

import {
  createNavigationCoordinator,
  TEARDOWN_LIFECYCLE
} from './navigation-coordinator.js';
import { createQuietMarkAdapter } from '../transitions/quiet-mark-adapter.js';
import { createRouteLifecycleAdapter } from './lifecycle-adapter.js';
import { mountWork, unmountWork } from '../work/work-page.js';
import { createDomAdapter } from './dom-adapter.js';
import { createHistoryManager } from './history-manager.js';
import {
  isPostBoundaryState,
  isCancellableState
} from './navigation-state.js';
import {
  normalizePath,
  parsePilotRoute,
  isPilotRoute,
  isEligiblePilotPair
} from './route-eligibility.js';
import { icons } from '../../shared/icons.js';
import {
  DEFAULT_HYBRID_PILOT_ENABLED,
  GATE_1_ACTIVATION_LOCK,
  ALLOWED_LOCAL_PILOT_HOSTS,
  isAllowedLocalPilotHost,
  isHybridPilotEnabled
} from './pilot-gate.js';

export {
  DEFAULT_HYBRID_PILOT_ENABLED,
  GATE_1_ACTIVATION_LOCK,
  isAllowedLocalPilotHost,
  isHybridPilotEnabled
};

/**
 * Explicit pilot controller lifecycle states.
 */
export const PILOT_LIFECYCLE_STATES = Object.freeze({
  DISABLED: 'disabled',
  ACTIVE: 'active',
  ROLLING_BACK_DEFERRED: 'rolling_back_deferred',
  DESTROYED: 'destroyed'
});

/**
 * Creates an independent, dormant bound Navigation Coordinator instance
 * wired to the Quiet Mark transition veil and Route Lifecycle interfaces.
 *
 * @param {object} [options={}] Configuration and adapter overrides
 * @param {Document} [options.document] Active document context
 * @param {Window} [options.window] Active window context
 * @param {object} [options.quietMarkOptions] Options forwarded to createQuietMarkAdapter
 * @param {object} [options.lifecycleOptions] Options forwarded to createRouteLifecycleAdapter
 * @param {object} [options.coordinatorOptions] Options forwarded to createNavigationCoordinator
 * @returns {object} Bound coordinator bundle with full coordinator methods and adapter references
 */
export function createBoundCoordinator(options = {}) {
  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  const win = options.window || (typeof window !== 'undefined' ? window : null);

  // 1. Instantiate Quiet Mark Veil Adapter
  const quietMarkAdapter = options.transitionVeilAdapter || createQuietMarkAdapter({
    document: doc,
    window: win,
    ...(options.quietMarkOptions || {})
  });

  // 2. Instantiate Route Lifecycle Adapter
  const lifecycleAdapter = options.lifecycleAdapter || createRouteLifecycleAdapter({
    document: doc,
    window: win,
    workLifecycle: {
      mount: (ctx = {}) => mountWork({ root: ctx.root, signal: ctx.signal }),
      unmount: (ctx = {}) => unmountWork({ root: ctx.root })
    },
    ...(options.lifecycleOptions || {})
  });

  // 3. Instantiate DOM Adapter (Stage G3.3-D)
  const initialPath = typeof options.initialRoute === 'string'
    ? options.initialRoute
    : (options.initialRoute?.pathname || undefined);

  const rawDomAdapter = options.domAdapter || options.coordinatorOptions?.domAdapter || createDomAdapter({
    document: doc,
    window: win,
    initialPath,
    ...(options.domAdapterOptions || {})
  });

  // Snapshot outgoing scroll position immediately before swapMainContent mutates main#main
  // so Chromium's layout height clamping during DOM swap cannot overwrite the outgoing history entry's scrollY.
  let preSwapScrollSnapshot = null;
  const readLiveScroll = () => ({
    x: win && typeof win.scrollX === 'number' ? win.scrollX : (win?.pageXOffset || 0),
    y: win && typeof win.scrollY === 'number' ? win.scrollY : (win?.pageYOffset || 0)
  });

  const domAdapter = {
    ...rawDomAdapter,
    swapMainContent: (html, targetRoute) => {
      if (win) {
        preSwapScrollSnapshot = readLiveScroll();
      }
      return rawDomAdapter.swapMainContent(html, targetRoute);
    }
  };

  const normalizedInitialRoute = typeof options.initialRoute === 'string'
    ? {
        id: options.initialRoute === '/work' ? 'work' : (options.initialRoute.startsWith('/work/') ? 'project' : 'unknown'),
        type: options.initialRoute === '/work' ? 'work' : (options.initialRoute.startsWith('/work/') ? 'project' : 'unknown'),
        pathname: options.initialRoute,
        slug: options.initialRoute.startsWith('/work/') ? options.initialRoute.slice(6) : undefined
      }
    : (options.initialRoute || options.coordinatorOptions?.initialRoute);

  const locationAdapter = options.locationAdapter || options.coordinatorOptions?.locationAdapter || (win ? {
    getHref: () => (win.location ? win.location.href : ''),
    setHref: (v) => { if (win.location) win.location.href = v; },
    getPathname: () => (win.location ? win.location.pathname : ''),
    getOrigin: () => (win.location ? win.location.origin : '')
  } : undefined);

  const history = options.history || options.coordinatorOptions?.history || win?.history;

  const historyManager = options.historyManager || options.coordinatorOptions?.historyManager || (history ? createHistoryManager({
    history,
    location: locationAdapter
      ? { get href() { return locationAdapter.getHref(); } }
      : win?.location,
    scrollTo: options.scrollTo || (win && typeof win.scrollTo === 'function' ? (x, y) => {
      preSwapScrollSnapshot = null;
      const docEl = doc && doc.documentElement;
      const prevBehavior = docEl && docEl.style ? docEl.style.scrollBehavior : '';
      if (docEl && docEl.style) {
        docEl.style.scrollBehavior = 'auto';
      }
      try {
        try {
          win.scrollTo({ left: x, top: y, behavior: 'instant' });
        } catch (_) {}
        win.scrollTo(x, y);
      } finally {
        if (docEl && docEl.style) {
          docEl.style.scrollBehavior = prevBehavior;
        }
      }
    } : undefined),
    getScroll: options.getScroll || options.getScrollPosition || (win ? () => {
      if (preSwapScrollSnapshot) {
        const snap = preSwapScrollSnapshot;
        preSwapScrollSnapshot = null;
        return snap;
      }
      return readLiveScroll();
    } : undefined)
  }) : undefined);

  // 4. Assemble and instantiate Navigation Coordinator (Fix 6: preserve locationAdapter pass-through)
  const coordinator = createNavigationCoordinator({
    transitionVeilAdapter: quietMarkAdapter,
    lifecycleAdapter,
    domAdapter,
    history,
    ...(options.coordinatorOptions || {}),
    locationAdapter,
    historyStateAdapter: options.historyStateAdapter || options.coordinatorOptions?.historyStateAdapter,
    historyManager,
    eligibilityAdapter: options.eligibilityAdapter || options.coordinatorOptions?.eligibilityAdapter,
    loaderAdapter: options.loaderAdapter || options.coordinatorOptions?.loaderAdapter,
    recoveryAdapter: options.recoveryAdapter || options.coordinatorOptions?.recoveryAdapter,
    timingConfig: options.timingConfig || options.coordinatorOptions?.timingConfig,
    onSettled: options.onSettled || options.coordinatorOptions?.onSettled,
    initialRoute: normalizedInitialRoute
  });

  return {
    coordinator,
    quietMarkAdapter,
    lifecycleAdapter,
    domAdapter,
    historyManager,
    // Delegate verified public coordinator methods
    navigate: (url, opts) => coordinator.navigate(url, opts),
    handlePopstate: (evt) => coordinator.handlePopstate(evt),
    cancel: (reason) => coordinator.cancel(reason),
    destroy: () => coordinator.destroy(),
    getState: () => coordinator.getState(),
    getProgress: () => coordinator.getProgress(),
    getActiveOperation: () => coordinator.getActiveOperation(),
    isBusy: () => coordinator.isBusy(),
    hasPendingTraversal: () => coordinator.hasPendingTraversal(),
    getTeardownStatus: () => coordinator.getTeardownStatus(),
    getRenderedRoute: () => coordinator.getRenderedRoute(),
    getTimingConfig: () => coordinator.getTimingConfig(),
    hasDispatchedNativeFallback: () => coordinator.hasDispatchedNativeFallback()
  };
}


/**
 * Resolves the nearest anchor element with an href from a click event target.
 * Supports Element.closest as well as nested DOM nodes without closest().
 *
 * @param {EventTarget|null} target
 * @returns {HTMLAnchorElement|null}
 */
function findAnchorFromTarget(target) {
  if (!target || typeof target !== 'object') return null;

  if (typeof target.closest === 'function') {
    return target.closest('a[href]');
  }

  let node = target.nodeType === 3 ? (target.parentElement || target.parentNode) : target;
  while (node && typeof node === 'object') {
    const tag = typeof node.tagName === 'string' ? node.tagName.toUpperCase() : '';
    if (tag === 'A') {
      const hasHref = typeof node.hasAttribute === 'function'
        ? node.hasAttribute('href')
        : (typeof node.getAttribute === 'function' ? node.getAttribute('href') !== null : Boolean(node.href));
      if (hasHref) return node;
    }
    node = node.parentElement || node.parentNode || null;
  }
  return null;
}

/**
 * Ensures the mobile navigation drawer (.main-nav.is-open) is closed cleanly
 * when a hybrid navigation link is activated inside or while the mobile menu is open.
 * Preserves accessibility attributes (aria-expanded="false", menu icon).
 *
 * @param {Document} doc
 */
function ensureMobileDrawerClosed(doc) {
  if (!doc || typeof doc.querySelector !== 'function') return;
  const mainNav = doc.querySelector('.main-nav');
  if (!mainNav || !mainNav.classList || typeof mainNav.classList.contains !== 'function') return;
  if (!mainNav.classList.contains('is-open')) return;

  mainNav.classList.remove('is-open');
  const toggleBtn = doc.querySelector('.menu-toggle') || doc.querySelector('.nav-toggle');
  if (toggleBtn) {
    if (typeof toggleBtn.setAttribute === 'function') {
      toggleBtn.setAttribute('aria-expanded', 'false');
    }
    if (icons && typeof icons.menu === 'function' && 'innerHTML' in toggleBtn) {
      toggleBtn.innerHTML = icons.menu(22);
    }
  }
}

// Singleton active pilot controller tracking
let activePilotController = null;

/**
 * Initializes the feature-gated Hybrid Navigation Pilot.
 *
 * - Idempotent: Repeated calls while active return the existing controller without duplicating listeners.
 * - Disabled by Default: Calling initHybridNavigationPilot() without explicit local opt-in
 *   returns { active: false, status: 'disabled', reason: 'feature_flag_disabled' } and attaches ZERO listeners.
 * - Strict Route Scope: Only arms on eligible pilot routes (/work and /work/:slug).
 *
 * @param {object} [options={}]
 * @returns {object} Pilot controller state and control surface
 */
export function initHybridNavigationPilot(options = {}) {
  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  const win = options.window || (typeof window !== 'undefined' ? window : null);

  // If ?hybrid=0 or ?hybrid=false is present, clear any prior session opt-in immediately
  try {
    if (win && win.location && typeof win.location.search === 'string') {
      const params = new URLSearchParams(win.location.search);
      const flag = params.get('hybrid');
      if ((flag === '0' || flag === 'false') && win.sessionStorage) {
        win.sessionStorage.removeItem('mondo_hybrid_nav_pilot');
      }
    }
  } catch (_) {}

  // If an active controller already exists for the same window/document context, return it idempotently
  if (
    activePilotController &&
    activePilotController.contextWin === win &&
    activePilotController.contextDoc === doc &&
    (activePilotController.getLifecycleState() === PILOT_LIFECYCLE_STATES.ACTIVE ||
      activePilotController.getLifecycleState() === PILOT_LIFECYCLE_STATES.ROLLING_BACK_DEFERRED)
  ) {
    return activePilotController.publicApi;
  }

  // Evaluate Gate 2 controlled local opt-in and feature flag
  if (!isHybridPilotEnabled({ ...options, window: win })) {
    const reason = GATE_1_ACTIVATION_LOCK
      ? 'gate_1_locked'
      : (!isAllowedLocalPilotHost(win) ? 'non_local_host_prohibited' : 'feature_flag_disabled');
    return {
      active: false,
      status: PILOT_LIFECYCLE_STATES.DISABLED,
      reason
    };
  }

  // Persist explicit URL opt-in (?hybrid=1 / ?hybrid=true) in sessionStorage for the local tab session
  try {
    if (win && win.location && typeof win.location.search === 'string' && win.sessionStorage) {
      const params = new URLSearchParams(win.location.search);
      const flag = params.get('hybrid');
      if (flag === '1' || flag === 'true') {
        win.sessionStorage.setItem('mondo_hybrid_nav_pilot', '1');
      }
    }
  } catch (_) {}

  if (!doc || !win || !win.location) {
    return {
      active: false,
      status: PILOT_LIFECYCLE_STATES.DISABLED,
      reason: 'missing_environment'
    };
  }

  const currentPath = normalizePath(win.location.pathname || '/');
  if (!currentPath || !isPilotRoute(currentPath)) {
    return {
      active: false,
      status: PILOT_LIFECYCLE_STATES.DISABLED,
      reason: 'non_pilot_initial_route'
    };
  }

  const parsedInitial = parsePilotRoute(currentPath);
  const mainEl = typeof doc.querySelector === 'function'
    ? (doc.querySelector('main#main') || doc.querySelector('#main'))
    : null;

  if (mainEl && typeof mainEl.setAttribute === 'function') {
    if (!mainEl.getAttribute('data-route-path')) {
      mainEl.setAttribute('data-route-path', currentPath);
    }
    if (!mainEl.getAttribute('data-route-type') && parsedInitial) {
      mainEl.setAttribute('data-route-type', parsedInitial.type);
    }
  }

  // Preserve previous history.scrollRestoration value (Mandatory Correction E-G1-04)
  let hadScrollRestoration = false;
  let previousScrollRestoration = 'auto';
  try {
    if (win.history && 'scrollRestoration' in win.history) {
      hadScrollRestoration = true;
      previousScrollRestoration = win.history.scrollRestoration || 'auto';
      win.history.scrollRestoration = 'manual';
    }
  } catch (_) {}

  let lifecycleState = PILOT_LIFECYCLE_STATES.ACTIVE;
  let clickListenerAttached = false;
  let scrollListenerAttached = false;
  let popstateListenerAttached = false;
  let pageshowListenerAttached = false;

  const bound = createBoundCoordinator({
    document: doc,
    window: win,
    initialRoute: {
      id: parsedInitial.type,
      type: parsedInitial.type,
      pathname: currentPath,
      slug: parsedInitial.slug || null
    },
    ...(options.boundCoordinatorOptions || {}),
    onSettled: (settleInfo) => {
      if (typeof options.onSettled === 'function') {
        try { options.onSettled(settleInfo); } catch (_) {}
      }
      if (
        lifecycleState === PILOT_LIFECYCLE_STATES.ROLLING_BACK_DEFERRED &&
        (!bound.isBusy() || settleInfo?.teardownStatus === TEARDOWN_LIFECYCLE.FINALIZED)
      ) {
        finalizeControllerTeardown();
      }
    }
  });

  // Seed initial managed History entry while preserving unrelated history.state fields (E-G1-04)
  try {
    if (bound.historyManager && win.history) {
      if (!bound.historyManager.isManagedEntry(win.history.state)) {
        const seedUrl = win.location.href || currentPath;
        bound.historyManager.replaceRoute(seedUrl, {
          routeId: parsedInitial.type,
          slug: parsedInitial.slug || null
        });
      }
    }
  } catch (_) {}

  /**
   * Capture-phase click interceptor (Mandatory Correction E-G1-02).
   * Runs before bubble-phase Quiet Mark click handler for eligible pilot links,
   * while leaving ineligible links completely untouched.
   */
  const onDocumentClick = (event) => {
    if (lifecycleState !== PILOT_LIFECYCLE_STATES.ACTIVE) return;
    if (!event || event.defaultPrevented) return;
    if (typeof event.button === 'number' && event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const anchor = findAnchorFromTarget(event.target);
    if (!anchor) return;

    // Target attribute check (_blank, _parent, _top, named frames)
    const targetAttr = (typeof anchor.getAttribute === 'function' ? anchor.getAttribute('target') : anchor.target) || '';
    if (targetAttr && targetAttr.toLowerCase() !== '_self') return;

    // Download attribute check
    const hasDownload = typeof anchor.hasAttribute === 'function'
      ? anchor.hasAttribute('download')
      : Boolean(anchor.download);
    if (hasDownload) return;

    // External or opt-out attribute check
    const relAttr = (typeof anchor.getAttribute === 'function' ? anchor.getAttribute('rel') : anchor.rel) || '';
    if (/\bexternal\b/i.test(relAttr)) return;
    if (typeof anchor.hasAttribute === 'function' && (anchor.hasAttribute('data-no-hybrid') || anchor.hasAttribute('data-native-nav'))) {
      return;
    }

    const rawHref = (typeof anchor.getAttribute === 'function' ? anchor.getAttribute('href') : anchor.href) || '';
    if (!rawHref) return;
    const trimmedHref = rawHref.trim();
    if (!trimmedHref || trimmedHref.startsWith('#')) return;
    if (/^(mailto|tel|javascript|blob|data):/i.test(trimmedHref)) return;

    const currentOrigin = win.location.origin || 'http://localhost:3005';
    let parsedUrl;
    try {
      parsedUrl = new URL(trimmedHref, win.location.href || `${currentOrigin}${currentPath}`);
    } catch (_) {
      return;
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') return;
    if (parsedUrl.origin !== currentOrigin) return;

    // Same-document hash link check (e.g. /work#top while on /work)
    const currentBrowserPath = normalizePath(win.location.pathname || '/');
    const candidateTargetPath = normalizePath(parsedUrl.pathname || '/');
    const currentSearch = win.location.search || '';
    if (
      candidateTargetPath &&
      candidateTargetPath === currentBrowserPath &&
      (parsedUrl.search || '') === currentSearch &&
      parsedUrl.hash
    ) {
      return;
    }

    // Do not intercept while Main Intro is active
    if (
      doc.documentElement &&
      doc.documentElement.classList &&
      typeof doc.documentElement.classList.contains === 'function' &&
      doc.documentElement.classList.contains('has-intro')
    ) {
      return;
    }

    // Strict pilot route-pair check against currently rendered route
    const renderedRoute = bound.getRenderedRoute();
    const sourcePath = renderedRoute ? renderedRoute.pathname : currentBrowserPath;
    if (!candidateTargetPath || !isEligiblePilotPair(sourcePath, candidateTargetPath)) {
      // Leave event.defaultPrevented === false so native MPA / Quiet Mark handles it
      return;
    }

    // Eligible pilot transition! Claim event ownership before bubble-phase Quiet Mark handler.
    event.preventDefault();

    // Preserve mobile drawer closing and accessibility state (Mandatory Correction E-G1-02)
    ensureMobileDrawerClosed(doc);

    // If coordinator is already post-boundary, block duplicate click initiation
    if (bound.isBusy() && isPostBoundaryState(bound.getState())) {
      return;
    }

    // Capture current entry scroll coordinates before leaving source route (Mandatory Correction E-G1-04)
    try {
      if (bound.historyManager) {
        bound.historyManager.updateCurrentEntryScroll();
      }
    } catch (_) {}

    bound.navigate(candidateTargetPath);
  };

  /**
   * Window popstate listener.
   */
  const onWindowPopstate = (event) => {
    if (
      lifecycleState !== PILOT_LIFECYCLE_STATES.ACTIVE &&
      lifecycleState !== PILOT_LIFECYCLE_STATES.ROLLING_BACK_DEFERRED
    ) {
      return;
    }

    const targetUrl = (event && event.targetUrl) || (win.location ? (win.location.pathname || win.location.href) : '');
    const state = event && 'state' in event ? event.state : (win.history ? win.history.state : null);

    bound.handlePopstate({
      targetUrl,
      state
    });
  };

  /**
   * Passive scroll listener keeping the current managed History entry's scroll coordinates up to date.
   */
  const onWindowScroll = () => {
    if (lifecycleState !== PILOT_LIFECYCLE_STATES.ACTIVE) return;
    if (bound.isBusy()) return;
    try {
      if (bound.historyManager) {
        bound.historyManager.updateCurrentEntryScroll();
      }
    } catch (_) {}
  };

  /**
   * BFCache pageshow listener.
   */
  const onWindowPageShow = (event) => {
    if (event && event.persisted) {
      try {
        bound.quietMarkAdapter.reset();
      } catch (_) {}
    }
  };

  function detachImmediateInputListeners() {
    if (clickListenerAttached && typeof doc.removeEventListener === 'function') {
      doc.removeEventListener('click', onDocumentClick, { capture: true });
      clickListenerAttached = false;
    }
    if (scrollListenerAttached && typeof win.removeEventListener === 'function') {
      win.removeEventListener('scroll', onWindowScroll);
      scrollListenerAttached = false;
    }
  }

  function detachAllListeners() {
    detachImmediateInputListeners();
    if (popstateListenerAttached && typeof win.removeEventListener === 'function') {
      win.removeEventListener('popstate', onWindowPopstate);
      popstateListenerAttached = false;
    }
    if (pageshowListenerAttached && typeof win.removeEventListener === 'function') {
      win.removeEventListener('pageshow', onWindowPageShow);
      pageshowListenerAttached = false;
    }
  }

  function restoreScrollRestoration() {
    if (hadScrollRestoration && win && win.history) {
      try {
        win.history.scrollRestoration = previousScrollRestoration;
      } catch (_) {}
    }
  }

  function finalizeControllerTeardown() {
    detachAllListeners();
    restoreScrollRestoration();
    lifecycleState = PILOT_LIFECYCLE_STATES.DISABLED;
    if (activePilotController && activePilotController.publicApi === publicApi) {
      activePilotController = null;
    }
  }

  /**
   * Handles Escape key during an active hybrid transaction (Mandatory Correction E-G1-05).
   * Cancels pre-boundary operations; never dismisses veil during non-cancellable post-boundary states.
   *
   * @returns {boolean} True if Escape was handled by the hybrid pilot
   */
  function handleEscape() {
    if (!bound.isBusy()) return false;
    const currentState = bound.getState();
    if (isCancellableState(currentState)) {
      bound.cancel('escape');
      return true;
    }
    // Non-cancellable post-boundary state: swallow Escape so legacy Quiet Mark never strips the veil
    return true;
  }

  /**
   * Deterministic kill-switch and rollback contract (Section 7).
   * - Immediately prevents new hybrid operations and detaches click/scroll listeners.
   * - Safely cancels pre-boundary work and finalizes immediately.
   * - Defers final teardown when post-boundary work is active, preserving protective veil
   *   and completion handlers until the active transaction settles to IDLE.
   *
   * @param {string} [reason='manual_disable']
   * @returns {object} Deterministic rollback status descriptor
   */
  function disable(reason = 'manual_disable') {
    if (win) {
      win.__MONDO_HYBRID_NAV_DISABLED__ = true;
      try {
        if (win.sessionStorage) {
          win.sessionStorage.removeItem('mondo_hybrid_nav_pilot');
        }
      } catch (_) {}
    }

    // 1. Immediately prevent any new hybrid link interceptions
    detachImmediateInputListeners();

    if (lifecycleState === PILOT_LIFECYCLE_STATES.DISABLED || lifecycleState === PILOT_LIFECYCLE_STATES.DESTROYED) {
      return {
        active: false,
        status: PILOT_LIFECYCLE_STATES.DISABLED,
        teardownStatus: bound.getTeardownStatus(),
        deferred: false,
        reason
      };
    }

    const currentState = bound.getState();

    // 2. Post-boundary operation active: defer final teardown until transaction settles
    if (bound.isBusy() && isPostBoundaryState(currentState)) {
      lifecycleState = PILOT_LIFECYCLE_STATES.ROLLING_BACK_DEFERRED;
      bound.destroy();
      return {
        active: false,
        status: PILOT_LIFECYCLE_STATES.ROLLING_BACK_DEFERRED,
        teardownStatus: bound.getTeardownStatus(),
        deferred: true,
        activeState: currentState,
        reason
      };
    }

    // 3. Pre-boundary or idle: cancel immediately and finalize teardown
    if (bound.isBusy() && isCancellableState(currentState)) {
      bound.cancel(reason || 'pilot_disabled');
    }
    bound.destroy();
    finalizeControllerTeardown();

    return {
      active: false,
      status: PILOT_LIFECYCLE_STATES.DISABLED,
      teardownStatus: bound.getTeardownStatus(),
      deferred: false,
      reason
    };
  }

  // Attach listeners
  if (typeof doc.addEventListener === 'function') {
    doc.addEventListener('click', onDocumentClick, { capture: true, passive: false });
    clickListenerAttached = true;
  }
  if (typeof win.addEventListener === 'function') {
    win.addEventListener('popstate', onWindowPopstate);
    popstateListenerAttached = true;
    win.addEventListener('scroll', onWindowScroll, { passive: true });
    scrollListenerAttached = true;
    win.addEventListener('pageshow', onWindowPageShow);
    pageshowListenerAttached = true;
  }

  const publicApi = {
    get active() {
      return lifecycleState === PILOT_LIFECYCLE_STATES.ACTIVE;
    },
    get status() {
      return lifecycleState;
    },
    bound,
    coordinator: bound.coordinator,
    historyManager: bound.historyManager,
    quietMarkAdapter: bound.quietMarkAdapter,
    lifecycleAdapter: bound.lifecycleAdapter,
    domAdapter: bound.domAdapter,
    isBusy: () => bound.isBusy(),
    getState: () => bound.getState(),
    getTeardownStatus: () => bound.getTeardownStatus(),
    getRenderedRoute: () => bound.getRenderedRoute(),
    getListenerStatus: () => ({
      click: clickListenerAttached,
      popstate: popstateListenerAttached,
      scroll: scrollListenerAttached,
      pageshow: pageshowListenerAttached
    }),
    handleEscape,
    disable,
    destroy: () => disable('destroy')
  };

  activePilotController = {
    contextWin: win,
    contextDoc: doc,
    getLifecycleState: () => lifecycleState,
    publicApi
  };

  if (win) {
    win.__MONDO_HYBRID_PILOT__ = publicApi;
  }

  return publicApi;
}

/**
 * Programmatically disables the active Hybrid Navigation Pilot (if any) and sets the kill-switch.
 *
 * @param {object} [options={}]
 * @param {Window} [options.window]
 * @param {string} [options.reason='manual_disable']
 * @returns {object} Rollback outcome descriptor
 */
export function disableHybridNavigationPilot(options = {}) {
  const win = options.window || (typeof window !== 'undefined' ? window : null);
  const reason = options.reason || 'manual_disable';

  if (win) {
    win.__MONDO_HYBRID_NAV_DISABLED__ = true;
  }

  if (activePilotController && activePilotController.publicApi) {
    return activePilotController.publicApi.disable(reason);
  }

  if (win && win.__MONDO_HYBRID_PILOT__ && typeof win.__MONDO_HYBRID_PILOT__.disable === 'function') {
    return win.__MONDO_HYBRID_PILOT__.disable(reason);
  }

  return {
    active: false,
    status: PILOT_LIFECYCLE_STATES.DISABLED,
    teardownStatus: TEARDOWN_LIFECYCLE.FINALIZED,
    deferred: false,
    reason
  };
}


