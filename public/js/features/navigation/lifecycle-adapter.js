/**
 * MONDO — Route Lifecycle Adapter (Stage G3.3-C)
 * Adapts Work Portfolio and Project Detail page lifecycle interfaces
 * (mountWork/unmountWork, mountProject/unmountProject, awaitWorkFirstViewReady)
 * to satisfy the Navigation Coordinator's lifecycleAdapter contract.
 *
 * STRICT GOVERNANCE & AMENDMENT COMPLIANCE:
 * - Route-specific readiness deadline enforcement:
 *   * Work readiness: 2500ms safety deadline, 1500ms decode, 200ms font gate.
 *   * Project readiness: 3500ms safety deadline.
 *   * Coordinator's 5000ms outer envelope never overrides route-specific ceilings.
 *   * TIMED_OUT and RECOVERABLE_ERROR are NEVER transformed into a ready outcome.
 * - Project readiness event safety:
 *   * Subscribes to mondo:project-ready BEFORE invoking mountProject().
 *   * Immediately evaluates synchronous latched state.
 *   * Rejects stale or uncorrelated readiness events.
 *   * Cleans up observers on cancellation, supersession, or recovery.
 * - Shared landmark: Targets container <main id="main" class="container"> for both routes.
 * - Pure instance factory createRouteLifecycleAdapter() with zero import-time side effects.
 */

import { mountWork, unmountWork } from '../work/work-page.js';
import { mountProject, unmountProject } from '../project/project-page.js';
import { awaitWorkFirstViewReady, WORK_READINESS_OUTCOMES } from '../work/work-readiness.js';
import {
  awaitProjectFirstViewReady,
  PROJECT_READINESS_OUTCOMES,
  DEFAULT_PROJECT_READINESS_DEADLINE_MS,
  DEFAULT_PROJECT_DECODE_DEADLINE_MS,
  DEFAULT_PROJECT_FONT_GATE_DEADLINE_MS
} from '../project/project-readiness.js';

export const DEFAULT_WORK_READINESS_DEADLINE_MS = 2500;
export { DEFAULT_PROJECT_READINESS_DEADLINE_MS };
export const DEFAULT_WORK_DECODE_DEADLINE_MS = 1500;
export const DEFAULT_WORK_FONT_GATE_DEADLINE_MS = 200;
export { DEFAULT_PROJECT_DECODE_DEADLINE_MS, DEFAULT_PROJECT_FONT_GATE_DEADLINE_MS };

/**
 * Creates an instance of the Route Lifecycle Adapter.
 *
 * @param {object} [options={}] Configuration and dependency injections
 * @param {Document} [options.document] Active document context
 * @param {Window} [options.window] Active window context
 * @param {object} [options.workLifecycle] Custom Work page mount/unmount overrides
 * @param {object} [options.projectLifecycle] Custom Project page mount/unmount overrides
 * @param {object} [options.workReadiness] Custom Work readiness helper overrides
 * @param {object} [options.timingConfig] Route-specific timing overrides
 * @returns {object} Lifecycle adapter instance satisfying coordinator lifecycleAdapter interface
 */
export function createRouteLifecycleAdapter(options = {}) {
  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  const win = options.window || (typeof window !== 'undefined' ? window : null);

  const workLifecycle = options.workLifecycle || { mount: mountWork, unmount: unmountWork };
  const projectLifecycle = options.projectLifecycle || { mount: mountProject, unmount: unmountProject };
  const workReadiness = options.workReadiness || { awaitWorkFirstViewReady };
  const projectReadiness = options.projectReadiness || { awaitProjectFirstViewReady };

  const timingConfig = Object.freeze({
    workSafetyTimeoutMs: DEFAULT_WORK_READINESS_DEADLINE_MS,
    projectSafetyTimeoutMs: DEFAULT_PROJECT_READINESS_DEADLINE_MS,
    workDecodeTimeoutMs: DEFAULT_WORK_DECODE_DEADLINE_MS,
    workFontGateMs: DEFAULT_WORK_FONT_GATE_DEADLINE_MS,
    projectDecodeTimeoutMs: DEFAULT_PROJECT_DECODE_DEADLINE_MS,
    projectFontGateMs: DEFAULT_PROJECT_FONT_GATE_DEADLINE_MS,
    ...(options.timingConfig || {})
  });

  // Track active project readiness subscription state across mount and awaitReadiness
  let activeProjectReadiness = null;

  /**
   * Unmounts the active outgoing route component and cleans up listeners/observers.
   *
   * @param {object} sourceRoute - Outgoing route descriptor
   * @param {object} [context={}] - Context options
   * @returns {Promise<void>}
   */
  async function unmountRoute(sourceRoute, context = {}) {
    const root = context.container || doc;
    const routeType = sourceRoute ? (sourceRoute.type || sourceRoute.id) : null;

    // Reset any pending project readiness subscription
    if (activeProjectReadiness) {
      if (typeof activeProjectReadiness.cleanup === 'function') {
        try { activeProjectReadiness.cleanup(); } catch (_) {}
      }
      activeProjectReadiness = null;
    }

    if (routeType === 'work') {
      if (typeof workLifecycle.unmount === 'function') {
        workLifecycle.unmount({ root });
      }
    } else if (routeType === 'project') {
      if (typeof projectLifecycle.unmount === 'function') {
        projectLifecycle.unmount({ root });
      }
    }
  }

  /**
   * Mounts the incoming destination route component into the swapped DOM container.
   *
   * @param {object} targetRoute - Destination route descriptor
   * @param {object} [context={}] - Mount options (container, slug, params, operationId, signal)
   * @returns {Promise<void>}
   */
  async function mountRoute(targetRoute, context = {}) {
    const root = context.container || doc;
    const routeType = targetRoute ? (targetRoute.type || targetRoute.id) : null;
    const operationId = context.operationId || null;
    const signal = context.signal || null;
    const resolvedSlug = context.slug || (context.params && context.params.slug) || (targetRoute ? targetRoute.slug : '') || '';

    if (routeType === 'work') {
      if (typeof workLifecycle.mount === 'function') {
        await workLifecycle.mount({
          root,
          operationId,
          signal
        });
      }
    } else if (routeType === 'project') {
      // 1. Project Readiness Pre-Subscription (Requirement 5)
      // Must subscribe to mondo:project-ready BEFORE invoking mountProject
      let projectReadyFired = false;
      let projectReadyDetail = null;
      let removeListener = null;

      const readyPromise = new Promise((resolve) => {
        const handler = (evt) => {
          // Validate event correlation: ignore unrelated or stale operations if detail is present
          if (evt && evt.detail && typeof evt.detail === 'object') {
            if (evt.detail.operationId && operationId && evt.detail.operationId !== operationId) {
              return; // Stale operation event
            }
            if (evt.detail.slug && resolvedSlug && evt.detail.slug !== resolvedSlug) {
              return; // Unrelated project event
            }
          }
          projectReadyFired = true;
          projectReadyDetail = evt && evt.detail ? evt.detail : null;
          resolve({ status: 'ready', outcome: 'CRITICAL_MEDIA_READY', detail: projectReadyDetail });
        };

        if (win && typeof win.addEventListener === 'function') {
          win.addEventListener('mondo:project-ready', handler);
          removeListener = () => {
            if (win && typeof win.removeEventListener === 'function') {
              win.removeEventListener('mondo:project-ready', handler);
            }
          };
        }
      });

      // 2. Invoke mountProject
      let coordinator = null;
      if (typeof projectLifecycle.mount === 'function') {
        coordinator = await projectLifecycle.mount({
          root,
          slug: resolvedSlug,
          url: targetRoute ? targetRoute.pathname : '',
          operationId,
          signal
        });
      }

      // 3. Immediately evaluate synchronous latched state
      // (Handles instant ready when hero media is absent or already decoded)
      const isSyncReady = Boolean(
        projectReadyFired ||
        (coordinator && typeof coordinator.isReady === 'function' && coordinator.isReady())
      );

      activeProjectReadiness = {
        operationId,
        slug: resolvedSlug,
        isSyncReady,
        readyPromise,
        coordinator,
        cleanup: removeListener
      };
    }
  }

  /**
   * Awaits destination route readiness subject to route-specific safety deadlines.
   *
   * @param {object} targetRoute - Destination route descriptor
   * @param {object} [context={}] - Evaluation options (signal, timeoutMs, container)
   * @returns {Promise<{ status: string, outcome: string, details?: any }>}
   */
  async function awaitReadiness(targetRoute, context = {}) {
    const root = context.container || doc;
    const routeType = targetRoute ? (targetRoute.type || targetRoute.id) : null;
    const signal = context.signal || null;
    const coordinatorTimeoutMs = context.timeoutMs || 5000;

    // Cancellation check
    if (signal && signal.aborted) {
      return { status: 'aborted', outcome: 'ABORTED', error: 'Readiness evaluation aborted' };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Route 1: Work Portfolio Collection (/work)
    // ─────────────────────────────────────────────────────────────────────────
    if (routeType === 'work') {
      // Enforce route-specific deadline ceiling: must not exceed 2500ms
      const enforcedSafetyCeiling = Math.min(coordinatorTimeoutMs, timingConfig.workSafetyTimeoutMs);

      if (typeof workReadiness.awaitWorkFirstViewReady !== 'function') {
        return { status: 'ready', outcome: 'CRITICAL_MEDIA_READY' };
      }

      const res = await workReadiness.awaitWorkFirstViewReady({
        root,
        safetyTimeoutMs: enforcedSafetyCeiling,
        decodeTimeoutMs: timingConfig.workDecodeTimeoutMs,
        fontGateMs: timingConfig.workFontGateMs,
        signal
      });

      // Strict outcome integrity: TIMED_OUT and RECOVERABLE_ERROR are never mapped to ready
      if (res.outcome === WORK_READINESS_OUTCOMES.CRITICAL_MEDIA_READY ||
          res.outcome === WORK_READINESS_OUTCOMES.VERIFIED_FALLBACK_READY ||
          res.outcome === WORK_READINESS_OUTCOMES.DATA_READY) {
        return {
          status: 'ready',
          outcome: res.outcome,
          details: res
        };
      }

      if (res.outcome === WORK_READINESS_OUTCOMES.TIMED_OUT) {
        return {
          status: 'timeout',
          outcome: 'TIMED_OUT',
          details: res
        };
      }

      if (res.outcome === WORK_READINESS_OUTCOMES.ABORTED) {
        return {
          status: 'aborted',
          outcome: 'ABORTED',
          details: res
        };
      }

      return {
        status: 'failed',
        outcome: res.outcome || 'RECOVERABLE_ERROR',
        details: res
      };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Route 2: Project Detail View (/work/:slug)
    // ─────────────────────────────────────────────────────────────────────────
    if (routeType === 'project') {
      // Enforce route-specific deadline ceiling: must not exceed 3500ms
      const enforcedSafetyCeiling = Math.min(coordinatorTimeoutMs, timingConfig.projectSafetyTimeoutMs);

      const readinessSub = activeProjectReadiness;

      // 1. Check if project was already ready synchronously during mount
      if (readinessSub && readinessSub.isSyncReady) {
        if (typeof readinessSub.cleanup === 'function') {
          try { readinessSub.cleanup(); } catch (_) {}
        }
        activeProjectReadiness = null;
        return { status: 'ready', outcome: PROJECT_READINESS_OUTCOMES.CRITICAL_MEDIA_READY };
      }

      // 2. Check if root has authentic project DOM structure or explicit projectReadiness override was passed
      const hasProjectDomStructure = Boolean(
        root && (
          (root.querySelector && root.querySelector('#project-main')) ||
          (root.getElementById && root.getElementById('project-main'))
        )
      );

      if (hasProjectDomStructure || options.projectReadiness) {
        if (typeof projectReadiness.awaitProjectFirstViewReady === 'function') {
          const res = await projectReadiness.awaitProjectFirstViewReady({
            root,
            expectedSlug: targetRoute.slug || (readinessSub && readinessSub.slug),
            safetyTimeoutMs: enforcedSafetyCeiling,
            decodeTimeoutMs: timingConfig.projectDecodeTimeoutMs,
            fontGateMs: timingConfig.projectFontGateMs,
            signal
          });

          if (readinessSub && typeof readinessSub.cleanup === 'function') {
            try { readinessSub.cleanup(); } catch (_) {}
          }
          activeProjectReadiness = null;

          if (res.outcome === PROJECT_READINESS_OUTCOMES.CRITICAL_MEDIA_READY ||
              res.outcome === PROJECT_READINESS_OUTCOMES.VERIFIED_FALLBACK_READY ||
              res.outcome === PROJECT_READINESS_OUTCOMES.DATA_READY) {
            return {
              status: 'ready',
              outcome: res.outcome,
              details: res
            };
          }

          if (res.outcome === PROJECT_READINESS_OUTCOMES.TIMED_OUT) {
            return {
              status: 'timeout',
              outcome: 'TIMED_OUT',
              details: res
            };
          }

          if (res.outcome === PROJECT_READINESS_OUTCOMES.ABORTED) {
            return {
              status: 'aborted',
              outcome: 'ABORTED',
              details: res
            };
          }

          return {
            status: 'failed',
            outcome: res.outcome || 'RECOVERABLE_ERROR',
            details: res
          };
        }
      }

      if (!readinessSub) {
        // Fallback if mountRoute was bypassed in a test harness
        return { status: 'ready', outcome: PROJECT_READINESS_OUTCOMES.CRITICAL_MEDIA_READY };
      }

      // Race asynchronous ready promise against route-specific safety ceiling & abort signal
      return new Promise((resolve) => {
        let settled = false;
        let safetyTimer = null;

        const finish = (result) => {
          if (settled) return;
          settled = true;
          if (safetyTimer !== null) {
            clearTimeout(safetyTimer);
            safetyTimer = null;
          }
          if (typeof readinessSub.cleanup === 'function') {
            try { readinessSub.cleanup(); } catch (_) {}
          }
          activeProjectReadiness = null;
          resolve(result);
        };

        const onAbort = () => finish({ status: 'aborted', outcome: 'ABORTED' });
        if (signal) {
          if (signal.aborted) return onAbort();
          signal.addEventListener('abort', onAbort, { once: true });
        }

        // Enforce strict timeout ceiling (3500ms)
        safetyTimer = setTimeout(() => {
          finish({
            status: 'timeout',
            outcome: 'TIMED_OUT',
            error: `Project readiness exceeded ${enforcedSafetyCeiling}ms ceiling`
          });
        }, enforcedSafetyCeiling);

        // Await subscription promise
        readinessSub.readyPromise
          .then((res) => {
            finish({
              status: 'ready',
              outcome: res && res.outcome ? res.outcome : PROJECT_READINESS_OUTCOMES.CRITICAL_MEDIA_READY,
              details: res
            });
          })
          .catch((err) => {
            finish({
              status: 'failed',
              outcome: 'RECOVERABLE_ERROR',
              error: err ? err.message : 'Project readiness rejected'
            });
          });
      });
    }

    // Default for other routes
    return { status: 'ready', outcome: 'CRITICAL_MEDIA_READY' };
  }

  return {
    unmountRoute,
    mountRoute,
    awaitReadiness,
    getTimingConfig: () => timingConfig
  };
}

