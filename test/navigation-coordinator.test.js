/**
 * MONDO — Navigation Coordinator Automated Test Suite (Stage G3.3-B)
 * Comprehensive verification of the dormant navigation coordinator core engine,
 * state machine boundaries, fact-based recovery, History/popstate integration,
 * safe deferred teardown, and Amendments B-01, B-02, and B-03.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  createNavigationCoordinator,
  EFFECT_CERTAINTY,
  TRANSACTION_PROGRESS,
  TEARDOWN_LIFECYCLE,
  NAVIGATION_DISPOSITION,
  DEFAULT_TIMING_CONFIG
} from '../public/js/features/navigation/navigation-coordinator.js';

import {
  NAVIGATION_STATES,
  NON_CANCELLABLE_STATES,
  TERMINAL_STATES
} from '../public/js/features/navigation/navigation-state.js';

import {
  SCROLL_POLICY
} from '../public/js/features/navigation/history-manager.js';

/**
 * Creates a fully controllable suite of mock adapters.
 */
function createMockAdapters(overrides = {}) {
  const calls = {
    showVeil: [],
    dismissVeil: [],
    unmountRoute: [],
    mountRoute: [],
    awaitReadiness: [],
    swapMainContent: [],
    updateTitle: [],
    renderInSituError: [],
    navigateNative: [],
    replaceNative: [],
    pushRoute: [],
    applyScrollPolicy: []
  };

  let currentHref = overrides.initialHref || 'http://localhost:3005/work';
  let currentPathname = overrides.initialPathname || '/work';
  let historyState = overrides.initialState !== undefined ? overrides.initialState : null;

  const locationAdapter = {
    getHref: () => currentHref,
    getPathname: () => currentPathname,
    getOrigin: () => 'http://localhost:3005',
    setHref: (href) => {
      currentHref = href;
      try {
        currentPathname = new URL(href).pathname;
      } catch (_) {
        currentPathname = href;
      }
    },
    ...overrides.locationAdapter
  };

  const historyStateAdapter = {
    getState: () => historyState,
    setState: (st) => { historyState = st; },
    ...overrides.historyStateAdapter
  };

  const transitionVeilAdapter = {
    showVeil: async (meta) => {
      calls.showVeil.push(meta);
      if (overrides.onShowVeil) await overrides.onShowVeil(meta);
    },
    dismissVeil: async () => {
      calls.dismissVeil.push(Date.now());
      if (overrides.onDismissVeil) await overrides.onDismissVeil();
    },
    isVeilVisible: () => calls.showVeil.length > calls.dismissVeil.length,
    ...overrides.transitionVeilAdapter
  };

  const loaderAdapter = {
    loadHtml: async (url, opts) => {
      if (overrides.loadHtmlImpl) {
        return overrides.loadHtmlImpl(url, opts);
      }
      return {
        ok: true,
        data: {
          url: typeof url === 'string' && url.startsWith('http') ? url : `http://localhost:3005${url}`,
          pathname: typeof url === 'string' && url.startsWith('http') ? new URL(url).pathname : url,
          route: url.includes('/work/') ? 'project' : 'work',
          slug: url.includes('/work/') ? url.split('/work/')[1] : null,
          title: 'Mock Destination — MONDO',
          metaDescription: 'Mock description',
          mainHtml: '<section id="project-main"><h1>Mock Project</h1></section>'
        }
      };
    },
    ...overrides.loaderAdapter
  };

  const domAdapter = {
    getRenderedPath: () => currentPathname,
    swapMainContent: (html, targetRoute) => {
      calls.swapMainContent.push({ html, targetRoute });
      if (overrides.onSwapMainContent) {
        return overrides.onSwapMainContent(html, targetRoute);
      }
      return true;
    },
    updateTitle: (t) => {
      calls.updateTitle.push(t);
    },
    hasExpectedLandmark: (type) => {
      if (overrides.hasExpectedLandmarkImpl) {
        return overrides.hasExpectedLandmarkImpl(type);
      }
      return true;
    },
    renderInSituError: (type, err) => {
      calls.renderInSituError.push({ type, err });
      if (overrides.onRenderInSituError) {
        return overrides.onRenderInSituError(type, err);
      }
      return true;
    },
    ...overrides.domAdapter
  };

  const lifecycleAdapter = {
    unmountRoute: async (source) => {
      calls.unmountRoute.push(source);
      if (overrides.onUnmountRoute) await overrides.onUnmountRoute(source);
    },
    mountRoute: async (target, params) => {
      calls.mountRoute.push({ target, params });
      if (overrides.onMountRoute) await overrides.onMountRoute(target, params);
    },
    awaitReadiness: async (target, opts) => {
      calls.awaitReadiness.push({ target, opts });
      if (overrides.awaitReadinessImpl) {
        return overrides.awaitReadinessImpl(target, opts);
      }
      return { status: 'ready', outcome: 'CRITICAL_MEDIA_READY' };
    },
    ...overrides.lifecycleAdapter
  };

  const recoveryAdapter = {
    navigateNative: (url) => {
      calls.navigateNative.push(url);
      if (overrides.onNavigateNative) return overrides.onNavigateNative(url);
    },
    replaceNative: (url) => {
      calls.replaceNative.push(url);
      if (overrides.onReplaceNative) return overrides.onReplaceNative(url);
    },
    ...overrides.recoveryAdapter
  };

  return {
    calls,
    locationAdapter,
    historyStateAdapter,
    transitionVeilAdapter,
    loaderAdapter,
    domAdapter,
    lifecycleAdapter,
    recoveryAdapter
  };
}

describe('Stage G3.3-B: Navigation Coordinator Core Engine', () => {

  // =========================================================================
  // GROUP A: Factory, Dependency Injection & Strict Dormancy
  // =========================================================================
  describe('Group A: Factory, Dependency Injection & Strict Dormancy', () => {
    it('creates an independent coordinator instance with default methods', () => {
      const coordinator = createNavigationCoordinator();
      assert.strictEqual(typeof coordinator.navigate, 'function');
      assert.strictEqual(typeof coordinator.handlePopstate, 'function');
      assert.strictEqual(typeof coordinator.cancel, 'function');
      assert.strictEqual(typeof coordinator.destroy, 'function');
      assert.strictEqual(typeof coordinator.getState, 'function');
      assert.strictEqual(typeof coordinator.getProgress, 'function');
      assert.strictEqual(typeof coordinator.isBusy, 'function');
      assert.strictEqual(typeof coordinator.hasPendingTraversal, 'function');
      assert.strictEqual(typeof coordinator.getTeardownStatus, 'function');
    });

    it('initializes in IDLE state with ZERO automatic operations or side effects', () => {
      const mocks = createMockAdapters();
      const coordinator = createNavigationCoordinator({
        locationAdapter: mocks.locationAdapter,
        domAdapter: mocks.domAdapter,
        transitionVeilAdapter: mocks.transitionVeilAdapter
      });

      assert.strictEqual(coordinator.getState(), NAVIGATION_STATES.IDLE);
      assert.strictEqual(coordinator.getProgress(), TRANSACTION_PROGRESS.IDLE);
      assert.strictEqual(coordinator.isBusy(), false);
      assert.strictEqual(coordinator.hasPendingTraversal(), false);
      assert.strictEqual(coordinator.getTeardownStatus(), TEARDOWN_LIFECYCLE.ACTIVE);

      // Verify zero side-effects on creation
      assert.strictEqual(mocks.calls.showVeil.length, 0);
      assert.strictEqual(mocks.calls.unmountRoute.length, 0);
      assert.strictEqual(mocks.calls.swapMainContent.length, 0);
      assert.strictEqual(mocks.calls.navigateNative.length, 0);
    });

    it('multiple coordinator instances operate independently without state bleed', async () => {
      const coord1 = createNavigationCoordinator({
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });
      const coord2 = createNavigationCoordinator({
        initialRoute: { id: 'project', type: 'project', pathname: '/work/aurora' }
      });

      assert.strictEqual(coord1.getRenderedRoute().pathname, '/work');
      assert.strictEqual(coord2.getRenderedRoute().pathname, '/work/aurora');
      assert.notStrictEqual(coord1, coord2);
    });

    it('exposes configurable timing defaults per G3-D07', () => {
      const customTiming = {
        fetchTimeoutMs: 4000,
        readinessTimeoutMs: 3000
      };
      const coordinator = createNavigationCoordinator({ timingConfig: customTiming });
      const cfg = coordinator.getTimingConfig();

      assert.strictEqual(cfg.fetchTimeoutMs, 4000);
      assert.strictEqual(cfg.readinessTimeoutMs, 3000);
      assert.strictEqual(cfg.revealTimeoutMs, DEFAULT_TIMING_CONFIG.revealTimeoutMs);
    });

    it('supports custom dependency injection across all adapter interfaces', async () => {
      let customEligibilityCalled = false;
      const customEligibility = {
        normalizePath: (p) => p,
        parseRoute: (p) => ({ type: 'work' }),
        isPilotRoute: () => true,
        isEligiblePair: () => { customEligibilityCalled = true; return true; },
        matchRoute: () => null
      };

      const coordinator = createNavigationCoordinator({
        eligibilityAdapter: customEligibility,
        initialRoute: { id: 'project', type: 'project', pathname: '/work/aurora' }
      });

      await coordinator.navigate('/work');
      assert.strictEqual(customEligibilityCalled, true);
    });

    it('defaults to pure inert adapters when no options are provided', () => {
      const coordinator = createNavigationCoordinator();
      assert.strictEqual(coordinator.getState(), NAVIGATION_STATES.IDLE);
      assert.strictEqual(coordinator.getActiveOperation(), null);
    });
  });

  // =========================================================================
  // GROUP B: Route Eligibility & Pre-Commit Filtering
  // =========================================================================
  describe('Group B: Route Eligibility & Pre-Commit Filtering', () => {
    it('accepts eligible pilot pair /work -> /work/:slug for hybrid execution', async () => {
      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work'
      });
      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const result = await coordinator.navigate('/work/solitude-sound');
      assert.strictEqual(result.disposition, NAVIGATION_DISPOSITION.COMPLETED);
      assert.strictEqual(result.targetUrl, '/work/solitude-sound');
      assert.strictEqual(coordinator.getState(), NAVIGATION_STATES.IDLE);
    });

    it('accepts eligible pilot pair /work/:slug -> /work for hybrid execution', async () => {
      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work/solitude-sound',
        initialPathname: '/work/solitude-sound'
      });
      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'project', type: 'project', pathname: '/work/solitude-sound', slug: 'solitude-sound' }
      });

      const result = await coordinator.navigate('/work');
      assert.strictEqual(result.disposition, NAVIGATION_DISPOSITION.COMPLETED);
      assert.strictEqual(result.targetUrl, '/work');
      assert.strictEqual(coordinator.getState(), NAVIGATION_STATES.IDLE);
    });

    it('rejects project-to-project navigation per G3-D02 and delegates native fallback', async () => {
      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work/alpha',
        initialPathname: '/work/alpha'
      });
      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'project', type: 'project', pathname: '/work/alpha', slug: 'alpha' }
      });

      const result = await coordinator.navigate('/work/beta');
      assert.strictEqual(result.disposition, NAVIGATION_DISPOSITION.INELIGIBLE_NATIVE_FALLBACK);
      assert.strictEqual(result.reason, 'route_pair_ineligible');
      assert.strictEqual(mocks.calls.navigateNative.length, 1);
      assert.strictEqual(mocks.calls.navigateNative[0], '/work/beta');
      assert.strictEqual(coordinator.getState(), NAVIGATION_STATES.IDLE);
    });

    it('rejects non-pilot routes (e.g. /, /start, /admin) and delegates native fallback', async () => {
      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work'
      });
      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const nonPilotTargets = ['/', '/start', '/privacy', '/admin', 'https://external.com/test'];
      for (const target of nonPilotTargets) {
        const result = await coordinator.navigate(target);
        assert.strictEqual(result.disposition, NAVIGATION_DISPOSITION.INELIGIBLE_NATIVE_FALLBACK);
      }
    });

    it('rejects same-route navigation (/work -> /work)', async () => {
      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work'
      });
      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const result = await coordinator.navigate('/work');
      assert.strictEqual(result.disposition, NAVIGATION_DISPOSITION.INELIGIBLE_NATIVE_FALLBACK);
      assert.strictEqual(result.reason, 'route_pair_ineligible');
    });

    it('normalizes trailing slashes before route pair evaluation (/work/ -> /work)', async () => {
      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work/solitude-sound',
        initialPathname: '/work/solitude-sound'
      });
      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'project', type: 'project', pathname: '/work/solitude-sound', slug: 'solitude-sound' }
      });

      const result = await coordinator.navigate('/work/');
      assert.strictEqual(result.disposition, NAVIGATION_DISPOSITION.COMPLETED);
      assert.strictEqual(result.targetUrl, '/work');
    });

    it('ineligible navigation with executeNativeFallback: false does not invoke navigateNative', async () => {
      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work'
      });
      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const result = await coordinator.navigate('/admin', { executeNativeFallback: false });
      assert.strictEqual(result.disposition, NAVIGATION_DISPOSITION.INELIGIBLE_NATIVE_FALLBACK);
      assert.strictEqual(mocks.calls.navigateNative.length, 0);
    });

    it('rejects malformed URLs and path traversal attempts as ineligible', async () => {
      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work'
      });
      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const traversalTargets = ['/work/../secret', '/work/..%2f..%2fetc/passwd', 'javascript:alert(1)'];
      for (const target of traversalTargets) {
        const result = await coordinator.navigate(target);
        assert.strictEqual(result.disposition, NAVIGATION_DISPOSITION.INELIGIBLE_NATIVE_FALLBACK);
      }
    });
  });

  // =========================================================================
  // GROUP C: Cancellation & State Transitions
  // =========================================================================
  describe('Group C: Cancellation & State Transitions', () => {
    it('cancels pre-commit navigation during FETCHING, aborts loader, and dismisses veil', async () => {
      let resolveFetch;
      const fetchPromise = new Promise((resolve) => { resolveFetch = resolve; });

      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work',
        loadHtmlImpl: async (_url, { signal }) => {
          return new Promise((resolve, reject) => {
            if (signal) {
              signal.addEventListener('abort', () => {
                reject(new Error('Fetch aborted'));
              });
            }
            fetchPromise.then(resolve);
          });
        }
      });

      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      // Start navigation (hangs in FETCHING)
      const navPromise = coordinator.navigate('/work/solitude-sound');

      // Check busy
      assert.strictEqual(coordinator.isBusy(), true);

      // Cancel while fetching
      const cancelled = coordinator.cancel('user_click_stop');
      assert.strictEqual(cancelled, true);

      const result = await navPromise;
      assert.strictEqual(result.disposition, NAVIGATION_DISPOSITION.CANCELLED);
      assert.strictEqual(coordinator.getState(), NAVIGATION_STATES.IDLE);
      // Veil must be dismissed
      assert.strictEqual(mocks.calls.dismissVeil.length >= 1, true);
      // DOM swap and unmount must NEVER have been called
      assert.strictEqual(mocks.calls.unmountRoute.length, 0);
      assert.strictEqual(mocks.calls.swapMainContent.length, 0);
    });

    it('STRICT POINT OF NO RETURN: post-boundary cancellation is strictly rejected', async () => {
      let resolveMount;
      const mountPromise = new Promise((resolve) => { resolveMount = resolve; });

      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work',
        onMountRoute: async () => {
          // Pause during COMMITTING mount
          await mountPromise;
        }
      });

      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const navPromise = coordinator.navigate('/work/solitude-sound');

      // Wait a tick for COMMITTING to be entered
      await new Promise((r) => setTimeout(r, 10));

      assert.strictEqual(coordinator.getState(), NAVIGATION_STATES.COMMITTING);

      // Attempt cancellation past Point of No Return
      const cancelled = coordinator.cancel('attempt_late_abort');
      assert.strictEqual(cancelled, false, 'Cancellation must be rejected post-PONR');

      // Release mount so navigation completes
      resolveMount();
      const result = await navPromise;
      assert.strictEqual(result.disposition, NAVIGATION_DISPOSITION.COMPLETED);
      assert.strictEqual(coordinator.getState(), NAVIGATION_STATES.IDLE);
    });

    it('supersedes pre-boundary navigation when a new eligible navigation starts', async () => {
      let resolveFirstFetch;
      const firstFetchPromise = new Promise((resolve) => { resolveFirstFetch = resolve; });

      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work',
        loadHtmlImpl: async (url, { signal }) => {
          if (url.includes('first-project')) {
            return new Promise((resolve, reject) => {
              if (signal) {
                signal.addEventListener('abort', () => reject(new Error('Superseded')));
              }
              firstFetchPromise.then(resolve);
            });
          }
          return {
            ok: true,
            data: {
              url: 'http://localhost:3005/work/second-project',
              pathname: '/work/second-project',
              route: 'project',
              slug: 'second-project',
              title: 'Second Project',
              mainHtml: '<section id="project-main">Second</section>'
            }
          };
        }
      });

      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const firstNav = coordinator.navigate('/work/first-project');
      // Second navigation immediately initiated
      const secondNav = coordinator.navigate('/work/second-project');

      const [res1, res2] = await Promise.all([firstNav, secondNav]);

      assert.strictEqual(res1.disposition, NAVIGATION_DISPOSITION.CANCELLED);
      assert.strictEqual(res2.disposition, NAVIGATION_DISPOSITION.COMPLETED);
      assert.strictEqual(res2.targetUrl, '/work/second-project');
    });

    it('rejects supersession when active operation is post-boundary', async () => {
      let resolveMount;
      const mountPromise = new Promise((resolve) => { resolveMount = resolve; });

      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work',
        onMountRoute: async () => {
          await mountPromise;
        }
      });

      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const firstNav = coordinator.navigate('/work/solitude-sound');
      await new Promise((r) => setTimeout(r, 10));

      assert.strictEqual(coordinator.getState(), NAVIGATION_STATES.COMMITTING);

      // Second navigation attempted while post-boundary
      const secondNav = await coordinator.navigate('/work/another-sound');
      assert.strictEqual(secondNav.disposition, NAVIGATION_DISPOSITION.REJECTED);
      assert.strictEqual(secondNav.reason, 'busy_post_boundary');

      resolveMount();
      await firstNav;
    });

    it('completed operation retires cleanly to IDLE allowing subsequent navigation', async () => {
      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work'
      });
      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const res1 = await coordinator.navigate('/work/solitude-sound');
      assert.strictEqual(res1.disposition, NAVIGATION_DISPOSITION.COMPLETED);
      assert.strictEqual(coordinator.getState(), NAVIGATION_STATES.IDLE);
      assert.strictEqual(coordinator.isBusy(), false);

      const res2 = await coordinator.navigate('/work');
      assert.strictEqual(res2.disposition, NAVIGATION_DISPOSITION.COMPLETED);
      assert.strictEqual(coordinator.getState(), NAVIGATION_STATES.IDLE);
      assert.strictEqual(coordinator.isBusy(), false);
    });

    it('stale asynchronous fetch resolution is safely discarded after cancellation', async () => {
      let delayedResolve;
      const delayedPromise = new Promise((resolve) => { delayedResolve = resolve; });

      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work',
        loadHtmlImpl: async () => {
          await delayedPromise;
          return {
            ok: true,
            data: { pathname: '/work/solitude-sound', route: 'project', slug: 'solitude-sound', mainHtml: '<div>delayed</div>' }
          };
        }
      });

      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const navPromise = coordinator.navigate('/work/solitude-sound');
      coordinator.cancel('manual_abort');
      const res = await navPromise;
      assert.strictEqual(res.disposition, NAVIGATION_DISPOSITION.CANCELLED);

      // Now late fetch resolves
      delayedResolve();
      await new Promise((r) => setTimeout(r, 10));

      // Coordinator must still be in IDLE, DOM swap must not occur
      assert.strictEqual(coordinator.getState(), NAVIGATION_STATES.IDLE);
      assert.strictEqual(mocks.calls.swapMainContent.length, 0);
    });

    it('cancel() returns false when called on IDLE coordinator', () => {
      const coordinator = createNavigationCoordinator();
      assert.strictEqual(coordinator.cancel('noop'), false);
    });
  });

  // =========================================================================
  // GROUP D: Fact-Based Recovery & Amendment B-03
  // =========================================================================
  describe('Group D: Fact-Based Recovery & Amendment B-03', () => {
    it('executes in-situ error recovery when DOM swap succeeded but mount failed', async () => {
      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work',
        onMountRoute: async () => {
          throw new Error('Mount lifecycle failed');
        }
      });

      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const result = await coordinator.navigate('/work/solitude-sound');

      assert.strictEqual(result.disposition, NAVIGATION_DISPOSITION.RECOVERED);
      assert.strictEqual(result.mode, 'in_situ_error');
      assert.strictEqual(mocks.calls.renderInSituError.length, 1);
      assert.strictEqual(mocks.calls.renderInSituError[0].type, 'project');
      assert.strictEqual(coordinator.getState(), NAVIGATION_STATES.IDLE);
    });

    it('escalates to native fallback when DOM swap throws (corrupt DOM state)', async () => {
      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work',
        onSwapMainContent: () => {
          throw new Error('DOM manipulation crashed');
        }
      });

      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const result = await coordinator.navigate('/work/solitude-sound');

      assert.strictEqual(result.disposition, NAVIGATION_DISPOSITION.RECOVERED);
      assert.strictEqual(result.mode, 'native_fallback');
      assert.strictEqual(mocks.calls.replaceNative.length, 1);
      assert.strictEqual(coordinator.getState(), NAVIGATION_STATES.IDLE);
    });

    it('escalates to native fallback when observation throws after post-boundary failure', async () => {
      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work',
        onMountRoute: async () => {
          throw new Error('Mount failed');
        },
        domAdapter: {
          hasExpectedLandmark: () => {
            throw new Error('Landmark query crashed');
          }
        }
      });

      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const result = await coordinator.navigate('/work/solitude-sound');

      assert.strictEqual(result.disposition, NAVIGATION_DISPOSITION.RECOVERED);
      assert.strictEqual(result.mode, 'native_fallback');
      assert.strictEqual(mocks.calls.replaceNative.length, 1);
    });

    it('recovers when readiness assessment returns TIMED_OUT (G3-D04 Option C)', async () => {
      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work/solitude-sound',
        initialPathname: '/work/solitude-sound',
        awaitReadinessImpl: async () => {
          return { status: 'timeout', outcome: 'TIMED_OUT' };
        }
      });

      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'project', type: 'project', pathname: '/work/solitude-sound', slug: 'solitude-sound' }
      });

      const result = await coordinator.navigate('/work');

      assert.strictEqual(result.disposition, NAVIGATION_DISPOSITION.RECOVERED);
      assert.strictEqual(result.mode, 'in_situ_error');
      assert.strictEqual(mocks.calls.renderInSituError.length, 1);
      assert.strictEqual(mocks.calls.renderInSituError[0].type, 'work');
    });

    it('AMENDMENT B-03: Native fallback failure must be explicitly unrecoverable', async () => {
      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work',
        onSwapMainContent: () => {
          throw new Error('DOM crashed');
        },
        onReplaceNative: () => {
          throw new Error('window.location.replace threw security error');
        }
      });

      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const result = await coordinator.navigate('/work/solitude-sound');

      // Verify Amendment B-03 requirements:
      assert.strictEqual(result.disposition, NAVIGATION_DISPOSITION.UNRECOVERABLE_FAILURE);
      assert.strictEqual(result.fallbackRequested, true);
      assert.strictEqual(result.fallbackDispatched, true);
      assert.strictEqual(result.fallbackFailed, true);
      assert.strictEqual(result.error.message, 'window.location.replace threw security error');
      // Emergency veil dismissal
      assert.strictEqual(mocks.calls.dismissVeil.length >= 1, true);
      // Coordinator latch is set
      assert.strictEqual(coordinator.hasDispatchedNativeFallback(), true);
      // State settled to IDLE
      assert.strictEqual(coordinator.getState(), NAVIGATION_STATES.IDLE);
    });

    it('AMENDMENT B-03: Prevents recursive reload or fallback loops after failure latch is set', async () => {
      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work',
        onSwapMainContent: () => {
          throw new Error('DOM crashed');
        },
        onReplaceNative: () => {
          throw new Error('Native replace failed');
        }
      });

      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      // First run: fallback throws and latch is set
      const firstResult = await coordinator.navigate('/work/solitude-sound');
      assert.strictEqual(firstResult.disposition, NAVIGATION_DISPOSITION.UNRECOVERABLE_FAILURE);
      assert.strictEqual(mocks.calls.replaceNative.length, 1);

      // Attempt second navigation: latch blocks recursive fallback execution
      const secondResult = await coordinator.navigate('/work/solitude-sound');
      // Must not dispatch native replacement a second time!
      assert.strictEqual(mocks.calls.replaceNative.length, 1);
      assert.strictEqual(coordinator.hasDispatchedNativeFallback(), true);
    });

    it('AMENDMENT B-03: Handles rejected promises in native fallback adapter deterministically', async () => {
      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work',
        onSwapMainContent: () => {
          throw new Error('DOM crashed');
        },
        onReplaceNative: async () => {
          return Promise.reject(new Error('Async native replace rejected'));
        }
      });

      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const result = await coordinator.navigate('/work/solitude-sound');
      assert.strictEqual(result.disposition, NAVIGATION_DISPOSITION.UNRECOVERABLE_FAILURE);
      assert.strictEqual(result.fallbackFailed, true);
      assert.strictEqual(result.error.message, 'Async native replace rejected');
    });

    it('recovers when reveal phase (dismissVeil) throws post-boundary', async () => {
      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work',
        transitionVeilAdapter: {
          showVeil: async () => {},
          dismissVeil: async () => {
            throw new Error('Veil dismiss transition crashed');
          },
          isVeilVisible: () => true
        }
      });

      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const result = await coordinator.navigate('/work/solitude-sound');
      assert.strictEqual(result.disposition, NAVIGATION_DISPOSITION.RECOVERED);
      assert.strictEqual(result.mode, 'in_situ_error');
    });

    it('recovers when readiness assessment returns RECOVERABLE_ERROR', async () => {
      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work',
        awaitReadinessImpl: async () => {
          return { status: 'error', outcome: 'RECOVERABLE_ERROR' };
        }
      });

      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const result = await coordinator.navigate('/work/solitude-sound');
      assert.strictEqual(result.disposition, NAVIGATION_DISPOSITION.RECOVERED);
      assert.strictEqual(result.mode, 'in_situ_error');
    });

    it('unrecoverable failure preserves cause error and diagnostic details', async () => {
      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work',
        onSwapMainContent: () => {
          throw new Error('Initial critical swap failure');
        },
        onReplaceNative: () => {
          throw new Error('Secondary native replacement failure');
        }
      });

      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const result = await coordinator.navigate('/work/solitude-sound');
      assert.strictEqual(result.disposition, NAVIGATION_DISPOSITION.UNRECOVERABLE_FAILURE);
      assert.strictEqual(result.error.message, 'Secondary native replacement failure');
      assert.strictEqual(result.cause.message, 'Initial critical swap failure');
    });
  });

  // =========================================================================
  // GROUP E: History, Popstate & Amendments B-01 / B-02
  // =========================================================================
  describe('Group E: History, Popstate & Amendments B-01 / B-02', () => {
    it('calls pushRoute exactly once for forward link navigation', async () => {
      let pushCount = 0;
      let pushedUrl = null;

      const mockHistory = {
        pushState: (_state, _title, url) => {
          pushCount++;
          pushedUrl = url;
        },
        replaceState: () => {},
        state: null
      };

      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work'
      });

      const coordinator = createNavigationCoordinator({
        ...mocks,
        historyManager: undefined, // Let coordinator create historyManager with mock history
        options: {},
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      // Or test with real HistoryManager instance with injected history
      const { createHistoryManager } = await import('../public/js/features/navigation/history-manager.js');
      const histMgr = createHistoryManager({
        history: mockHistory,
        location: { href: 'http://localhost:3005/work' },
        scrollTo: () => {}
      });

      const coordinatorWithHistory = createNavigationCoordinator({
        ...mocks,
        historyManager: histMgr,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const res = await coordinatorWithHistory.navigate('/work/solitude-sound');
      assert.strictEqual(res.disposition, NAVIGATION_DISPOSITION.COMPLETED);
      assert.strictEqual(pushCount, 1);
      assert.strictEqual(pushedUrl, '/work/solitude-sound');
    });

    it('popstate navigation NEVER calls pushRoute (zero duplicate pushState calls)', async () => {
      let pushCount = 0;
      const mockHistory = {
        pushState: () => { pushCount++; },
        replaceState: () => {},
        state: { mondoHybrid: true, routeId: 'project', slug: 'solitude-sound', scrollX: 10, scrollY: 150 }
      };

      const { createHistoryManager } = await import('../public/js/features/navigation/history-manager.js');
      const histMgr = createHistoryManager({
        history: mockHistory,
        location: { href: 'http://localhost:3005/work/solitude-sound' },
        scrollTo: () => {}
      });

      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work/solitude-sound',
        initialPathname: '/work/solitude-sound'
      });

      const coordinator = createNavigationCoordinator({
        ...mocks,
        historyManager: histMgr,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const res = await coordinator.handlePopstate({
        targetUrl: '/work/solitude-sound',
        state: mockHistory.state
      });

      assert.strictEqual(res.disposition, NAVIGATION_DISPOSITION.COMPLETED);
      assert.strictEqual(pushCount, 0, 'Popstate must never trigger pushState');
    });

    it('popstate restores saved scroll coordinates (scrollX, scrollY) for managed entries', async () => {
      let restoredCoords = null;
      const { createHistoryManager } = await import('../public/js/features/navigation/history-manager.js');
      const histMgr = createHistoryManager({
        history: { pushState: () => {}, replaceState: () => {}, state: null },
        location: { href: 'http://localhost:3005/work' },
        scrollTo: (x, y) => { restoredCoords = { x, y }; }
      });

      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work'
      });

      const coordinator = createNavigationCoordinator({
        ...mocks,
        historyManager: histMgr,
        initialRoute: { id: 'project', type: 'project', pathname: '/work/solitude-sound', slug: 'solitude-sound' }
      });

      const managedState = {
        mondoHybrid: true,
        routeId: 'work',
        slug: null,
        scrollX: 45,
        scrollY: 620
      };

      await coordinator.handlePopstate({
        targetUrl: '/work',
        state: managedState
      });

      assert.deepStrictEqual(restoredCoords, { x: 45, y: 620 });
    });

    it('queues popstate traversal when an irreversible operation is active', async () => {
      let resolveMount;
      const mountPromise = new Promise((resolve) => { resolveMount = resolve; });

      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work',
        onMountRoute: async () => {
          await mountPromise;
        }
      });

      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const navPromise = coordinator.navigate('/work/solitude-sound');
      await new Promise((r) => setTimeout(r, 10));

      assert.strictEqual(coordinator.getState(), NAVIGATION_STATES.COMMITTING);

      // Traversal arrives while COMMITTING
      const popResult = await coordinator.handlePopstate({
        targetUrl: '/work',
        state: null
      });

      assert.strictEqual(popResult.disposition, 'queued');
      assert.strictEqual(coordinator.hasPendingTraversal(), true);

      // Complete original operation
      resolveMount();
      await navPromise;

      // Traversal should have drained after settlement
      assert.strictEqual(coordinator.hasPendingTraversal(), false);
      assert.strictEqual(coordinator.getState(), NAVIGATION_STATES.IDLE);
    });

    it('AMENDMENT B-01: Queued traversal must NEVER execute while state is RECOVERING', async () => {
      let resolveRecovery;
      const recoveryPromise = new Promise((resolve) => { resolveRecovery = resolve; });

      let startOpCallCount = 0;
      let stateManagerRef = null;

      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work',
        onSwapMainContent: () => {
          throw new Error('DOM failed');
        },
        onReplaceNative: async () => {
          // Pause while in RECOVERING state!
          assert.strictEqual(stateManagerRef.getState(), NAVIGATION_STATES.RECOVERING);
          await recoveryPromise;
        }
      });

      const { createNavigationStateManager } = await import('../public/js/features/navigation/navigation-state.js');
      stateManagerRef = createNavigationStateManager();
      const originalStartOp = stateManagerRef.startOperation;
      stateManagerRef.startOperation = function(meta) {
        startOpCallCount++;
        // AMENDMENT B-01 ASSERTION: startOperation must never be called while active state is RECOVERING!
        assert.notStrictEqual(stateManagerRef.getState(), NAVIGATION_STATES.RECOVERING,
          'VIOLATION: startOperation was called while active state is RECOVERING');
        return originalStartOp(meta);
      };

      const coordinator = createNavigationCoordinator({
        ...mocks,
        stateManager: stateManagerRef,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      // Start navigation that will fail and enter RECOVERING
      const navPromise = coordinator.navigate('/work/solitude-sound');
      await new Promise((r) => setTimeout(r, 10));

      // Popstate arrives while in RECOVERING (or post-boundary before settlement)
      const popResult = await coordinator.handlePopstate({
        targetUrl: '/work',
        state: null
      });

      assert.strictEqual(popResult.disposition, 'queued');
      assert.strictEqual(coordinator.hasPendingTraversal(), true);

      // Verify that while RECOVERING is still active, startOperation was not called for the popstate
      assert.strictEqual(startOpCallCount, 1);

      // Now release recovery
      resolveRecovery();
      await navPromise;

      // After settlement, queue is processed or settled
      assert.strictEqual(coordinator.getState(), NAVIGATION_STATES.IDLE);
    });

    it('AMENDMENT B-02: Zero calls to phantom history manager methods (getCurrentUrl / getCurrentState)', async () => {
      const { createHistoryManager } = await import('../public/js/features/navigation/history-manager.js');
      const histMgr = createHistoryManager({
        history: { pushState: () => {}, replaceState: () => {}, state: null },
        location: { href: 'http://localhost:3005/work' }
      });

      // Prove that HistoryManager does NOT have phantom methods
      assert.strictEqual(histMgr.getCurrentUrl, undefined);
      assert.strictEqual(histMgr.getCurrentState, undefined);

      // Pass this real HistoryManager to coordinator: it must execute cleanly without calling them
      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work'
      });

      const coordinator = createNavigationCoordinator({
        ...mocks,
        historyManager: histMgr,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const res = await coordinator.navigate('/work/solitude-sound');
      assert.strictEqual(res.disposition, NAVIGATION_DISPOSITION.COMPLETED);
    });

    it('popstate with unmanaged history state applies PRESERVE_NATIVE scroll policy', async () => {
      let appliedPolicy = null;
      const { createHistoryManager } = await import('../public/js/features/navigation/history-manager.js');
      const histMgr = createHistoryManager({
        history: { pushState: () => {}, replaceState: () => {}, state: null },
        location: { href: 'http://localhost:3005/work' },
        scrollTo: () => {}
      });
      const originalApplyScroll = histMgr.applyScrollPolicy;
      histMgr.applyScrollPolicy = (policy, coords) => {
        appliedPolicy = policy;
        return originalApplyScroll(policy, coords);
      };

      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work'
      });

      const coordinator = createNavigationCoordinator({
        ...mocks,
        historyManager: histMgr,
        initialRoute: { id: 'project', type: 'project', pathname: '/work/solitude-sound', slug: 'solitude-sound' }
      });

      // Unmanaged state (null or missing mondoHybrid flag)
      await coordinator.handlePopstate({
        targetUrl: '/work',
        state: { someOtherFrameworkState: 123 }
      });

      assert.strictEqual(appliedPolicy, SCROLL_POLICY.PRESERVE_NATIVE);
    });

    it('queued traversal drains cleanly after in-situ error recovery settles to IDLE', async () => {
      let resolveMount;
      const mountPromise = new Promise((resolve) => { resolveMount = resolve; });

      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work',
        onMountRoute: async () => {
          await mountPromise;
          throw new Error('Mount exploded');
        }
      });

      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const navPromise = coordinator.navigate('/work/solitude-sound');
      await new Promise((r) => setTimeout(r, 10));

      assert.strictEqual(coordinator.getState(), NAVIGATION_STATES.COMMITTING);

      // Traversal queued during post-boundary
      const popRes = await coordinator.handlePopstate({ targetUrl: '/work' });
      assert.strictEqual(popRes.disposition, 'queued');

      // Release mount so it throws and in-situ error recovery runs
      resolveMount();
      const firstRes = await navPromise;
      assert.strictEqual(firstRes.disposition, NAVIGATION_DISPOSITION.RECOVERED);

      // Verify that after recovery settled to IDLE, queued traversal executed
      assert.strictEqual(coordinator.hasPendingTraversal(), false);
      assert.strictEqual(coordinator.getState(), NAVIGATION_STATES.IDLE);
    });

    it('popstate to non-pilot URL returns INELIGIBLE_NATIVE_FALLBACK', async () => {
      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work'
      });
      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const popRes = await coordinator.handlePopstate({ targetUrl: '/about' });
      assert.strictEqual(popRes.disposition, NAVIGATION_DISPOSITION.INELIGIBLE_NATIVE_FALLBACK);
    });
  });

  // =========================================================================
  // GROUP F: Safe Teardown & Lifecycle Integration
  // =========================================================================
  describe('Group F: Safe Teardown & Lifecycle Integration', () => {
    it('destroy() while IDLE finalizes coordinator immediately', () => {
      const coordinator = createNavigationCoordinator();
      assert.strictEqual(coordinator.getTeardownStatus(), TEARDOWN_LIFECYCLE.ACTIVE);

      const ok = coordinator.destroy();
      assert.strictEqual(ok, true);
      assert.strictEqual(coordinator.getTeardownStatus(), TEARDOWN_LIFECYCLE.FINALIZED);
      assert.strictEqual(coordinator.getState(), NAVIGATION_STATES.IDLE);
    });

    it('destroy() during FETCHING cancels active operation and finalizes immediately', async () => {
      let resolveFetch;
      const fetchPromise = new Promise((resolve) => { resolveFetch = resolve; });

      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work',
        loadHtmlImpl: async (_url, { signal }) => {
          return new Promise((resolve, reject) => {
            if (signal) {
              signal.addEventListener('abort', () => reject(new Error('Destroy aborted')));
            }
            fetchPromise.then(resolve);
          });
        }
      });

      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const navPromise = coordinator.navigate('/work/solitude-sound');
      assert.strictEqual(coordinator.isBusy(), true);

      coordinator.destroy();

      assert.strictEqual(coordinator.getTeardownStatus(), TEARDOWN_LIFECYCLE.FINALIZED);
      const res = await navPromise;
      assert.strictEqual(res.disposition, NAVIGATION_DISPOSITION.CANCELLED);
      assert.strictEqual(mocks.calls.dismissVeil.length >= 1, true);
    });

    it('destroy() during COMMITTING defers finalization until transaction completes (R2-02)', async () => {
      let resolveMount;
      const mountPromise = new Promise((resolve) => { resolveMount = resolve; });

      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work',
        onMountRoute: async () => {
          await mountPromise;
        }
      });

      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const navPromise = coordinator.navigate('/work/solitude-sound');
      await new Promise((r) => setTimeout(r, 10));

      assert.strictEqual(coordinator.getState(), NAVIGATION_STATES.COMMITTING);

      // Call destroy while post-boundary
      const destroyResult = coordinator.destroy();
      assert.strictEqual(destroyResult, true);
      assert.strictEqual(coordinator.getTeardownStatus(), TEARDOWN_LIFECYCLE.PENDING_DEFERRED);

      // Operation continues to completion without being killed midway
      resolveMount();
      const res = await navPromise;
      assert.strictEqual(res.disposition, NAVIGATION_DISPOSITION.COMPLETED);

      // Once settled, finalization completes
      assert.strictEqual(coordinator.getTeardownStatus(), TEARDOWN_LIFECYCLE.FINALIZED);
      assert.strictEqual(coordinator.getState(), NAVIGATION_STATES.IDLE);
    });

    it('navigation attempts after destroy are strictly rejected', async () => {
      const coordinator = createNavigationCoordinator();
      coordinator.destroy();

      const res = await coordinator.navigate('/work/solitude-sound');
      assert.strictEqual(res.disposition, NAVIGATION_DISPOSITION.REJECTED);
      assert.strictEqual(res.reason, 'coordinator_destroyed');

      const popRes = await coordinator.handlePopstate({ targetUrl: '/work/solitude-sound' });
      assert.strictEqual(popRes.disposition, NAVIGATION_DISPOSITION.REJECTED);
      assert.strictEqual(popRes.reason, 'coordinator_destroyed');
    });

    it('destroy() during AWAITING_READINESS defers finalization until transaction completes', async () => {
      let resolveReadiness;
      const readyPromise = new Promise((resolve) => { resolveReadiness = resolve; });

      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work',
        awaitReadinessImpl: async () => {
          await readyPromise;
          return { status: 'ready', outcome: 'CRITICAL_MEDIA_READY' };
        }
      });

      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const navPromise = coordinator.navigate('/work/solitude-sound');
      await new Promise((r) => setTimeout(r, 10));

      assert.strictEqual(coordinator.getState(), NAVIGATION_STATES.AWAITING_READINESS);
      coordinator.destroy();
      assert.strictEqual(coordinator.getTeardownStatus(), TEARDOWN_LIFECYCLE.PENDING_DEFERRED);

      resolveReadiness();
      const res = await navPromise;
      assert.strictEqual(res.disposition, NAVIGATION_DISPOSITION.COMPLETED);
      assert.strictEqual(coordinator.getTeardownStatus(), TEARDOWN_LIFECYCLE.FINALIZED);
    });

    it('destroy() during REVEALING defers finalization until veil is dismissed', async () => {
      let resolveDismiss;
      const dismissPromise = new Promise((resolve) => { resolveDismiss = resolve; });

      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work',
        transitionVeilAdapter: {
          showVeil: async () => {},
          dismissVeil: async () => {
            await dismissPromise;
          },
          isVeilVisible: () => true
        }
      });

      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const navPromise = coordinator.navigate('/work/solitude-sound');
      await new Promise((r) => setTimeout(r, 10));

      assert.strictEqual(coordinator.getState(), NAVIGATION_STATES.REVEALING);
      coordinator.destroy();
      assert.strictEqual(coordinator.getTeardownStatus(), TEARDOWN_LIFECYCLE.PENDING_DEFERRED);

      resolveDismiss();
      const res = await navPromise;
      assert.strictEqual(res.disposition, NAVIGATION_DISPOSITION.COMPLETED);
      assert.strictEqual(coordinator.getTeardownStatus(), TEARDOWN_LIFECYCLE.FINALIZED);
    });

    it('destroy() during RECOVERING defers finalization until recovery settles to IDLE', async () => {
      let resolveReplace;
      const replacePromise = new Promise((resolve) => { resolveReplace = resolve; });

      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work',
        onSwapMainContent: () => {
          throw new Error('DOM failed');
        },
        onReplaceNative: async () => {
          await replacePromise;
        }
      });

      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const navPromise = coordinator.navigate('/work/solitude-sound');
      await new Promise((r) => setTimeout(r, 10));

      assert.strictEqual(coordinator.getState(), NAVIGATION_STATES.RECOVERING);
      coordinator.destroy();
      assert.strictEqual(coordinator.getTeardownStatus(), TEARDOWN_LIFECYCLE.PENDING_DEFERRED);

      resolveReplace();
      const res = await navPromise;
      assert.strictEqual(res.disposition, NAVIGATION_DISPOSITION.RECOVERED);
      assert.strictEqual(coordinator.getTeardownStatus(), TEARDOWN_LIFECYCLE.FINALIZED);
    });

    it('destroy() is completely idempotent when called repeatedly', () => {
      const coordinator = createNavigationCoordinator();
      assert.strictEqual(coordinator.destroy(), true);
      assert.strictEqual(coordinator.destroy(), true);
      assert.strictEqual(coordinator.destroy(), true);
      assert.strictEqual(coordinator.getTeardownStatus(), TEARDOWN_LIFECYCLE.FINALIZED);
    });
  });

  // =========================================================================
  // GROUP G: Amendment C-01 Fail-Closed Outbound Protective Veil
  // =========================================================================
  describe('Group G: Amendment C-01 Fail-Closed Outbound Protective Veil', () => {
    it('rejects navigation and executes pre-commit failure when showVeil rejects with an error', async () => {
      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work',
        transitionVeilAdapter: {
          showVeil: async () => {
            throw new Error('VEIL_OPACITY_UNVERIFIED');
          },
          dismissVeil: async () => {},
          isVeilVisible: () => false
        }
      });

      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const result = await coordinator.navigate('/work/solitude-sound');
      assert.strictEqual(result.disposition, NAVIGATION_DISPOSITION.REJECTED);
      assert.strictEqual(result.reason, 'VEIL_OPACITY_UNVERIFIED');
      assert.strictEqual(coordinator.getState(), NAVIGATION_STATES.IDLE);
    });

    it('rejects navigation and executes pre-commit failure when isVeilVisible() returns false after showVeil', async () => {
      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work',
        transitionVeilAdapter: {
          showVeil: async () => {}, // resolves without throwing
          dismissVeil: async () => {},
          isVeilVisible: () => false // but reports invisible
        }
      });

      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const result = await coordinator.navigate('/work/solitude-sound');
      assert.strictEqual(result.disposition, NAVIGATION_DISPOSITION.REJECTED);
      assert.strictEqual(result.reason, 'veil_not_visible');
      assert.strictEqual(coordinator.getState(), NAVIGATION_STATES.IDLE);
    });

    it('fails closed when transitionVeilAdapter is completely omitted (default inert adapter)', async () => {
      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work'
      });

      // Explicitly pass undefined transitionVeilAdapter to test default inert adapter
      const coordinator = createNavigationCoordinator({
        locationAdapter: mocks.locationAdapter,
        historyStateAdapter: mocks.historyStateAdapter,
        loaderAdapter: mocks.loaderAdapter,
        domAdapter: mocks.domAdapter,
        lifecycleAdapter: mocks.lifecycleAdapter,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const result = await coordinator.navigate('/work/solitude-sound');
      assert.strictEqual(result.disposition, NAVIGATION_DISPOSITION.REJECTED);
      assert.strictEqual(result.reason, 'veil_not_visible');
      assert.strictEqual(coordinator.getState(), NAVIGATION_STATES.IDLE);
    });

    it('guarantees zero unmounts, zero DOM swaps, and zero History URL commits on veil failure', async () => {
      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work',
        transitionVeilAdapter: {
          showVeil: async () => {
            throw new Error('VEIL_ANIMATION_STALLED');
          },
          dismissVeil: async () => {},
          isVeilVisible: () => false
        }
      });

      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const result = await coordinator.navigate('/work/solitude-sound');
      assert.strictEqual(result.disposition, NAVIGATION_DISPOSITION.REJECTED);

      // Verify strict point-of-no-return protection: zero mutations occurred
      assert.strictEqual(mocks.calls.unmountRoute.length, 0, 'Must NOT unmount outgoing route');
      assert.strictEqual(mocks.calls.swapMainContent.length, 0, 'Must NOT swap DOM');
      assert.strictEqual(mocks.calls.mountRoute.length, 0, 'Must NOT mount destination route');
      assert.strictEqual(mocks.locationAdapter.getPathname(), '/work', 'URL must remain untouched');
    });

    it('forwards the active operation AbortSignal to transitionVeilAdapter.showVeil', async () => {
      let receivedSignal = null;
      const mocks = createMockAdapters({
        initialHref: 'http://localhost:3005/work',
        initialPathname: '/work',
        transitionVeilAdapter: {
          showVeil: async (meta) => {
            receivedSignal = meta.signal;
          },
          dismissVeil: async () => {},
          isVeilVisible: () => true
        }
      });

      const coordinator = createNavigationCoordinator({
        ...mocks,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      await coordinator.navigate('/work/solitude-sound');
      assert.ok(receivedSignal !== null, 'Signal must be forwarded to showVeil');
      assert.strictEqual(typeof receivedSignal.addEventListener, 'function');
    });
  });

});
