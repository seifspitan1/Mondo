/**
 * MONDO — Dormant Navigation Coordinator Core Engine (Stage G3.3-B)
 * Central lifecycle orchestrator and transaction engine for Option C
 * Hybrid Progressive Enhancement Navigation.
 *
 * AUTHORITATIVE ARCHITECTURE & AMENDMENT COMPLIANCE:
 * - Authoritative Blueprint: G3.3-B-P0-R2 Safety Reconciliation.
 * - Amendment B-01: Never drain queued traversal while RECOVERING is active.
 *   Queued traversals only drain after full recovery settlement to IDLE.
 * - Amendment B-02: No phantom History Manager APIs.
 *   Observation occurs strictly via injected locationAdapter and historyStateAdapter.
 * - Amendment B-03: Native fallback failure must be explicitly unrecoverable.
 *   Single-attempt latch, emergency veil dismissal, explicit unrecoverable failure outcome.
 * - Amendment C-01: Fail-closed outbound protective veil.
 *   Forwards operation signal to showVeil; enforces verified veil opacity
 *   before entering COMMITTING; routes pre-commit veil failures through handlePreCommitFailure.
 * - G3-D06 Option A: Protected Commit Sequence:
 *   Pre-Commit -> [Point of No Return] -> Outgoing Unmount -> DOM Swap ->
 *   URL Commit (link-only) -> Title/Scroll Sync -> Destination Mount ->
 *   Readiness Assessment -> Reveal -> Settle to IDLE.
 * - G3-D03 Option C: Route-directed scroll policy (RESET_TOP vs RESTORE_SAVED).
 * - G3-D04 Option C: Work readiness assessment distinction (CRITICAL_MEDIA_READY vs TIMED_OUT).
 * - G3-D05 Option B: Fact-based progress recovery model (4-state certainty).
 * - G3-D07: Interim configurable deadlines with safe provisional defaults.
 *
 * STRICT DORMANCY GOVERNANCE:
 * - Pure instance factory: createNavigationCoordinator(options).
 * - ZERO import-time DOM manipulation, timers, or browser event listeners.
 * - ZERO global singletons or window mutations on import.
 * - Inactive until explicitly instantiated and invoked.
 */

import {
  createNavigationStateManager,
  NAVIGATION_STATES,
  NON_CANCELLABLE_STATES,
  TERMINAL_STATES,
  isPostBoundaryState,
  isCancellableState
} from './navigation-state.js';

import {
  createHistoryManager,
  SCROLL_POLICY,
  TRAVERSAL_DISPOSITION
} from './history-manager.js';

import {
  normalizePath,
  parsePilotRoute,
  isPilotRoute,
  isEligiblePilotPair
} from './route-eligibility.js';

import {
  matchPilotRoute,
  PILOT_ROUTE_DEFINITIONS
} from './route-registry.js';

import { fetchRouteHtml } from './html-loader.js';

/**
 * Observable Effects 4-State Certainty Model (R2-01).
 * Tracks each irreversible step post-boundary.
 */
export const EFFECT_CERTAINTY = Object.freeze({
  NOT_ATTEMPTED: 'not_attempted',
  STARTED: 'started',
  CONFIRMED: 'confirmed',
  UNCERTAIN_AFTER_ERROR: 'uncertain_after_error'
});

/**
 * High-level lifecycle progress indicators for external observers.
 */
export const TRANSACTION_PROGRESS = Object.freeze({
  IDLE: 'IDLE',
  PREPARING: 'PREPARING',
  OUTBOUND: 'OUTBOUND',
  FETCHING: 'FETCHING',
  PARSED: 'PARSED',
  COMMITTING: 'COMMITTING',
  AWAITING_READINESS: 'AWAITING_READINESS',
  REVEALING: 'REVEALING',
  SETTLING: 'SETTLING',
  RECOVERING: 'RECOVERING'
});

/**
 * Teardown lifecycle states for safe deferred coordinator destruction (R2-02).
 */
export const TEARDOWN_LIFECYCLE = Object.freeze({
  ACTIVE: 'active',
  PENDING_DEFERRED: 'pending_deferred',
  FINALIZED: 'finalized'
});

/**
 * Unambiguous transaction outcomes and dispositions.
 */
export const NAVIGATION_DISPOSITION = Object.freeze({
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  INELIGIBLE_NATIVE_FALLBACK: 'ineligible_native_fallback',
  REJECTED: 'rejected',
  RECOVERED: 'recovered',
  UNRECOVERABLE_FAILURE: 'unrecoverable_failure'
});

/**
 * Interim provisional timing defaults (G3-D07).
 * Caller-configurable; final calibration deferred to browser UAT.
 */
export const DEFAULT_TIMING_CONFIG = Object.freeze({
  fetchTimeoutMs: 8000,
  readinessTimeoutMs: 5000,
  revealTimeoutMs: 2000,
  safetyTimeoutMs: 10000
});

/**
 * Creates an independent, dormant Navigation Coordinator instance.
 *
 * @param {object} [options={}] Dependency injection options
 * @returns {object} Coordinator instance
 */
export function createNavigationCoordinator(options = {}) {
  // Dependency Injections with pure, non-evaluating defaults
  const stateManager = options.stateManager || createNavigationStateManager();

  const locationAdapter = options.locationAdapter || {
    getHref: () => (typeof window !== 'undefined' && window.location ? window.location.href : ''),
    getPathname: () => (typeof window !== 'undefined' && window.location ? window.location.pathname : ''),
    getOrigin: () => (typeof window !== 'undefined' && window.location ? window.location.origin : '')
  };

  let fallbackState = null;
  const historyStateAdapter = options.historyStateAdapter || {
    getState: () => (typeof history !== 'undefined' && history ? history.state : fallbackState),
    setState: (st) => { fallbackState = st; }
  };

  let defaultHistory = null;
  if (options.history) {
    defaultHistory = options.history;
  } else if (typeof window !== 'undefined' && window.history) {
    defaultHistory = window.history;
  } else {
    defaultHistory = {
      get state() { return historyStateAdapter.getState(); },
      pushState: (st, _title, url) => {
        if (typeof historyStateAdapter.setState === 'function') {
          historyStateAdapter.setState(st);
        } else {
          fallbackState = st;
        }
        if (typeof locationAdapter.setHref === 'function' && url) {
          locationAdapter.setHref(url);
        }
      },
      replaceState: (st, _title, url) => {
        if (typeof historyStateAdapter.setState === 'function') {
          historyStateAdapter.setState(st);
        } else {
          fallbackState = st;
        }
        if (typeof locationAdapter.setHref === 'function' && url) {
          locationAdapter.setHref(url);
        }
      }
    };
  }

  const historyManager = options.historyManager || createHistoryManager({
    history: defaultHistory,
    location: {
      get href() { return locationAdapter.getHref(); }
    }
  });

  const eligibilityAdapter = options.eligibilityAdapter || {
    normalizePath,
    parseRoute: parsePilotRoute,
    isPilotRoute,
    isEligiblePair: isEligiblePilotPair,
    matchRoute: matchPilotRoute
  };

  const loaderAdapter = options.loaderAdapter || {
    loadHtml: (url, opts) => fetchRouteHtml(url, opts)
  };

  const domAdapter = options.domAdapter || {
    getRenderedPath: () => {
      if (typeof document !== 'undefined') {
        const main = document.querySelector('main#main');
        if (main && main.getAttribute('data-route-path')) {
          return main.getAttribute('data-route-path');
        }
      }
      return locationAdapter.getPathname();
    },
    swapMainContent: (html, targetRoute) => {
      if (typeof document !== 'undefined') {
        const main = document.querySelector('main#main');
        if (main) {
          main.innerHTML = html;
          if (targetRoute && targetRoute.id) {
            main.setAttribute('data-route-type', targetRoute.id);
          }
          return true;
        }
      }
      return false;
    },
    updateTitle: (title) => {
      if (typeof document !== 'undefined' && title) {
        document.title = title;
      }
    },
    hasExpectedLandmark: (routeType) => {
      if (typeof document !== 'undefined') {
        if (routeType === 'work') {
          return Boolean(document.querySelector('#work-grid') || document.querySelector('.work-page-grid'));
        }
        if (routeType === 'project') {
          return Boolean(document.querySelector('#project-main'));
        }
      }
      return true;
    },
    renderInSituError: (routeType, errorInfo) => {
      if (typeof document !== 'undefined') {
        if (routeType === 'project') {
          const host = document.querySelector('#project-error-host') || document.querySelector('#main');
          if (host) {
            host.innerHTML = `<div class="project-error-boundary"><h2>Unable to load project</h2><p>${errorInfo?.message || 'An error occurred'}</p></div>`;
            return true;
          }
        } else {
          const host = document.querySelector('#work-grid') || document.querySelector('#main');
          if (host) {
            host.innerHTML = `<div class="work-error-boundary"><h2>Unable to load work portfolio</h2><p>${errorInfo?.message || 'An error occurred'}</p></div>`;
            return true;
          }
        }
      }
      return false;
    }
  };

  const lifecycleAdapter = options.lifecycleAdapter || {
    unmountRoute: async (_sourceRoute) => {},
    mountRoute: async (_targetRoute, _params) => {},
    awaitReadiness: async (_targetRoute, _opts) => {
      return { status: 'ready', outcome: 'CRITICAL_MEDIA_READY' };
    }
  };

  const transitionVeilAdapter = options.transitionVeilAdapter || {
    showVeil: async () => {},
    dismissVeil: async () => {},
    isVeilVisible: () => false
  };

  const recoveryAdapter = options.recoveryAdapter || {
    navigateNative: (url) => {
      if (typeof window !== 'undefined' && window.location) {
        window.location.assign(url);
      }
    },
    replaceNative: (url) => {
      if (typeof window !== 'undefined' && window.location) {
        window.location.replace(url);
      }
    }
  };

  const timingConfig = Object.freeze({
    ...DEFAULT_TIMING_CONFIG,
    ...(options.timingConfig || {})
  });

  const onSettled = typeof options.onSettled === 'function' ? options.onSettled : null;

  // Coordinator Local State
  let teardownStatus = TEARDOWN_LIFECYCLE.ACTIVE;
  let progress = TRANSACTION_PROGRESS.IDLE;
  let renderedRoute = options.initialRoute || null;
  let hasDispatchedNativeFallback = false; // Amendment B-03 single-attempt latch

  function notifySettled() {
    if (onSettled) {
      try {
        onSettled({
          state: stateManager.getState(),
          teardownStatus
        });
      } catch (_) {}
    }
  }

  /**
   * Safely dismisses the transition veil without throwing.
   */
  async function safeDismissVeil() {
    try {
      if (transitionVeilAdapter && typeof transitionVeilAdapter.dismissVeil === 'function') {
        await transitionVeilAdapter.dismissVeil();
      }
    } catch (_) {}
  }

  /**
   * Resolves the current rendered route representation.
   *
   * @returns {{ id: string, type: string, pathname: string, slug?: string|null, definition?: object|null }}
   */
  function getRenderedRoute() {
    if (renderedRoute) return renderedRoute;
    const path = domAdapter.getRenderedPath() || locationAdapter.getPathname();
    const normalized = eligibilityAdapter.normalizePath(path);
    const parsed = eligibilityAdapter.parseRoute(normalized);
    if (parsed) {
      const match = eligibilityAdapter.matchRoute ? eligibilityAdapter.matchRoute(normalized) : null;
      renderedRoute = {
        id: parsed.type,
        type: parsed.type,
        pathname: normalized,
        slug: parsed.slug || null,
        definition: match ? match.definition : null
      };
      return renderedRoute;
    }
    return {
      id: 'unknown',
      type: 'unknown',
      pathname: normalized || '',
      slug: null,
      definition: null
    };
  }

  /**
   * Dispatches native navigation or replacement with strict Amendment B-03 latching.
   *
   * @param {number} opId - Operation ID
   * @param {string} targetUrl - URL to navigate to
   * @param {'navigate'|'replace'} method - Native navigation method
   * @param {Error|any} causeError - Original error causing fallback
   * @returns {Promise<object>} Outcome descriptor
   */
  async function dispatchNativeFallback(opId, targetUrl, method = 'replace', causeError = null) {
    // Amendment B-03: Single-attempt fallback latch
    if (hasDispatchedNativeFallback) {
      await safeDismissVeil();
      return {
        disposition: NAVIGATION_DISPOSITION.UNRECOVERABLE_FAILURE,
        opId,
        fallbackRequested: true,
        fallbackDispatched: false,
        fallbackFailed: true,
        error: new Error('Native fallback already attempted; recursive fallback blocked'),
        cause: causeError
      };
    }

    hasDispatchedNativeFallback = true;
    let fallbackFailed = false;
    let fallbackError = null;

    try {
      if (method === 'replace' && typeof recoveryAdapter.replaceNative === 'function') {
        const res = recoveryAdapter.replaceNative(targetUrl);
        if (res && typeof res.then === 'function') await res;
      } else if (typeof recoveryAdapter.navigateNative === 'function') {
        const res = recoveryAdapter.navigateNative(targetUrl);
        if (res && typeof res.then === 'function') await res;
      } else {
        throw new Error('No recovery adapter available for native navigation');
      }
    } catch (err) {
      fallbackFailed = true;
      fallbackError = err;
    }

    if (fallbackFailed) {
      // Amendment B-03: Emergency veil dismissal, settle state to IDLE, explicit unrecoverable outcome
      await safeDismissVeil();
      try {
        stateManager.transition(opId, NAVIGATION_STATES.COMPLETE);
        stateManager.transition(opId, NAVIGATION_STATES.IDLE);
      } catch (_) {
        stateManager.reset('unrecoverable_fallback_failure');
      }
      progress = TRANSACTION_PROGRESS.IDLE;

      if (teardownStatus === TEARDOWN_LIFECYCLE.PENDING_DEFERRED) {
        finalizeTeardown();
      }

      return {
        disposition: NAVIGATION_DISPOSITION.UNRECOVERABLE_FAILURE,
        opId,
        fallbackRequested: true,
        fallbackDispatched: true,
        fallbackFailed: true,
        error: fallbackError,
        cause: causeError
      };
    }

    // Settled recovery
    try {
      stateManager.transition(opId, NAVIGATION_STATES.COMPLETE);
      stateManager.transition(opId, NAVIGATION_STATES.IDLE);
    } catch (_) {
      stateManager.reset('recovery_settled');
    }
    progress = TRANSACTION_PROGRESS.IDLE;

    await checkTeardownAndDraining();

    return {
      disposition: NAVIGATION_DISPOSITION.RECOVERED,
      opId,
      mode: 'native_fallback',
      fallbackRequested: true,
      fallbackDispatched: true,
      fallbackFailed: false,
      targetUrl
    };
  }

  /**
   * Handles pre-commit failure (cancellable phase, DOM/History completely untouched).
   */
  async function handlePreCommitFailure(opId, targetRouteDesc, errorMessage, txnOptions = {}) {
    const currentState = stateManager.getState();
    try {
      if (currentState === NAVIGATION_STATES.OUTBOUND) {
        stateManager.transition(opId, NAVIGATION_STATES.CANCELLED);
      } else {
        stateManager.transition(opId, NAVIGATION_STATES.RECOVERING);
      }
    } catch (_) {}
    progress = TRANSACTION_PROGRESS.RECOVERING;

    // Mandatory Correction E-G1-04: If popstate fails pre-commit while browser URL
    // has already moved away from rendered DOM, reconcile via native fallback.
    if (txnOptions && txnOptions.isPopstate) {
      const renderedPath = getRenderedRoute().pathname;
      const targetPath = targetRouteDesc && targetRouteDesc.pathname ? targetRouteDesc.pathname : '';
      if (targetPath && targetPath !== renderedPath) {
        return await dispatchNativeFallback(
          opId,
          targetPath || locationAdapter.getHref(),
          'replace',
          new Error(errorMessage || 'pre_commit_failed')
        );
      }
    }

    await safeDismissVeil();

    try {
      stateManager.transition(opId, NAVIGATION_STATES.IDLE);
    } catch (_) {
      stateManager.reset('pre_commit_failure_reset');
    }
    progress = TRANSACTION_PROGRESS.IDLE;

    await checkTeardownAndDraining();

    return {
      disposition: NAVIGATION_DISPOSITION.REJECTED,
      opId,
      targetUrl: targetRouteDesc.pathname,
      reason: errorMessage || 'pre_commit_failed'
    };
  }

  /**
   * Handles post-boundary failure (irreversible phase: fact-based recovery R2-01).
   */
  async function handlePostBoundaryFailure(opId, targetRouteDesc, effects, error, txnOptions) {
    try {
      stateManager.transition(opId, NAVIGATION_STATES.RECOVERING);
    } catch (_) {}
    progress = TRANSACTION_PROGRESS.RECOVERING;

    // Observe real environment facts safely
    let observedHref = '';
    let domLandmarkValid = false;
    let observationThrew = false;

    try {
      observedHref = locationAdapter.getHref() || '';
    } catch (_) {
      observationThrew = true;
    }

    try {
      domLandmarkValid = domAdapter.hasExpectedLandmark(targetRouteDesc.type);
    } catch (_) {
      observationThrew = true;
    }

    // In-situ recovery evaluation:
    // Can only recover in-situ if DOM swap completed, landmark is valid, and observation succeeded
    const canRecoverInSitu = !observationThrew &&
      effects.domSwap === EFFECT_CERTAINTY.CONFIRMED &&
      domLandmarkValid;

    if (canRecoverInSitu) {
      let inSituSuccess = false;
      try {
        inSituSuccess = domAdapter.renderInSituError(targetRouteDesc.type, error);
      } catch (_) {
        inSituSuccess = false;
      }

      if (inSituSuccess) {
        await safeDismissVeil();
        try {
          stateManager.transition(opId, NAVIGATION_STATES.COMPLETE);
          stateManager.transition(opId, NAVIGATION_STATES.IDLE);
        } catch (_) {
          stateManager.reset('in_situ_settled');
        }
        progress = TRANSACTION_PROGRESS.IDLE;

        await checkTeardownAndDraining();

        return {
          disposition: NAVIGATION_DISPOSITION.RECOVERED,
          opId,
          mode: 'in_situ_error',
          targetUrl: targetRouteDesc.pathname,
          error
        };
      }
    }

    // Escalate to native fallback
    const targetUrl = targetRouteDesc.pathname || observedHref;
    return await dispatchNativeFallback(opId, targetUrl, 'replace', error);
  }

  /**
   * Drains the pending traversal queue per Amendment B-01.
   * STRICT CONTRACT: Never drain while active operation is RECOVERING.
   * Drains strictly after coordinator settles to IDLE.
   */
  async function checkTeardownAndDraining() {
    if (teardownStatus === TEARDOWN_LIFECYCLE.PENDING_DEFERRED) {
      finalizeTeardown();
      return;
    }

    // Amendment B-01: MUST NOT drain if state is not IDLE
    const currentState = stateManager.getState();
    if (currentState !== NAVIGATION_STATES.IDLE) {
      return;
    }

    if (historyManager.hasPendingTraversal()) {
      const pending = historyManager.getPendingTraversal();
      if (!pending) {
        notifySettled();
        return;
      }

      // Superseded check
      if (!historyManager.isCurrentGeneration(pending.generation)) {
        historyManager.clearPendingTraversal();
        notifySettled();
        return;
      }

      historyManager.clearPendingTraversal();

      const currentBrowserHref = locationAdapter.getHref();
      const currentBrowserState = historyStateAdapter.getState();
      const targetUrl = pending.targetUrl || currentBrowserHref;

      await handlePopstate({
        targetUrl,
        state: pending.state !== undefined ? pending.state : currentBrowserState
      });
      return;
    }

    notifySettled();
  }

  /**
   * Finalizes coordinator teardown.
   */
  function finalizeTeardown() {
    teardownStatus = TEARDOWN_LIFECYCLE.FINALIZED;
    stateManager.reset('coordinator_destroyed');
    historyManager.destroy();
    safeDismissVeil();
    notifySettled();
  }

  /**
   * Executes the full navigation transaction sequence.
   * Adopts G3-D06 Option A late-commit sequence.
   *
   * @param {object} op - Active StateManager operation
   * @param {object} targetRouteDesc - Validated target route descriptor
   * @param {object} [txnOptions={}] - Transaction options (e.g. isPopstate, popstateState)
   * @returns {Promise<object>} Outcome descriptor
   */
  async function executeTransaction(op, targetRouteDesc, txnOptions = {}) {
    const opId = op.id;
    const signal = op.signal;
    const currentRoute = getRenderedRoute();

    // Check cancellation before start
    if (signal && signal.aborted) {
      return {
        disposition: NAVIGATION_DISPOSITION.CANCELLED,
        opId,
        reason: 'aborted_before_start'
      };
    }

    // Phase 1: OUTBOUND
    const outboundTrans = stateManager.transition(opId, NAVIGATION_STATES.OUTBOUND);
    if (!outboundTrans.ok) {
      return { disposition: NAVIGATION_DISPOSITION.REJECTED, opId, reason: outboundTrans.error };
    }
    progress = TRANSACTION_PROGRESS.OUTBOUND;

    try {
      await transitionVeilAdapter.showVeil({
        sourceRoute: currentRoute,
        targetRoute: targetRouteDesc,
        operationId: opId,
        signal
      });

      // Amendment C-01: Fail-closed protective veil check.
      // Must not proceed to data fetch or commit unless protective veil is confirmed visible.
      if (typeof transitionVeilAdapter.isVeilVisible === 'function' && !transitionVeilAdapter.isVeilVisible()) {
        throw new Error('veil_not_visible');
      }
    } catch (veilErr) {
      if (!stateManager.isCurrent(opId) || (signal && signal.aborted)) {
        if (stateManager.isCurrent(opId)) {
          await safeDismissVeil();
          try { stateManager.transition(opId, NAVIGATION_STATES.IDLE); } catch (_) {}
          progress = TRANSACTION_PROGRESS.IDLE;
          await checkTeardownAndDraining();
        }
        return { disposition: NAVIGATION_DISPOSITION.CANCELLED, opId, reason: 'aborted_during_outbound' };
      }

      return await handlePreCommitFailure(
        opId,
        targetRouteDesc,
        veilErr && veilErr.message ? veilErr.message : 'veil_show_failed',
        txnOptions
      );
    }

    if (!stateManager.isCurrent(opId) || (signal && signal.aborted)) {
      if (stateManager.isCurrent(opId)) {
        await safeDismissVeil();
        try { stateManager.transition(opId, NAVIGATION_STATES.IDLE); } catch (_) {}
        progress = TRANSACTION_PROGRESS.IDLE;
        await checkTeardownAndDraining();
      }
      return { disposition: NAVIGATION_DISPOSITION.CANCELLED, opId, reason: 'aborted_during_outbound' };
    }

    // Phase 2: FETCHING
    const fetchingTrans = stateManager.transition(opId, NAVIGATION_STATES.FETCHING);
    if (!fetchingTrans.ok) {
      if (stateManager.isCurrent(opId)) {
        await safeDismissVeil();
      }
      return { disposition: NAVIGATION_DISPOSITION.REJECTED, opId, reason: fetchingTrans.error };
    }
    progress = TRANSACTION_PROGRESS.FETCHING;

    let loadResult;
    try {
      loadResult = await loaderAdapter.loadHtml(targetRouteDesc.pathname, {
        signal,
        sourcePath: currentRoute.pathname
      });
    } catch (fetchErr) {
      loadResult = { ok: false, error: fetchErr.message || 'Fetch failed' };
    }

    if (!stateManager.isCurrent(opId) || (signal && signal.aborted)) {
      if (stateManager.isCurrent(opId)) {
        await safeDismissVeil();
        try { stateManager.transition(opId, NAVIGATION_STATES.IDLE); } catch (_) {}
        progress = TRANSACTION_PROGRESS.IDLE;
        await checkTeardownAndDraining();
      }
      return { disposition: NAVIGATION_DISPOSITION.CANCELLED, opId, reason: 'aborted_during_fetch' };
    }

    if (!loadResult || !loadResult.ok) {
      return await handlePreCommitFailure(
        opId,
        targetRouteDesc,
        loadResult ? loadResult.error : 'Fetch failed',
        txnOptions
      );
    }

    // Phase 3: PARSED
    const parsedTrans = stateManager.transition(opId, NAVIGATION_STATES.PARSED);
    if (!parsedTrans.ok) {
      if (stateManager.isCurrent(opId)) {
        await safeDismissVeil();
      }
      return { disposition: NAVIGATION_DISPOSITION.REJECTED, opId, reason: parsedTrans.error };
    }
    progress = TRANSACTION_PROGRESS.PARSED;

    // Phase 4: COMMITTING — IRREVERSIBLE POINT OF NO RETURN
    const committingTrans = stateManager.transition(opId, NAVIGATION_STATES.COMMITTING);
    if (!committingTrans.ok) {
      if (stateManager.isCurrent(opId)) {
        await safeDismissVeil();
      }
      return { disposition: NAVIGATION_DISPOSITION.REJECTED, opId, reason: committingTrans.error };
    }
    progress = TRANSACTION_PROGRESS.COMMITTING;

    // Observable Effects Tracker (R2-01)
    const effects = {
      unmount: EFFECT_CERTAINTY.NOT_ATTEMPTED,
      domSwap: EFFECT_CERTAINTY.NOT_ATTEMPTED,
      historyCommit: EFFECT_CERTAINTY.NOT_ATTEMPTED,
      mount: EFFECT_CERTAINTY.NOT_ATTEMPTED,
      readiness: EFFECT_CERTAINTY.NOT_ATTEMPTED,
      reveal: EFFECT_CERTAINTY.NOT_ATTEMPTED
    };

    // Step 4A: Outgoing Unmount
    try {
      effects.unmount = EFFECT_CERTAINTY.STARTED;
      await lifecycleAdapter.unmountRoute(currentRoute);
      effects.unmount = EFFECT_CERTAINTY.CONFIRMED;
    } catch (unmountErr) {
      effects.unmount = EFFECT_CERTAINTY.UNCERTAIN_AFTER_ERROR;
      return await handlePostBoundaryFailure(opId, targetRouteDesc, effects, unmountErr, txnOptions);
    }

    // Step 4B: DOM Swap
    try {
      effects.domSwap = EFFECT_CERTAINTY.STARTED;
      const swapOk = await domAdapter.swapMainContent(loadResult.data.mainHtml, targetRouteDesc);
      if (swapOk === false) {
        throw new Error('domAdapter.swapMainContent returned false');
      }
      effects.domSwap = EFFECT_CERTAINTY.CONFIRMED;
      renderedRoute = targetRouteDesc;
    } catch (domErr) {
      effects.domSwap = EFFECT_CERTAINTY.UNCERTAIN_AFTER_ERROR;
      return await handlePostBoundaryFailure(opId, targetRouteDesc, effects, domErr, txnOptions);
    }

    // Step 4C: History URL Commit (Link-only; bypassed on popstate)
    if (!txnOptions.isPopstate) {
      try {
        effects.historyCommit = EFFECT_CERTAINTY.STARTED;
        const pushOk = historyManager.pushRoute(
          targetRouteDesc.pathname,
          { routeId: targetRouteDesc.id, slug: targetRouteDesc.slug },
          { title: loadResult.data.title }
        );
        if (pushOk === false) {
          throw new Error('historyManager.pushRoute returned false');
        }
        effects.historyCommit = EFFECT_CERTAINTY.CONFIRMED;
      } catch (histErr) {
        effects.historyCommit = EFFECT_CERTAINTY.UNCERTAIN_AFTER_ERROR;
        return await handlePostBoundaryFailure(opId, targetRouteDesc, effects, histErr, txnOptions);
      }
    } else {
      // Popstate already has browser URL set
      effects.historyCommit = EFFECT_CERTAINTY.CONFIRMED;
    }

    // Step 4D: Title/Metadata & Route-directed Scroll Policy (G3-D03 Option C)
    try {
      if (typeof domAdapter.updateMetadata === 'function') {
        domAdapter.updateMetadata({
          title: loadResult.data.title,
          metaDescription: loadResult.data.metaDescription
        });
      } else {
        domAdapter.updateTitle(loadResult.data.title);
      }
    } catch (_) {}

    const applyTransactionScroll = () => {
      if (txnOptions.isPopstate) {
        const traversedState = txnOptions.popstateState;
        if (historyManager.isManagedEntry(traversedState)) {
          historyManager.applyScrollPolicy(SCROLL_POLICY.RESTORE_SAVED, {
            x: traversedState.scrollX,
            y: traversedState.scrollY
          });
        } else {
          historyManager.applyScrollPolicy(SCROLL_POLICY.PRESERVE_NATIVE);
        }
      } else {
        historyManager.applyScrollPolicy(SCROLL_POLICY.RESET_TOP);
      }
    };

    applyTransactionScroll();

    // Step 4E: Destination Lifecycle Mount
    try {
      effects.mount = EFFECT_CERTAINTY.STARTED;
      await lifecycleAdapter.mountRoute(targetRouteDesc, {
        slug: targetRouteDesc.slug,
        operationId: opId,
        signal
      });
      effects.mount = EFFECT_CERTAINTY.CONFIRMED;
    } catch (mountErr) {
      effects.mount = EFFECT_CERTAINTY.UNCERTAIN_AFTER_ERROR;
      return await handlePostBoundaryFailure(opId, targetRouteDesc, effects, mountErr, txnOptions);
    }

    // Mandatory Correction E-G1-04: Post-mount scroll reapplication after dynamic content hydration
    try {
      applyTransactionScroll();
    } catch (_) {}

    // Phase 5: AWAITING_READINESS
    const readinessTrans = stateManager.transition(opId, NAVIGATION_STATES.AWAITING_READINESS);
    if (!readinessTrans.ok) {
      return await handlePostBoundaryFailure(opId, targetRouteDesc, effects, new Error(readinessTrans.error), txnOptions);
    }
    progress = TRANSACTION_PROGRESS.AWAITING_READINESS;

    let readinessResult;
    try {
      effects.readiness = EFFECT_CERTAINTY.STARTED;
      readinessResult = await lifecycleAdapter.awaitReadiness(targetRouteDesc, {
        signal,
        timeoutMs: timingConfig.readinessTimeoutMs
      });

      // Strict readiness evaluation (G3-D04 Option C): TIMED_OUT or RECOVERABLE_ERROR triggers recovery
      if (!readinessResult || readinessResult.outcome === 'TIMED_OUT' || readinessResult.outcome === 'RECOVERABLE_ERROR') {
        effects.readiness = EFFECT_CERTAINTY.UNCERTAIN_AFTER_ERROR;
        const readinessError = new Error(`Readiness assessment failed with outcome: ${readinessResult ? readinessResult.outcome : 'UNKNOWN'}`);
        return await handlePostBoundaryFailure(opId, targetRouteDesc, effects, readinessError, txnOptions);
      }
      effects.readiness = EFFECT_CERTAINTY.CONFIRMED;
    } catch (readyErr) {
      effects.readiness = EFFECT_CERTAINTY.UNCERTAIN_AFTER_ERROR;
      return await handlePostBoundaryFailure(opId, targetRouteDesc, effects, readyErr, txnOptions);
    }

    // Phase 6: REVEALING
    const revealTrans = stateManager.transition(opId, NAVIGATION_STATES.REVEALING);
    if (!revealTrans.ok) {
      return await handlePostBoundaryFailure(opId, targetRouteDesc, effects, new Error(revealTrans.error), txnOptions);
    }
    progress = TRANSACTION_PROGRESS.REVEALING;

    try {
      effects.reveal = EFFECT_CERTAINTY.STARTED;
      await transitionVeilAdapter.dismissVeil();
      effects.reveal = EFFECT_CERTAINTY.CONFIRMED;
    } catch (revealErr) {
      effects.reveal = EFFECT_CERTAINTY.UNCERTAIN_AFTER_ERROR;
      return await handlePostBoundaryFailure(opId, targetRouteDesc, effects, revealErr, txnOptions);
    }

    // Phase 7: COMPLETE & SETTLE TO IDLE
    stateManager.transition(opId, NAVIGATION_STATES.COMPLETE);
    progress = TRANSACTION_PROGRESS.SETTLING;

    stateManager.transition(opId, NAVIGATION_STATES.IDLE);
    progress = TRANSACTION_PROGRESS.IDLE;

    await checkTeardownAndDraining();

    return {
      disposition: NAVIGATION_DISPOSITION.COMPLETED,
      opId,
      targetUrl: targetRouteDesc.pathname,
      readinessOutcome: readinessResult ? readinessResult.outcome : 'CRITICAL_MEDIA_READY'
    };
  }

  /**
   * Initiates a hybrid link navigation to an eligible target URL.
   *
   * @param {string} targetUrl - Destination URL candidate
   * @param {object} [navOptions={}] - Navigation options
   * @returns {Promise<object>} Transaction outcome descriptor
   */
  async function navigate(targetUrl, navOptions = {}) {
    if (teardownStatus === TEARDOWN_LIFECYCLE.FINALIZED || teardownStatus === TEARDOWN_LIFECYCLE.PENDING_DEFERRED) {
      return {
        disposition: NAVIGATION_DISPOSITION.REJECTED,
        reason: 'coordinator_destroyed'
      };
    }

    // Check if active operation is already post-boundary
    const currentOpState = stateManager.getState();
    if (currentOpState !== NAVIGATION_STATES.IDLE && !TERMINAL_STATES.includes(currentOpState)) {
      if (isPostBoundaryState(currentOpState)) {
        return {
          disposition: NAVIGATION_DISPOSITION.REJECTED,
          reason: 'busy_post_boundary',
          activeState: currentOpState
        };
      }
      // Pre-boundary operations will be superseded by startOperation below
    }

    const currentRoute = getRenderedRoute();
    const sourcePath = currentRoute.pathname;
    const normalizedTarget = eligibilityAdapter.normalizePath(targetUrl);

    // Validate route pair eligibility
    if (!normalizedTarget || !eligibilityAdapter.isEligiblePair(sourcePath, normalizedTarget)) {
      if (recoveryAdapter && typeof recoveryAdapter.navigateNative === 'function' && navOptions.executeNativeFallback !== false) {
        try {
          recoveryAdapter.navigateNative(targetUrl);
        } catch (_) {}
      }
      return {
        disposition: NAVIGATION_DISPOSITION.INELIGIBLE_NATIVE_FALLBACK,
        targetUrl,
        sourcePath,
        reason: 'route_pair_ineligible'
      };
    }

    const parsedTarget = eligibilityAdapter.parseRoute(normalizedTarget);
    const targetMatch = eligibilityAdapter.matchRoute ? eligibilityAdapter.matchRoute(normalizedTarget) : null;
    const targetRouteDesc = {
      id: parsedTarget.type,
      type: parsedTarget.type,
      pathname: normalizedTarget,
      slug: parsedTarget.slug || null,
      definition: targetMatch ? targetMatch.definition : null
    };

    const op = stateManager.startOperation({
      from: sourcePath,
      to: normalizedTarget,
      type: 'link',
      targetRoute: targetRouteDesc
    });

    if (!op) {
      return {
        disposition: NAVIGATION_DISPOSITION.REJECTED,
        reason: 'supersession_blocked'
      };
    }

    return await executeTransaction(op, targetRouteDesc, { isPopstate: false, ...navOptions });
  }

  /**
   * Handles a browser popstate traversal event.
   *
   * @param {PopStateEvent|object} [event={}] - Traversal event descriptor
   * @returns {Promise<object>} Outcome or queue status descriptor
   */
  async function handlePopstate(event = {}) {
    if (teardownStatus === TEARDOWN_LIFECYCLE.FINALIZED || teardownStatus === TEARDOWN_LIFECYCLE.PENDING_DEFERRED) {
      return {
        disposition: NAVIGATION_DISPOSITION.REJECTED,
        reason: 'coordinator_destroyed'
      };
    }

    const currentState = stateManager.getState();
    const currentBrowserHref = locationAdapter.getHref();
    const targetUrl = event.targetUrl || currentBrowserHref;
    const traversedState = (event && event.state !== undefined) ? event.state : historyStateAdapter.getState();

    // If an irreversible operation is active, queue the traversal
    if (isPostBoundaryState(currentState)) {
      const queueResult = historyManager.queuePendingTraversal({
        targetUrl,
        state: traversedState
      }, currentState);

      return {
        disposition: 'queued',
        generation: queueResult.generation,
        activeState: currentState
      };
    }

    // If a cancellable pre-boundary operation is active, cancel it immediately
    let cancelledPreBoundary = false;
    if (currentState !== NAVIGATION_STATES.IDLE && !TERMINAL_STATES.includes(currentState)) {
      const activeOp = stateManager.getActiveOperation();
      if (activeOp) {
        stateManager.cancelOperation(activeOp.id, 'superseded_by_popstate');
        cancelledPreBoundary = true;
      }
      await safeDismissVeil();
      progress = TRANSACTION_PROGRESS.IDLE;
    }

    const normalizedTarget = eligibilityAdapter.normalizePath(targetUrl);
    const currentRoute = getRenderedRoute();
    const sourcePath = currentRoute.pathname;

    // Mandatory Correction E-G1-04: Reconcile against actual destination vs rendered DOM.
    // If browser URL and rendered DOM are on the same route (e.g., Back during uncommitted fetch
    // returned to source route, or same-route hash traversal), restore saved scroll if managed
    // without triggering an unnecessary page reload.
    if (normalizedTarget && normalizedTarget === sourcePath) {
      if (historyManager.isManagedEntry(traversedState)) {
        historyManager.applyScrollPolicy(SCROLL_POLICY.RESTORE_SAVED, {
          x: traversedState.scrollX,
          y: traversedState.scrollY
        });
      }
      await checkTeardownAndDraining();
      return {
        disposition: NAVIGATION_DISPOSITION.INELIGIBLE_NATIVE_FALLBACK,
        mode: 'reconciled_same_route',
        targetUrl,
        sourcePath,
        reason: cancelledPreBoundary ? 'reconciled_to_rendered_route' : 'route_pair_ineligible',
        fallbackDispatched: false
      };
    }

    if (!normalizedTarget || !eligibilityAdapter.isEligiblePair(sourcePath, normalizedTarget)) {
      let fallbackDispatched = false;
      if (event.executeNativeFallback !== false && !hasDispatchedNativeFallback && recoveryAdapter) {
        try {
          if (typeof recoveryAdapter.replaceNative === 'function') {
            recoveryAdapter.replaceNative(targetUrl);
            fallbackDispatched = true;
          } else if (typeof recoveryAdapter.navigateNative === 'function') {
            recoveryAdapter.navigateNative(targetUrl);
            fallbackDispatched = true;
          }
        } catch (_) {}
      }
      await checkTeardownAndDraining();
      return {
        disposition: NAVIGATION_DISPOSITION.INELIGIBLE_NATIVE_FALLBACK,
        mode: 'native_fallback',
        targetUrl,
        sourcePath,
        reason: 'route_pair_ineligible',
        fallbackDispatched
      };
    }

    const parsedTarget = eligibilityAdapter.parseRoute(normalizedTarget);
    const targetMatch = eligibilityAdapter.matchRoute ? eligibilityAdapter.matchRoute(normalizedTarget) : null;
    const targetRouteDesc = {
      id: parsedTarget.type,
      type: parsedTarget.type,
      pathname: normalizedTarget,
      slug: parsedTarget.slug || null,
      definition: targetMatch ? targetMatch.definition : null
    };

    const op = stateManager.startOperation({
      from: sourcePath,
      to: normalizedTarget,
      type: 'popstate',
      targetRoute: targetRouteDesc
    });

    if (!op) {
      return {
        disposition: NAVIGATION_DISPOSITION.REJECTED,
        reason: 'supersession_blocked'
      };
    }

    return await executeTransaction(op, targetRouteDesc, {
      isPopstate: true,
      popstateState: traversedState
    });
  }

  /**
   * Explicitly cancels the active operation if it has not crossed the Point of No Return.
   *
   * @param {string} [reason='user_cancelled'] - Cancellation explanation
   * @returns {boolean} True if cancelled, false if non-cancellable or idle
   */
  function cancel(reason = 'user_cancelled') {
    const activeOp = stateManager.getActiveOperation();
    if (!activeOp) return false;

    const cancelled = stateManager.cancelOperation(activeOp.id, reason);
    if (cancelled) {
      safeDismissVeil();
      progress = TRANSACTION_PROGRESS.IDLE;
    }
    return cancelled;
  }

  /**
   * Safely tears down the coordinator following the R2 deferred teardown lifecycle.
   *
   * @returns {boolean} True if destroyed or teardown successfully deferred
   */
  function destroy() {
    if (teardownStatus === TEARDOWN_LIFECYCLE.FINALIZED) {
      return true;
    }

    const currentState = stateManager.getState();
    if (currentState === NAVIGATION_STATES.IDLE || TERMINAL_STATES.includes(currentState)) {
      finalizeTeardown();
      return true;
    }

    if (isPostBoundaryState(currentState)) {
      // Post-boundary: defer finalization until settled
      teardownStatus = TEARDOWN_LIFECYCLE.PENDING_DEFERRED;
      return true;
    }

    // Pre-boundary: cancel immediately
    const activeOp = stateManager.getActiveOperation();
    if (activeOp) {
      stateManager.cancelOperation(activeOp.id, 'coordinator_destroyed');
    }
    finalizeTeardown();
    return true;
  }

  return {
    navigate,
    handlePopstate,
    cancel,
    destroy,
    getState: () => stateManager.getState(),
    getProgress: () => progress,
    getActiveOperation: () => stateManager.getActiveOperation(),
    isBusy: () => {
      const s = stateManager.getState();
      return s !== NAVIGATION_STATES.IDLE && !TERMINAL_STATES.includes(s);
    },
    hasPendingTraversal: () => historyManager.hasPendingTraversal(),
    getTeardownStatus: () => teardownStatus,
    getRenderedRoute,
    getTimingConfig: () => timingConfig,
    hasDispatchedNativeFallback: () => hasDispatchedNativeFallback
  };
}
