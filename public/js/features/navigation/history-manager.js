/**
 * MONDO — Dormant History Manager (Stage G3.3-A)
 * Route-directed History management and scroll restoration engine
 * for Option C Hybrid Navigation.
 *
 * MANDATORY GOVERNANCE & AMENDMENT COMPLIANCE:
 * - Amendment 1: Preserves both scrollX and scrollY in managed history entries.
 *   Preserves unrelated existing history.state fields.
 * - Amendment 2: Respects G3.2 NON_CANCELLABLE_STATES (COMMITTING, AWAITING_READINESS,
 *   REVEALING, COMPLETE, RECOVERING). Distinguishes terminal states from irreversible in-progress operations.
 * - G3-D03 Option C: Route-Directed Hybrid Scroll Restoration:
 *   - Forward navigation resets viewport to top (0, 0).
 *   - Back/Forward restores saved (scrollX, scrollY) for managed entries.
 *   - Non-pilot routes preserve native browser scroll behavior.
 * - STRICT DORMANCY: Zero window event listeners on import, zero automatic History API
 *   calls, zero top-level DOM access. Operates strictly via explicit instance calls.
 */

import { NON_CANCELLABLE_STATES, TERMINAL_STATES } from './navigation-state.js';

/**
 * Supported scroll policies for route-directed navigation.
 */
export const SCROLL_POLICY = Object.freeze({
  RESET_TOP: 'reset_top',
  RESTORE_SAVED: 'restore_saved',
  PRESERVE_NATIVE: 'preserve_native'
});

/**
 * Traversal handling disposition indicating whether a popstate traversal
 * can be handled immediately or must be queued behind an irreversible operation.
 */
export const TRAVERSAL_DISPOSITION = Object.freeze({
  IMMEDIATE: 'immediate',
  QUEUED: 'queued',
  IGNORED_STALE: 'ignored_stale'
});

/**
 * Creates an independent History Manager instance.
 * Supports explicit dependency injection for deterministic testing.
 *
 * @param {object} [options={}]
 * @param {History|object} [options.history] Injected History instance
 * @param {Location|object} [options.location] Injected Location instance
 * @param {Function} [options.scrollTo] Injected scrollTo implementation
 * @param {Function} [options.getScroll] Injected scroll getter returning { x, y }
 * @returns {object} History Manager instance
 */
export function createHistoryManager(options = {}) {
  const {
    history = (typeof window !== 'undefined' ? window.history : null),
    location = (typeof window !== 'undefined' ? window.location : null),
    scrollTo = (typeof window !== 'undefined' && typeof window.scrollTo === 'function'
      ? (x, y) => window.scrollTo(x, y)
      : () => {}),
    getScroll = (typeof window !== 'undefined'
      ? () => ({
          x: typeof window.scrollX === 'number' ? window.scrollX : (window.pageXOffset || 0),
          y: typeof window.scrollY === 'number' ? window.scrollY : (window.pageYOffset || 0)
        })
      : () => ({ x: 0, y: 0 }))
  } = options;

  let currentGeneration = 0;
  let pendingTraversal = null;

  /**
   * Determines whether a history state object was created by MONDO hybrid navigation.
   *
   * @param {any} state - Candidate history.state
   * @returns {boolean} True if managed
   */
  function isManagedEntry(state) {
    return Boolean(state && typeof state === 'object' && state.mondoHybrid === true);
  }

  /**
   * Constructs an immutable managed history state object.
   * Preserves any existing unrelated fields while enforcing the MONDO schema.
   * Explicitly records both scrollX and scrollY per Amendment 1.
   *
   * @param {object} [metadata={}] Route-specific metadata
   * @param {object|null} [existingState=null] Prior state object to preserve
   * @returns {object} Immutable state object
   */
  function createStateObject(metadata = {}, existingState = null) {
    const base = (existingState && typeof existingState === 'object') ? { ...existingState } : {};

    const scrollX = typeof metadata.scrollX === 'number' ? metadata.scrollX : 0;
    const scrollY = typeof metadata.scrollY === 'number' ? metadata.scrollY : 0;
    const timestamp = typeof metadata.timestamp === 'number' ? metadata.timestamp : Date.now();

    return Object.freeze({
      ...base,
      mondoHybrid: true,
      routeId: metadata.routeId || null,
      slug: metadata.slug || null,
      scrollX,
      scrollY,
      timestamp
    });
  }

  /**
   * Captures the current window/document scroll coordinates.
   *
   * @returns {{ x: number, y: number }}
   */
  function captureScroll() {
    try {
      const coords = getScroll();
      return {
        x: typeof coords.x === 'number' && !isNaN(coords.x) ? coords.x : 0,
        y: typeof coords.y === 'number' && !isNaN(coords.y) ? coords.y : 0
      };
    } catch (_) {
      return { x: 0, y: 0 };
    }
  }

  /**
   * Updates the current history entry's scroll coordinates in-place via replaceState.
   * Safe and non-destructive: preserves all existing fields on history.state.
   *
   * @param {{ x?: number, y?: number }|null} [coords=null] Explicit coords or captures current
   * @returns {boolean} True if updated successfully
   */
  function updateCurrentEntryScroll(coords = null) {
    if (!history || typeof history.replaceState !== 'function') return false;

    const finalCoords = coords || captureScroll();
    const currentState = history.state;

    // Even if not yet managed, we preserve existing state and add/update scroll coordinates
    const updatedState = isManagedEntry(currentState)
      ? { ...currentState, scrollX: finalCoords.x, scrollY: finalCoords.y }
      : { ...(currentState || {}), scrollX: finalCoords.x, scrollY: finalCoords.y };

    try {
      const url = location && location.href ? location.href : undefined;
      const title = typeof document !== 'undefined' ? document.title : '';
      history.replaceState(updatedState, title, url);
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Pushes a new managed route entry to browser History.
   * Captures outgoing scroll into current entry before pushing new entry.
   *
   * @param {string} url Destination URL
   * @param {object} [metadata={}] Route metadata (routeId, slug, etc.)
   * @param {object} [options={}] Optional push parameters
   * @returns {boolean} True if pushState succeeded
   */
  function pushRoute(url, metadata = {}, options = {}) {
    if (!history || typeof history.pushState !== 'function' || !url) return false;

    // Capture outgoing scroll before pushing destination
    updateCurrentEntryScroll();

    // Destination initial scroll starts at (0, 0) for forward navigation
    const stateObj = createStateObject({
      ...metadata,
      scrollX: 0,
      scrollY: 0
    }, history.state);

    try {
      history.pushState(stateObj, options.title || '', url);
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Replaces the current history entry with managed route metadata.
   *
   * @param {string} url Destination URL
   * @param {object} [metadata={}] Route metadata
   * @param {object} [options={}] Optional parameters
   * @returns {boolean} True if replaceState succeeded
   */
  function replaceRoute(url, metadata = {}, options = {}) {
    if (!history || typeof history.replaceState !== 'function' || !url) return false;

    const coords = captureScroll();
    const stateObj = createStateObject({
      ...metadata,
      scrollX: typeof metadata.scrollX === 'number' ? metadata.scrollX : coords.x,
      scrollY: typeof metadata.scrollY === 'number' ? metadata.scrollY : coords.y
    }, history.state);

    try {
      history.replaceState(stateObj, options.title || '', url);
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Applies the route-directed scroll policy (Owner Decision G3-D03 Option C).
   *
   * @param {string} policy - SCROLL_POLICY value
   * @param {{ x?: number, y?: number }} [savedCoords={ x: 0, y: 0 }] - Saved coordinates for restore
   * @returns {boolean} True if policy applied
   */
  function applyScrollPolicy(policy, savedCoords = { x: 0, y: 0 }) {
    if (policy === SCROLL_POLICY.RESET_TOP) {
      try {
        scrollTo(0, 0);
        return true;
      } catch (_) {
        return false;
      }
    }

    if (policy === SCROLL_POLICY.RESTORE_SAVED) {
      const targetX = typeof savedCoords.x === 'number' && !isNaN(savedCoords.x) ? savedCoords.x : 0;
      const targetY = typeof savedCoords.y === 'number' && !isNaN(savedCoords.y) ? savedCoords.y : 0;
      try {
        scrollTo(targetX, targetY);
        return true;
      } catch (_) {
        return false;
      }
    }

    if (policy === SCROLL_POLICY.PRESERVE_NATIVE) {
      // Intentionally do nothing; browser native scroll behavior applies
      return true;
    }

    return false;
  }

  /**
   * Evaluates the disposition of a popstate traversal given the active operation state.
   * Respects G3.2 NON_CANCELLABLE_STATES (Amendment 2).
   *
   * @param {string|null} activeOpState - Current NavigationState from stateManager
   * @returns {string} TRAVERSAL_DISPOSITION value
   */
  function evaluateTraversalDisposition(activeOpState) {
    if (!activeOpState || activeOpState === 'IDLE' || TERMINAL_STATES.includes(activeOpState)) {
      return TRAVERSAL_DISPOSITION.IMMEDIATE;
    }

    // Irreversible in-progress states must not be cancelled; traversal is queued
    if (NON_CANCELLABLE_STATES.includes(activeOpState)) {
      return TRAVERSAL_DISPOSITION.QUEUED;
    }

    // Pre-boundary cancellable states (INITIATED, OUTBOUND, FETCHING, PARSED) can be cancelled immediately
    return TRAVERSAL_DISPOSITION.IMMEDIATE;
  }

  /**
   * Queues an incoming browser traversal intent while an irreversible operation is active.
   * Increments the generation token so stale traversals are superseded deterministically.
   *
   * @param {object} traversalData - { targetUrl, state, popstateEvent }
   * @param {string} activeOpState - Current state of active operation
   * @returns {{ disposition: string, generation: number }}
   */
  function queuePendingTraversal(traversalData, activeOpState) {
    const disposition = evaluateTraversalDisposition(activeOpState);
    const token = ++currentGeneration;

    if (disposition === TRAVERSAL_DISPOSITION.QUEUED) {
      pendingTraversal = Object.freeze({
        targetUrl: traversalData.targetUrl || '',
        state: traversalData.state || null,
        generation: token,
        queuedAt: Date.now()
      });
    }

    return {
      disposition,
      generation: token
    };
  }

  /**
   * Retrieves the current queued traversal snapshot.
   *
   * @returns {object|null}
   */
  function getPendingTraversal() {
    return pendingTraversal;
  }

  /**
   * Checks whether a pending traversal is currently queued.
   *
   * @returns {boolean}
   */
  function hasPendingTraversal() {
    return pendingTraversal !== null;
  }

  /**
   * Clears the pending traversal queue.
   */
  function clearPendingTraversal() {
    pendingTraversal = null;
  }

  /**
   * Checks whether a given generation token is the latest active generation.
   *
   * @param {number} generationToken - Generation token to verify
   * @returns {boolean} True if matching latest generation
   */
  function isCurrentGeneration(generationToken) {
    return generationToken === currentGeneration;
  }

  /**
   * Resets local state (for instance reuse or test cleanup).
   */
  function destroy() {
    pendingTraversal = null;
    currentGeneration = 0;
  }

  return {
    isManagedEntry,
    createStateObject,
    captureScroll,
    updateCurrentEntryScroll,
    pushRoute,
    replaceRoute,
    applyScrollPolicy,
    evaluateTraversalDisposition,
    queuePendingTraversal,
    getPendingTraversal,
    hasPendingTraversal,
    clearPendingTraversal,
    isCurrentGeneration,
    getLatestGeneration: () => currentGeneration,
    destroy
  };
}

