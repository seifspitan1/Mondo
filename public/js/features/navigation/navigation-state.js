/**
 * MONDO — Navigation State & Cancellation Manager (Stage G3.2-R2)
 * Isolated state machine and operation cancellation token engine
 * for the Option C Hybrid Navigation Pilot.
 *
 * STRICT GOVERNANCE:
 * - NO live DOM access or manipulation.
 * - NO History API interaction (pushState / replaceState).
 * - NO location.href or location.reload triggers.
 * - NO browser event listeners or global singletons.
 * - Enforces Point of No Return cancellation boundary.
 * - Prevents supersession of irreversible in-flight operations.
 * - Pure instance-based factory for deterministic unit testing.
 */

/**
 * Immutable candidate states for the hybrid navigation lifecycle.
 */
export const NAVIGATION_STATES = Object.freeze({
  IDLE: 'IDLE',
  INITIATED: 'INITIATED',
  OUTBOUND: 'OUTBOUND',
  FETCHING: 'FETCHING',
  PARSED: 'PARSED',
  COMMITTING: 'COMMITTING',
  AWAITING_READINESS: 'AWAITING_READINESS',
  REVEALING: 'REVEALING',
  COMPLETE: 'COMPLETE',
  RECOVERING: 'RECOVERING',
  CANCELLED: 'CANCELLED'
});

/**
 * Declarative state transition rules.
 * Defines permitted destination states for every lifecycle phase.
 */
export const PERMITTED_TRANSITIONS = Object.freeze({
  [NAVIGATION_STATES.IDLE]: Object.freeze([
    NAVIGATION_STATES.INITIATED
  ]),
  [NAVIGATION_STATES.INITIATED]: Object.freeze([
    NAVIGATION_STATES.OUTBOUND,
    NAVIGATION_STATES.CANCELLED
  ]),
  [NAVIGATION_STATES.OUTBOUND]: Object.freeze([
    NAVIGATION_STATES.FETCHING,
    NAVIGATION_STATES.CANCELLED
  ]),
  [NAVIGATION_STATES.FETCHING]: Object.freeze([
    NAVIGATION_STATES.PARSED,
    NAVIGATION_STATES.RECOVERING,
    NAVIGATION_STATES.CANCELLED
  ]),
  [NAVIGATION_STATES.PARSED]: Object.freeze([
    NAVIGATION_STATES.COMMITTING,
    NAVIGATION_STATES.RECOVERING,
    NAVIGATION_STATES.CANCELLED
  ]),
  [NAVIGATION_STATES.COMMITTING]: Object.freeze([
    NAVIGATION_STATES.AWAITING_READINESS,
    NAVIGATION_STATES.RECOVERING
  ]),
  [NAVIGATION_STATES.AWAITING_READINESS]: Object.freeze([
    NAVIGATION_STATES.REVEALING,
    NAVIGATION_STATES.RECOVERING
  ]),
  [NAVIGATION_STATES.REVEALING]: Object.freeze([
    NAVIGATION_STATES.COMPLETE,
    NAVIGATION_STATES.RECOVERING
  ]),
  [NAVIGATION_STATES.COMPLETE]: Object.freeze([
    NAVIGATION_STATES.IDLE
  ]),
  [NAVIGATION_STATES.RECOVERING]: Object.freeze([
    NAVIGATION_STATES.COMPLETE,
    NAVIGATION_STATES.IDLE
  ]),
  [NAVIGATION_STATES.CANCELLED]: Object.freeze([
    NAVIGATION_STATES.IDLE
  ])
});

/**
 * Terminal states from which an operation cannot continue forward.
 */
export const TERMINAL_STATES = Object.freeze([
  NAVIGATION_STATES.COMPLETE,
  NAVIGATION_STATES.CANCELLED
]);

/**
 * Non-cancellable states past the Point of No Return (COMMITTING onward).
 * Once unmounting/committing begins, cancellation is strictly prohibited
 * to protect against leaving the browser with a destroyed outgoing DOM.
 */
export const NON_CANCELLABLE_STATES = Object.freeze([
  NAVIGATION_STATES.COMMITTING,
  NAVIGATION_STATES.AWAITING_READINESS,
  NAVIGATION_STATES.REVEALING,
  NAVIGATION_STATES.COMPLETE,
  NAVIGATION_STATES.RECOVERING
]);

/**
 * Checks whether a given state has passed the irreversible Point of No Return.
 *
 * @param {string} state - Navigation state candidate
 * @returns {boolean} True if state is non-cancellable
 */
export function isPostBoundaryState(state) {
  return NON_CANCELLABLE_STATES.includes(state);
}

/**
 * Checks whether an operation in the given state can be safely cancelled.
 *
 * @param {string} state - Navigation state candidate
 * @returns {boolean} True if cancellable
 */
export function isCancellableState(state) {
  return !NON_CANCELLABLE_STATES.includes(state) &&
         state !== NAVIGATION_STATES.CANCELLED &&
         state !== NAVIGATION_STATES.IDLE;
}

/**
 * Creates an independent Navigation State Manager instance.
 *
 * @returns {object} Manager instance with operations and transition methods
 */
export function createNavigationStateManager() {
  let sequenceId = 0;
  let activeOp = null;

  /**
   * Generates a new operation and binds a fresh AbortController.
   * If a previous operation is active and cancellable, it is automatically superseded and aborted.
   * If the active operation has passed the Point of No Return, supersession is rejected and null is returned.
   *
   * @param {object} [metadata={}] - Optional metadata (e.g. fromPath, toPath)
   * @returns {object|null} Immutable operation descriptor or null if supersession is blocked
   */
  function startOperation(metadata = {}) {
    // Check if an operation is currently active
    if (activeOp && !TERMINAL_STATES.includes(activeOp.state)) {
      // Point of No Return: irreversible operations cannot be superseded
      if (NON_CANCELLABLE_STATES.includes(activeOp.state)) {
        return null;
      }
      cancelOperation(activeOp.id, 'superseded_by_new_operation');
    }

    const opId = ++sequenceId;
    const abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;

    activeOp = {
      id: opId,
      state: NAVIGATION_STATES.INITIATED,
      createdAt: Date.now(),
      metadata: Object.freeze({ ...metadata }),
      abortController,
      signal: abortController ? abortController.signal : null,
      cancellationReason: null,
      superseded: false
    };

    return getActiveOperation();
  }

  /**
   * Validates and executes a state transition for a specified operation ID.
   *
   * @param {number} opId - Operation ID attempting transition
   * @param {string} nextState - Target navigation state
   * @returns {{ ok: boolean, state: string, error?: string }} Result
   */
  function transition(opId, nextState) {
    if (!activeOp || activeOp.id !== opId) {
      return {
        ok: false,
        state: activeOp ? activeOp.state : NAVIGATION_STATES.IDLE,
        error: `Stale or non-existent operation ID: ${opId} (current: ${activeOp ? activeOp.id : 'none'})`
      };
    }

    if (activeOp.superseded) {
      return {
        ok: false,
        state: activeOp.state,
        error: `Cannot transition superseded operation: ${opId}`
      };
    }

    const currentState = activeOp.state;
    const allowed = PERMITTED_TRANSITIONS[currentState] || [];

    if (!allowed.includes(nextState)) {
      return {
        ok: false,
        state: currentState,
        error: `Illegal state transition from ${currentState} to ${nextState}`
      };
    }

    activeOp.state = nextState;
    return {
      ok: true,
      state: nextState
    };
  }

  /**
   * Explicitly cancels an operation, triggering its AbortController.
   * Safe and idempotent before the Point of No Return.
   * Strictly rejected after the Point of No Return without modifying state or aborting signal.
   *
   * @param {number} opId - Operation ID to cancel
   * @param {string} [reason='user_cancelled'] - Cancellation explanation
   * @returns {boolean} True if cancelled, false if rejected (non-cancellable, already terminal, or stale)
   */
  function cancelOperation(opId, reason = 'user_cancelled') {
    if (!activeOp || activeOp.id !== opId) {
      return false;
    }

    // Idempotent: already cancelled
    if (activeOp.state === NAVIGATION_STATES.CANCELLED) {
      return true;
    }

    // Irreversible boundary: Point of No Return crossed
    // Non-cancellable states (COMMITTING, AWAITING_READINESS, REVEALING, COMPLETE, RECOVERING) cannot be cancelled
    if (NON_CANCELLABLE_STATES.includes(activeOp.state)) {
      return false;
    }

    activeOp.cancellationReason = reason;
    activeOp.state = NAVIGATION_STATES.CANCELLED;
    if (reason === 'superseded_by_new_operation') {
      activeOp.superseded = true;
    }

    if (activeOp.abortController && !activeOp.abortController.signal.aborted) {
      try {
        activeOp.abortController.abort(new Error(reason));
      } catch (_) {
        // Fallback for environments where abort() does not accept reason
        try { activeOp.abortController.abort(); } catch (__) {}
      }
    }

    return true;
  }

  /**
   * Resets the state manager cleanly to IDLE, terminating cancellable operations.
   *
   * @param {string} [reason='manager_reset'] - Reset reason
   */
  function reset(reason = 'manager_reset') {
    if (activeOp && !TERMINAL_STATES.includes(activeOp.state)) {
      if (!NON_CANCELLABLE_STATES.includes(activeOp.state)) {
        cancelOperation(activeOp.id, reason);
      }
    }
    activeOp = null;
  }

  /**
   * Checks whether a given operation ID is the active and current operation.
   *
   * @param {number} opId - Operation ID
   * @returns {boolean} True if active and not superseded
   */
  function isCurrent(opId) {
    return Boolean(activeOp && activeOp.id === opId && !activeOp.superseded);
  }

  /**
   * Checks whether the active operation has crossed into non-cancellable territory.
   *
   * @param {number} opId - Operation ID
   * @returns {boolean} True if active, matches opId, and is in NON_CANCELLABLE_STATES
   */
  function isPostBoundary(opId) {
    if (!activeOp || activeOp.id !== opId) return false;
    return NON_CANCELLABLE_STATES.includes(activeOp.state);
  }

  /**
   * Returns an immutable snapshot of the active operation or null if IDLE.
   *
   * @returns {object|null}
   */
  function getActiveOperation() {
    if (!activeOp) return null;
    return Object.freeze({
      id: activeOp.id,
      state: activeOp.state,
      createdAt: activeOp.createdAt,
      metadata: activeOp.metadata,
      signal: activeOp.signal,
      cancellationReason: activeOp.cancellationReason,
      superseded: activeOp.superseded
    });
  }

  /**
   * Returns current lifecycle state.
   *
   * @returns {string} State name
   */
  function getState() {
    return activeOp ? activeOp.state : NAVIGATION_STATES.IDLE;
  }

  return {
    startOperation,
    transition,
    cancelOperation,
    reset,
    isCurrent,
    isPostBoundary,
    getState,
    getActiveOperation
  };
}
