/**
 * Stage G3.3-C: Coordinator Binding & Route Lifecycle Integration Tests
 * Verifies pure runtime dormancy, Work/Project route lifecycle contracts,
 * route-specific deadline enforcement, synchronous Project readiness event capture,
 * fail-closed veil occlusion integration, and end-to-end simulated navigation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { createBoundCoordinator } from '../public/js/features/navigation/coordinator-binding.js';
import { createRouteLifecycleAdapter } from '../public/js/features/navigation/lifecycle-adapter.js';
import { createQuietMarkAdapter } from '../public/js/features/transitions/quiet-mark-adapter.js';
import {
  NAVIGATION_STATES
} from '../public/js/features/navigation/navigation-state.js';
import {
  NAVIGATION_DISPOSITION,
  TRANSACTION_PROGRESS
} from '../public/js/features/navigation/navigation-coordinator.js';

/**
 * Creates an in-memory mock DOM environment for bound coordinator integration testing.
 */
function createMockBindingDom(initialRoute = '/work') {
  const elements = new Map();
  const listeners = new Map();

  class MockElement {
    constructor(tagName, id = '') {
      this.tagName = tagName.toUpperCase();
      this.id = id;
      this.className = '';
      this.classList = {
        classes: new Set(),
        add: (...cls) => cls.forEach((c) => this.classList.classes.add(c)),
        remove: (...cls) => cls.forEach((c) => this.classList.classes.delete(c)),
        contains: (c) => this.classList.classes.has(c)
      };
      this.style = {
        opacity: '0',
        display: '',
        visibility: '',
        transition: ''
      };
      this.attributes = new Map();
      this.children = [];
      this.parentNode = null;
      this.offsetHeight = 100;
      this.innerHTML = '';
      this.inert = false;
    }

    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    getAttribute(k) { return this.attributes.get(k) || null; }
    hasAttribute(k) { return this.attributes.has(k); }
    removeAttribute(k) { this.attributes.delete(k); }

    appendChild(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      this.children.push(child);
      if (child.id) elements.set(child.id, child);
      return child;
    }

    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) {
        this.children.splice(idx, 1);
        child.parentNode = null;
        if (child.id) elements.delete(child.id);
      }
      return child;
    }

    contains(node) {
      if (!node) return false;
      let curr = node;
      while (curr) {
        if (curr === this) return true;
        curr = curr.parentNode;
      }
      return false;
    }

    querySelector(selector) {
      if (selector === 'main#main' || selector === '#main') return elements.get('main') || null;
      if (selector.startsWith('#')) return elements.get(selector.slice(1)) || null;
      return null;
    }

    querySelectorAll(selector) {
      return [];
    }

    focus() {
      mockDoc.activeElement = this;
    }
  }

  const mockBody = new MockElement('body');
  const mainEl = new MockElement('main', 'main');
  mockBody.appendChild(mainEl);

  const mockDoc = {
    body: mockBody,
    activeElement: null,
    title: 'MONDO Creative Studio',
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => new MockElement(tag),
    querySelector: (sel) => {
      if (sel === 'main#main' || sel === '#main') return mainEl;
      if (sel.startsWith('#')) return elements.get(sel.slice(1)) || null;
      return null;
    },
    addEventListener: (type, fn) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener: (type, fn) => {
      if (listeners.has(type)) listeners.get(type).delete(fn);
    }
  };

  const windowListeners = new Map();
  let currentHref = `http://localhost:3005${initialRoute}`;
  let currentPathname = initialRoute;
  let currentState = null;

  const mockWin = {
    performance: { now: () => Date.now() },
    location: {
      get href() { return currentHref; },
      set href(v) {
        currentHref = v;
        try { currentPathname = new URL(v).pathname; } catch (_) { currentPathname = v; }
      },
      get pathname() { return currentPathname; },
      get origin() { return 'http://localhost:3005'; }
    },
    history: {
      get state() { return currentState; },
      pushState: (st, _title, url) => {
        currentState = st;
        if (url) currentPathname = url;
      },
      replaceState: (st, _title, url) => {
        currentState = st;
        if (url) currentPathname = url;
      }
    },
    getComputedStyle: (el) => ({
      display: el.style.display || 'block',
      visibility: el.style.visibility || 'visible',
      opacity: el.style.opacity !== undefined ? el.style.opacity : '1'
    }),
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: (cb) => setTimeout(cb, 5),
    cancelAnimationFrame: (id) => clearTimeout(id),
    addEventListener: (type, fn) => {
      if (!windowListeners.has(type)) windowListeners.set(type, new Set());
      windowListeners.get(type).add(fn);
    },
    removeEventListener: (type, fn) => {
      if (windowListeners.has(type)) windowListeners.get(type).delete(fn);
    },
    dispatchEvent: (evt) => {
      const type = evt.type;
      if (windowListeners.has(type)) {
        for (const fn of windowListeners.get(type)) {
          try { fn(evt); } catch (_) {}
        }
      }
      return true;
    }
  };

  return { mockDoc, mockWin, mainEl, elements, listeners, windowListeners };
}

describe('Stage G3.3-C: Coordinator Binding & Lifecycle Integration Tests', () => {

  // =========================================================================
  // Group A: Pure Runtime Dormancy & Factory Contracts
  // =========================================================================
  describe('Group A: Pure Runtime Dormancy & Factory Contracts', () => {
    it('creates bound coordinator with ZERO window or document event listeners registered', () => {
      const { mockDoc, mockWin, listeners, windowListeners } = createMockBindingDom();

      const bound = createBoundCoordinator({
        document: mockDoc,
        window: mockWin
      });

      assert.strictEqual(bound.getState(), NAVIGATION_STATES.IDLE);
      assert.strictEqual(bound.getProgress(), TRANSACTION_PROGRESS.IDLE);
      assert.strictEqual(bound.isBusy(), false);

      // Verify ZERO event listeners registered at document or window
      assert.strictEqual(listeners.size, 0, 'Document must have 0 event listeners');
      assert.strictEqual(windowListeners.size, 0, 'Window must have 0 event listeners');

      // Verify pure instance references
      assert.ok(bound.coordinator !== undefined);
      assert.ok(bound.quietMarkAdapter !== undefined);
      assert.ok(bound.lifecycleAdapter !== undefined);
    });
  });

  // =========================================================================
  // Group B: Work Portfolio Lifecycle & Route-Specific Deadlines
  // =========================================================================
  describe('Group B: Work Portfolio Lifecycle & Route-Specific Deadlines', () => {
    it('mounts and unmounts Work Portfolio page cleanly', async () => {
      const { mockDoc, mockWin } = createMockBindingDom();
      let mountCalled = false;
      let unmountCalled = false;

      const adapter = createRouteLifecycleAdapter({
        document: mockDoc,
        window: mockWin,
        workLifecycle: {
          mount: async () => { mountCalled = true; },
          unmount: () => { unmountCalled = true; }
        }
      });

      await adapter.mountRoute({ type: 'work', pathname: '/work' });
      assert.strictEqual(mountCalled, true);

      await adapter.unmountRoute({ type: 'work', pathname: '/work' });
      assert.strictEqual(unmountCalled, true);
    });

    it('enforces 2500ms Work readiness ceiling regardless of coordinator 5000ms envelope', async () => {
      const { mockDoc, mockWin } = createMockBindingDom();
      let passedSafetyTimeout = null;

      const adapter = createRouteLifecycleAdapter({
        document: mockDoc,
        window: mockWin,
        workReadiness: {
          awaitWorkFirstViewReady: async ({ safetyTimeoutMs }) => {
            passedSafetyTimeout = safetyTimeoutMs;
            return { outcome: 'CRITICAL_MEDIA_READY' };
          }
        }
      });

      // Coordinator passes its global 5000ms envelope
      await adapter.awaitReadiness({ type: 'work' }, { timeoutMs: 5000 });

      // Adapter must enforce inner route ceiling: 2500ms
      assert.strictEqual(passedSafetyTimeout, 2500, 'Must enforce 2500ms route deadline');
    });

    it('preserves TIMED_OUT outcome integrity: TIMED_OUT is never transformed into ready', async () => {
      const { mockDoc, mockWin } = createMockBindingDom();

      const adapter = createRouteLifecycleAdapter({
        document: mockDoc,
        window: mockWin,
        workReadiness: {
          awaitWorkFirstViewReady: async () => {
            return { outcome: 'TIMED_OUT' };
          }
        }
      });

      const res = await adapter.awaitReadiness({ type: 'work' });
      assert.strictEqual(res.status, 'timeout');
      assert.strictEqual(res.outcome, 'TIMED_OUT');
    });
  });

  // =========================================================================
  // Group C: Project Detail Lifecycle & Synchronous Event Pre-Subscription
  // =========================================================================
  describe('Group C: Project Detail Lifecycle & Synchronous Event Pre-Subscription', () => {
    it('captures synchronous mondo:project-ready event emitted during mountProject()', async () => {
      const { mockDoc, mockWin } = createMockBindingDom('/work');

      const adapter = createRouteLifecycleAdapter({
        document: mockDoc,
        window: mockWin,
        projectLifecycle: {
          mount: async ({ operationId }) => {
            // Emit mondo:project-ready synchronously during mount
            mockWin.dispatchEvent({
              type: 'mondo:project-ready',
              detail: { operationId, slug: 'aurora' }
            });
            return { isReady: () => true };
          },
          unmount: () => {}
        }
      });

      // Mount project
      await adapter.mountRoute({ type: 'project', pathname: '/work/aurora', slug: 'aurora' }, { operationId: 42 });

      // Await readiness: must resolve immediately via pre-subscribed synchronous capture
      const startTime = Date.now();
      const res = await adapter.awaitReadiness({ type: 'project', pathname: '/work/aurora' }, { timeoutMs: 3500 });
      const elapsed = Date.now() - startTime;

      assert.strictEqual(res.status, 'ready');
      assert.strictEqual(res.outcome, 'CRITICAL_MEDIA_READY');
      assert.ok(elapsed < 50, 'Must resolve immediately without waiting for 3500ms ceiling');
    });

    it('rejects stale or uncorrelated mondo:project-ready events from previous operations', async () => {
      const { mockDoc, mockWin } = createMockBindingDom();

      const adapter = createRouteLifecycleAdapter({
        document: mockDoc,
        window: mockWin,
        projectLifecycle: {
          mount: async () => {
            // Emit a stale event from operation 99
            mockWin.dispatchEvent({
              type: 'mondo:project-ready',
              detail: { operationId: 99, slug: 'unrelated' }
            });
            return { isReady: () => false };
          },
          unmount: () => {}
        },
        timingConfig: { projectSafetyTimeoutMs: 50 } // Fast timeout for test
      });

      await adapter.mountRoute({ type: 'project', pathname: '/work/aurora', slug: 'aurora' }, { operationId: 100 });

      // Must NOT accept the stale event; must time out after 50ms
      const res = await adapter.awaitReadiness({ type: 'project' });
      assert.strictEqual(res.status, 'timeout');
      assert.strictEqual(res.outcome, 'TIMED_OUT');
    });

    it('enforces 3500ms Project readiness ceiling regardless of coordinator 5000ms envelope', async () => {
      const { mockDoc, mockWin } = createMockBindingDom();

      const adapter = createRouteLifecycleAdapter({
        document: mockDoc,
        window: mockWin,
        projectLifecycle: {
          mount: async () => ({ isReady: () => false }),
          unmount: () => {}
        },
        timingConfig: { projectSafetyTimeoutMs: 40 }
      });

      await adapter.mountRoute({ type: 'project', pathname: '/work/aurora', slug: 'aurora' }, { operationId: 1 });

      const startTime = Date.now();
      const res = await adapter.awaitReadiness({ type: 'project' }, { timeoutMs: 5000 });
      const elapsed = Date.now() - startTime;

      assert.strictEqual(res.status, 'timeout');
      assert.strictEqual(res.outcome, 'TIMED_OUT');
      assert.ok(elapsed < 100, 'Must time out at the inner 40ms ceiling, not 5000ms');
    });
  });

  // =========================================================================
  // Group D: End-to-End Simulated Hybrid Navigation
  // =========================================================================
  describe('Group D: End-to-End Simulated Hybrid Navigation', () => {
    it('executes full simulated navigation /work -> /work/aurora under protective veil', async () => {
      const { mockDoc, mockWin, mainEl } = createMockBindingDom('/work');

      let veilShown = false;
      let veilDismissed = false;
      let domSwapped = false;

      const quietMarkAdapter = createQuietMarkAdapter({
        document: mockDoc,
        window: mockWin,
        outboundDurationMs: 15,
        inboundDurationMs: 15
      });

      const lifecycleAdapter = createRouteLifecycleAdapter({
        document: mockDoc,
        window: mockWin,
        workLifecycle: {
          mount: async () => {},
          unmount: () => {}
        },
        projectLifecycle: {
          mount: async ({ operationId }) => {
            mockWin.dispatchEvent({
              type: 'mondo:project-ready',
              detail: { operationId, slug: 'aurora' }
            });
            return { isReady: () => true };
          },
          unmount: () => {}
        }
      });

      const loaderAdapter = {
        loadHtml: async () => ({
          ok: true,
          data: {
            title: 'Aurora — MONDO',
            mainHtml: '<section id="project-main"><h1>Aurora</h1></section>'
          }
        })
      };

      const domAdapter = {
        getRenderedPath: () => mockWin.location.pathname,
        swapMainContent: (html) => {
          // Verify that veil IS visible when DOM swap occurs!
          assert.strictEqual(quietMarkAdapter.isVeilVisible(), true, 'Veil must be visible during DOM swap');
          domSwapped = true;
          mainEl.innerHTML = html;
          return true;
        },
        updateTitle: (t) => { mockDoc.title = t; },
        hasExpectedLandmark: () => true,
        renderInSituError: () => true
      };

      const bound = createBoundCoordinator({
        document: mockDoc,
        window: mockWin,
        transitionVeilAdapter: quietMarkAdapter,
        lifecycleAdapter,
        loaderAdapter,
        domAdapter,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const result = await bound.navigate('/work/aurora');

      assert.strictEqual(result.disposition, NAVIGATION_DISPOSITION.COMPLETED);
      assert.strictEqual(domSwapped, true, 'DOM swap must have executed');
      assert.strictEqual(mockDoc.title, 'Aurora — MONDO');
      assert.strictEqual(bound.getState(), NAVIGATION_STATES.IDLE);
      // After completion, veil must be dismissed
      assert.strictEqual(quietMarkAdapter.isVeilVisible(), false);
    });

    it('executes full simulated navigation /work/aurora -> /work', async () => {
      const { mockDoc, mockWin, mainEl } = createMockBindingDom('/work/aurora');

      let domSwapped = false;
      const quietMarkAdapter = createQuietMarkAdapter({
        document: mockDoc,
        window: mockWin,
        outboundDurationMs: 15,
        inboundDurationMs: 15
      });

      const lifecycleAdapter = createRouteLifecycleAdapter({
        document: mockDoc,
        window: mockWin,
        workLifecycle: { mount: async () => {}, unmount: () => {} },
        projectLifecycle: { mount: async () => ({ isReady: () => true }), unmount: () => {} },
        workReadiness: {
          awaitWorkFirstViewReady: async () => ({ outcome: 'CRITICAL_MEDIA_READY' })
        }
      });

      const loaderAdapter = {
        loadHtml: async () => ({
          ok: true,
          data: {
            title: 'Work Portfolio — MONDO',
            mainHtml: '<div id="work-grid"></div>'
          }
        })
      };

      const domAdapter = {
        getRenderedPath: () => mockWin.location.pathname,
        swapMainContent: (html) => {
          assert.strictEqual(quietMarkAdapter.isVeilVisible(), true);
          domSwapped = true;
          mainEl.innerHTML = html;
          return true;
        },
        updateTitle: (t) => { mockDoc.title = t; },
        hasExpectedLandmark: () => true,
        renderInSituError: () => true
      };

      const bound = createBoundCoordinator({
        document: mockDoc,
        window: mockWin,
        transitionVeilAdapter: quietMarkAdapter,
        lifecycleAdapter,
        loaderAdapter,
        domAdapter,
        initialRoute: { id: 'project', type: 'project', pathname: '/work/aurora', slug: 'aurora' }
      });

      const result = await bound.navigate('/work');

      assert.strictEqual(result.disposition, NAVIGATION_DISPOSITION.COMPLETED);
      assert.strictEqual(domSwapped, true);
      assert.strictEqual(bound.getState(), NAVIGATION_STATES.IDLE);
      assert.strictEqual(quietMarkAdapter.isVeilVisible(), false);
    });
  });

  // =========================================================================
  // Group E: Fail-Closed Coordinator Abortion on Veil Failure
  // =========================================================================
  describe('Group E: Fail-Closed Coordinator Abortion on Veil Failure', () => {
    it('halts in OUTBOUND and aborts before DOM swap if veil fails to establish occlusion', async () => {
      const { mockDoc, mockWin, mainEl } = createMockBindingDom('/work');
      let domSwapAttempted = false;
      let unmountAttempted = false;

      // Faulty veil adapter that fails to establish occlusion
      const faultyVeilAdapter = {
        showVeil: async () => {
          throw new Error('VEIL_OPACITY_UNVERIFIED');
        },
        dismissVeil: async () => {},
        isVeilVisible: () => false
      };

      const lifecycleAdapter = createRouteLifecycleAdapter({
        document: mockDoc,
        window: mockWin,
        workLifecycle: {
          mount: async () => {},
          unmount: () => { unmountAttempted = true; }
        }
      });

      const domAdapter = {
        getRenderedPath: () => '/work',
        swapMainContent: () => {
          domSwapAttempted = true;
          return true;
        },
        updateTitle: () => {},
        hasExpectedLandmark: () => true,
        renderInSituError: () => true
      };

      const bound = createBoundCoordinator({
        document: mockDoc,
        window: mockWin,
        transitionVeilAdapter: faultyVeilAdapter,
        lifecycleAdapter,
        domAdapter,
        initialRoute: { id: 'work', type: 'work', pathname: '/work' }
      });

      const result = await bound.navigate('/work/aurora');

      assert.strictEqual(result.disposition, NAVIGATION_DISPOSITION.REJECTED);
      assert.strictEqual(result.reason, 'VEIL_OPACITY_UNVERIFIED');
      assert.strictEqual(unmountAttempted, false, 'Outgoing route must NOT be unmounted');
      assert.strictEqual(domSwapAttempted, false, 'DOM must NOT be swapped');
      assert.strictEqual(bound.getState(), NAVIGATION_STATES.IDLE);
    });
  });

});
