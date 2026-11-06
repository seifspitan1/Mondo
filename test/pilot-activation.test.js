/**
 * MONDO — Stage G3.3-E-G1 / G3.3-E-G2: Feature-Gated Pilot Infrastructure & Controlled Local Opt-In Test Suite
 * Verifies Mandatory Corrections E-G1-01 through E-G1-05, Gate 2 controlled local opt-in rules,
 * and all 14 verification requirements.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_HYBRID_PILOT_ENABLED,
  GATE_1_ACTIVATION_LOCK,
  PILOT_LIFECYCLE_STATES,
  isAllowedLocalPilotHost,
  createBoundCoordinator,
  isHybridPilotEnabled,
  initHybridNavigationPilot,
  disableHybridNavigationPilot
} from '../public/js/features/navigation/coordinator-binding.js';

import {
  NAVIGATION_DISPOSITION,
  TEARDOWN_LIFECYCLE
} from '../public/js/features/navigation/navigation-coordinator.js';

import {
  NAVIGATION_STATES
} from '../public/js/features/navigation/navigation-state.js';

import {
  createQuietMarkAdapter,
  OVERLAY_ID,
  LOGO_ID,
  STATUS_ID,
  AQM_STATUS_TEXT
} from '../public/js/features/transitions/quiet-mark-adapter.js';

import {
  createDomAdapter
} from '../public/js/features/navigation/dom-adapter.js';

/**
 * Builds an isolated mock browser environment (Window, Document, History, Location, DOM)
 * for deterministic testing of the Gate 1 feature-gated pilot controller.
 */
function createPilotTestEnv(options = {}) {
  const initialOrigin = options.origin || 'http://localhost:3005';
  const initialPathname = options.initialPathname || '/work';
  const initialSearch = options.initialSearch || '';
  let currentHref = `${initialOrigin}${initialPathname}${initialSearch}`;
  let currentPathname = initialPathname;
  let currentSearch = initialSearch;
  let currentState = options.initialHistoryState !== undefined ? options.initialHistoryState : null;
  let scrollX = options.initialScrollX || 0;
  let scrollY = options.initialScrollY || 0;

  const elementsById = new Map();
  const docListeners = [];
  const winListeners = [];
  const historyCalls = {
    pushState: [],
    replaceState: []
  };
  const scrollCalls = [];
  const nativeNavigationCalls = {
    navigate: [],
    replace: []
  };

  class MockElement {
    constructor(tagName, id = '') {
      this.nodeType = 1;
      this.tagName = String(tagName || 'DIV').toUpperCase();
      this.id = id || '';
      this.className = '';
      const classSet = new Set();
      this.classList = {
        add: (...tokens) => tokens.forEach((t) => t && classSet.add(t)),
        remove: (...tokens) => tokens.forEach((t) => classSet.delete(t)),
        contains: (token) => classSet.has(token),
        toArray: () => Array.from(classSet)
      };
      this.style = {
        opacity: '0',
        display: '',
        visibility: '',
        transform: '',
        transition: '',
        pointerEvents: ''
      };
      this.attributes = new Map();
      this.children = [];
      this.parentNode = null;
      this.parentElement = null;
      this.offsetHeight = 120;
      this.innerHTML = '';
      this.textContent = '';
      this.inert = false;
      if (this.id) {
        elementsById.set(this.id, this);
      }
    }

    set className(val) {
      this._className = String(val || '');
      if (this.classList) {
        this._className.split(/\s+/).filter(Boolean).forEach((c) => this.classList.add(c));
      }
    }

    get className() {
      return this._className || '';
    }

    setAttribute(name, value) {
      const strVal = String(value);
      this.attributes.set(name, strVal);
      if (name === 'id') {
        this.id = strVal;
        elementsById.set(strVal, this);
      }
    }

    getAttribute(name) {
      return this.attributes.has(name) ? this.attributes.get(name) : null;
    }

    hasAttribute(name) {
      return this.attributes.has(name);
    }

    removeAttribute(name) {
      this.attributes.delete(name);
    }

    appendChild(child) {
      if (child.parentNode && typeof child.parentNode.removeChild === 'function') {
        child.parentNode.removeChild(child);
      }
      child.parentNode = this;
      child.parentElement = this;
      this.children.push(child);
      if (child.id) {
        elementsById.set(child.id, child);
      }
      return child;
    }

    removeChild(child) {
      const idx = this.children.indexOf(child);
      if (idx !== -1) {
        this.children.splice(idx, 1);
        child.parentNode = null;
        child.parentElement = null;
      }
      return child;
    }

    contains(node) {
      let cur = node;
      while (cur) {
        if (cur === this) return true;
        cur = cur.parentElement || cur.parentNode;
      }
      return false;
    }

    focus() {
      mockDoc.activeElement = this;
    }

    querySelector(selector) {
      if (selector === `.mondo-quiet-mark__inner` || selector === '.mondo-quiet-mark-inner') {
        return this.children.find((c) => c.className.includes('mondo-quiet-mark__inner')) || null;
      }
      return null;
    }
  }

  const documentElement = new MockElement('html');
  const body = new MockElement('body');
  const mainEl = new MockElement('main', 'main');
  const mainNavEl = new MockElement('nav');
  mainNavEl.className = 'main-nav';
  const navToggleBtn = new MockElement('button');
  navToggleBtn.className = 'nav-toggle';
  navToggleBtn.setAttribute('aria-expanded', 'false');

  const workGridEl = new MockElement('div', 'work-grid');
  const projectMainEl = new MockElement('section', 'project-main');
  const projectErrorHostEl = new MockElement('div', 'project-error-host');

  body.appendChild(mainNavEl);
  body.appendChild(navToggleBtn);
  body.appendChild(mainEl);

  const mockDoc = {
    documentElement,
    body,
    head: new MockElement('head'),
    activeElement: null,
    title: 'MONDO Creative Studio',
    getElementById: (id) => elementsById.get(id) || null,
    createElement: (tag) => new MockElement(tag),
    querySelector: (selector) => {
      if (selector === 'main#main' || selector === '#main') return mainEl;
      if (selector === '.main-nav') return mainNavEl;
      if (selector === '.nav-toggle') return navToggleBtn;
      if (selector === '#work-grid' || selector === '.work-page-grid') return elementsById.get('work-grid') || workGridEl;
      if (selector === '#project-main') return elementsById.get('project-main') || projectMainEl;
      if (selector === '#project-error-host') return elementsById.get('project-error-host') || projectErrorHostEl;
      if (selector === 'main#main h1') return mainEl;
      if (selector.startsWith('#')) return elementsById.get(selector.slice(1)) || null;
      return null;
    },
    addEventListener: (type, handler, opts) => {
      const capture = Boolean(opts && (opts === true || opts.capture === true));
      docListeners.push({ type, handler, capture, opts });
    },
    removeEventListener: (type, handler, opts) => {
      const capture = Boolean(opts && (opts === true || opts.capture === true));
      const idx = docListeners.findIndex(
        (l) => l.type === type && l.handler === handler && l.capture === capture
      );
      if (idx !== -1) docListeners.splice(idx, 1);
    },
    dispatchClick: (eventInit = {}) => {
      let defaultPrevented = Boolean(eventInit.defaultPrevented);
      const event = {
        type: 'click',
        button: eventInit.button !== undefined ? eventInit.button : 0,
        metaKey: Boolean(eventInit.metaKey),
        ctrlKey: Boolean(eventInit.ctrlKey),
        shiftKey: Boolean(eventInit.shiftKey),
        altKey: Boolean(eventInit.altKey),
        target: eventInit.target || null,
        get defaultPrevented() {
          return defaultPrevented;
        },
        preventDefault() {
          defaultPrevented = true;
        }
      };

      // 1. Capture phase listeners first (in registration order)
      const captureHandlers = docListeners.filter((l) => l.type === 'click' && l.capture).map((l) => l.handler);
      for (const fn of captureHandlers) {
        fn(event);
      }

      // 2. Bubble phase listeners second (in registration order)
      const bubbleHandlers = docListeners.filter((l) => l.type === 'click' && !l.capture).map((l) => l.handler);
      for (const fn of bubbleHandlers) {
        fn(event);
      }

      return event;
    },
    dispatchKeydown: (key = 'Escape') => {
      const event = { type: 'keydown', key };
      const handlers = docListeners.filter((l) => l.type === 'keydown').map((l) => l.handler);
      for (const fn of handlers) {
        fn(event);
      }
      return event;
    }
  };

  const sessionStore = new Map(Object.entries(options.sessionStorageItems || {}));

  const mockWin = {
    performance: { now: () => Date.now() },
    get scrollX() { return scrollX; },
    get scrollY() { return scrollY; },
    setScroll(x, y) {
      scrollX = x;
      scrollY = y;
    },
    scrollTo: (xOrOpts, yVal) => {
      if (typeof xOrOpts === 'object' && xOrOpts !== null) {
        scrollX = typeof xOrOpts.left === 'number' ? xOrOpts.left : 0;
        scrollY = typeof xOrOpts.top === 'number' ? xOrOpts.top : 0;
      } else {
        scrollX = typeof xOrOpts === 'number' ? xOrOpts : 0;
        scrollY = typeof yVal === 'number' ? yVal : 0;
      }
      scrollCalls.push({ x: scrollX, y: scrollY });
    },
    location: {
      get href() { return currentHref; },
      set href(val) {
        currentHref = val;
        try {
          const u = new URL(val, 'http://localhost:3005');
          currentPathname = u.pathname;
          currentSearch = u.search;
        } catch (_) {
          currentPathname = val;
        }
      },
      get pathname() { return currentPathname; },
      set pathname(val) {
        currentPathname = val;
        currentHref = `http://localhost:3005${val}${currentSearch}`;
      },
      get search() { return currentSearch; },
      set search(val) {
        currentSearch = val;
        currentHref = `http://localhost:3005${currentPathname}${val}`;
      },
      get origin() { return initialOrigin; },
      assign: (url) => { nativeNavigationCalls.navigate.push(url); },
      replace: (url) => { nativeNavigationCalls.replace.push(url); }
    },
    history: {
      scrollRestoration: options.initialScrollRestoration || 'auto',
      get state() { return currentState; },
      pushState: (st, title, url) => {
        currentState = st;
        if (url) {
          try {
            const u = new URL(url, 'http://localhost:3005');
            currentPathname = u.pathname;
            currentSearch = u.search;
            currentHref = u.href;
          } catch (_) {
            currentPathname = url;
            currentHref = `http://localhost:3005${url}`;
          }
        }
        historyCalls.pushState.push({ state: st, title, url });
      },
      replaceState: (st, title, url) => {
        currentState = st;
        if (url) {
          try {
            const u = new URL(url, 'http://localhost:3005');
            currentPathname = u.pathname;
            currentSearch = u.search;
            currentHref = u.href;
          } catch (_) {
            currentPathname = url;
            currentHref = `http://localhost:3005${url}`;
          }
        }
        historyCalls.replaceState.push({ state: st, title, url });
      }
    },
    sessionStorage: {
      getItem: (k) => (sessionStore.has(k) ? sessionStore.get(k) : null),
      setItem: (k, v) => sessionStore.set(k, String(v)),
      removeItem: (k) => sessionStore.delete(k)
    },
    getComputedStyle: (el) => ({
      display: el.style.display || 'block',
      visibility: el.style.visibility || 'visible',
      opacity: el.style.opacity !== undefined ? el.style.opacity : '1'
    }),
    matchMedia: (query) => ({
      matches: Boolean(options.reducedMotion && query.includes('prefers-reduced-motion'))
    }),
    requestAnimationFrame: (cb) => setTimeout(cb, 2),
    cancelAnimationFrame: (id) => clearTimeout(id),
    addEventListener: (type, handler, opts) => {
      winListeners.push({ type, handler, opts });
    },
    removeEventListener: (type, handler) => {
      const idx = winListeners.findIndex((l) => l.type === type && l.handler === handler);
      if (idx !== -1) winListeners.splice(idx, 1);
    },
    dispatchEvent: (evt) => {
      const handlers = winListeners.filter((l) => l.type === evt.type).map((l) => l.handler);
      for (const fn of handlers) {
        fn(evt);
      }
      return true;
    }
  };

  function createAnchor(href, attrs = {}) {
    const a = new MockElement('a');
    if (href !== null && href !== undefined) {
      a.setAttribute('href', href);
    }
    for (const [k, v] of Object.entries(attrs)) {
      a.setAttribute(k, v);
    }
    return a;
  }

  function createFastBoundOptions(overrides = {}) {
    return {
      quietMarkOptions: {
        outboundDurationMs: 5,
        inboundDurationMs: 5,
        watchdogPaddingMs: 20,
        ...(overrides.quietMarkOptions || {})
      },
      lifecycleAdapter: overrides.lifecycleAdapter || {
        unmountRoute: async () => {},
        mountRoute: async () => {},
        awaitReadiness: async () => ({ status: 'ready', outcome: 'CRITICAL_MEDIA_READY' })
      },
      loaderAdapter: overrides.loaderAdapter || {
        loadHtml: async (url) => ({
          ok: true,
          data: {
            url: `http://localhost:3005${url}`,
            pathname: url,
            route: url.startsWith('/work/') ? 'project' : 'work',
            slug: url.startsWith('/work/') ? url.slice(6) : null,
            title: url.startsWith('/work/') ? 'Project — MONDO' : 'Work — MONDO',
            metaDescription: 'Portfolio description',
            mainHtml: url.startsWith('/work/')
              ? '<section id="project-main"><h1>Project</h1></section>'
              : '<div id="work-grid"><h1>Work</h1></div>'
          }
        })
      },
      recoveryAdapter: overrides.recoveryAdapter || {
        navigateNative: (u) => nativeNavigationCalls.navigate.push(u),
        replaceNative: (u) => nativeNavigationCalls.replace.push(u)
      },
      ...overrides
    };
  }

  return {
    mockDoc,
    mockWin,
    mainEl,
    mainNavEl,
    navToggleBtn,
    docListeners,
    winListeners,
    historyCalls,
    scrollCalls,
    nativeNavigationCalls,
    createAnchor,
    createFastBoundOptions
  };
}

describe('Stage G3.3-E-G1: Feature-Gated Pilot Infrastructure', () => {
  beforeEach(() => {
    disableHybridNavigationPilot({ reason: 'test_cleanup' });
  });

  // =========================================================================
  // 1 & 2. Disabled-by-Default Runtime Behavior & Controlled Local Opt-In
  // =========================================================================
  describe('1 & 2. Disabled-by-default runtime & Gate 2 controlled local opt-in policy', () => {
    it('exports DEFAULT_HYBRID_PILOT_ENABLED = false and GATE_1_ACTIVATION_LOCK = false', () => {
      assert.strictEqual(DEFAULT_HYBRID_PILOT_ENABLED, false);
      assert.strictEqual(GATE_1_ACTIVATION_LOCK, false);
    });

    it('returns disabled and attaches ZERO listeners when initHybridNavigationPilot() is called in default runtime without opt-in', () => {
      const env = createPilotTestEnv({ initialPathname: '/work' });

      assert.strictEqual(isHybridPilotEnabled({ window: env.mockWin }), false);

      const result = initHybridNavigationPilot({
        document: env.mockDoc,
        window: env.mockWin
      });

      assert.strictEqual(result.active, false);
      assert.strictEqual(result.status, PILOT_LIFECYCLE_STATES.DISABLED);
      assert.strictEqual(result.reason, 'feature_flag_disabled');
      assert.strictEqual(env.docListeners.length, 0, 'Must attach zero document listeners');
      assert.strictEqual(env.winListeners.length, 0, 'Must attach zero window listeners');
      assert.strictEqual(env.historyCalls.replaceState.length, 0, 'Must not mutate history state when disabled');
    });

    it('strictly prohibits activation on non-local / production origins even when ?hybrid=1, sessionStorage, or forceEnable are set', () => {
      const prodEnv = createPilotTestEnv({
        origin: 'https://mondo.studio',
        initialPathname: '/work',
        initialSearch: '?hybrid=1',
        sessionStorageItems: { mondo_hybrid_nav_pilot: '1' }
      });
      prodEnv.mockWin.__MONDO_ENABLE_HYBRID_NAV__ = true;

      assert.strictEqual(isAllowedLocalPilotHost(prodEnv.mockWin), false);
      assert.strictEqual(isHybridPilotEnabled({ window: prodEnv.mockWin, forceEnable: true }), false);

      const result = initHybridNavigationPilot({
        document: prodEnv.mockDoc,
        window: prodEnv.mockWin,
        forceEnable: true
      });

      assert.strictEqual(result.active, false);
      assert.strictEqual(result.reason, 'non_local_host_prohibited');
      assert.strictEqual(prodEnv.docListeners.length, 0);
      assert.strictEqual(prodEnv.winListeners.length, 0);
    });

    it('activates on local host only when explicit controlled opt-in (?hybrid=1 or sessionStorage) is provided', () => {
      const env = createPilotTestEnv({
        initialPathname: '/work',
        initialSearch: '?hybrid=1'
      });

      assert.strictEqual(isAllowedLocalPilotHost(env.mockWin), true);
      assert.strictEqual(isHybridPilotEnabled({ window: env.mockWin }), true);

      const controller = initHybridNavigationPilot({
        document: env.mockDoc,
        window: env.mockWin,
        boundCoordinatorOptions: env.createFastBoundOptions()
      });

      assert.strictEqual(controller.active, true);
      assert.strictEqual(env.mockWin.sessionStorage.getItem('mondo_hybrid_nav_pilot'), '1');
    });
  });

  // =========================================================================
  // 3 & 5. Programmatic Opt-In for Testing & Idempotent Initialization
  // =========================================================================
  describe('3 & 5. Controlled opt-in contracts & idempotent initialization', () => {
    it('supports explicit opt-in via ?hybrid=1 without any special test-only bypass parameter', () => {
      const env = createPilotTestEnv({
        initialPathname: '/work',
        initialSearch: '?hybrid=1'
      });

      assert.strictEqual(
        isHybridPilotEnabled({ window: env.mockWin }),
        true
      );

      const controller = initHybridNavigationPilot({
        document: env.mockDoc,
        window: env.mockWin,
        boundCoordinatorOptions: env.createFastBoundOptions()
      });

      assert.strictEqual(controller.active, true);
      assert.strictEqual(controller.status, PILOT_LIFECYCLE_STATES.ACTIVE);
      assert.deepStrictEqual(controller.getListenerStatus(), {
        click: true,
        popstate: true,
        scroll: true,
        pageshow: true
      });
    });

    it('remains inactive on non-pilot routes (e.g. /, /start) even when enabled on localhost', () => {
      for (const nonPilotPath of ['/', '/start', '/privacy', '/admin']) {
        const env = createPilotTestEnv({ initialPathname: nonPilotPath });
        const res = initHybridNavigationPilot({
          document: env.mockDoc,
          window: env.mockWin,
          forceEnable: true
        });
        assert.strictEqual(res.active, false);
        assert.strictEqual(res.reason, 'non_pilot_initial_route');
        assert.strictEqual(env.docListeners.length, 0);
        assert.strictEqual(env.winListeners.length, 0);
      }
    });

    it('is strictly idempotent across repeated initialization calls without duplicating listeners', () => {
      const env = createPilotTestEnv({ initialPathname: '/work' });

      const first = initHybridNavigationPilot({
        document: env.mockDoc,
        window: env.mockWin,
        forceEnable: true,
        boundCoordinatorOptions: env.createFastBoundOptions()
      });

      const docCountAfterFirst = env.docListeners.length;
      const winCountAfterFirst = env.winListeners.length;

      const second = initHybridNavigationPilot({
        document: env.mockDoc,
        window: env.mockWin,
        forceEnable: true,
        boundCoordinatorOptions: env.createFastBoundOptions()
      });

      assert.strictEqual(first, second);
      assert.strictEqual(env.docListeners.length, docCountAfterFirst);
      assert.strictEqual(env.winListeners.length, winCountAfterFirst);
    });

    it('Mandatory Correction E-G1-01: uses only verified public coordinator and historyManager APIs', () => {
      const env = createPilotTestEnv({ initialPathname: '/work' });
      const bound = createBoundCoordinator({
        document: env.mockDoc,
        window: env.mockWin,
        ...env.createFastBoundOptions()
      });

      // Verify all exposed methods are real functions on coordinator and historyManager
      const expectedCoordinatorMethods = [
        'navigate',
        'handlePopstate',
        'cancel',
        'destroy',
        'getState',
        'getProgress',
        'getActiveOperation',
        'isBusy',
        'hasPendingTraversal',
        'getTeardownStatus',
        'getRenderedRoute',
        'getTimingConfig',
        'hasDispatchedNativeFallback'
      ];
      for (const method of expectedCoordinatorMethods) {
        assert.strictEqual(typeof bound.coordinator[method], 'function', `coordinator.${method} must be a function`);
      }

      const expectedHistoryMethods = [
        'isManagedEntry',
        'createStateObject',
        'captureScroll',
        'updateCurrentEntryScroll',
        'pushRoute',
        'replaceRoute',
        'applyScrollPolicy',
        'evaluateTraversalDisposition',
        'queuePendingTraversal',
        'getPendingTraversal',
        'hasPendingTraversal',
        'clearPendingTraversal',
        'isCurrentGeneration',
        'getLatestGeneration',
        'destroy'
      ];
      for (const method of expectedHistoryMethods) {
        assert.strictEqual(typeof bound.historyManager[method], 'function', `historyManager.${method} must be a function`);
      }
    });
  });

  // =========================================================================
  // 4. Kill-Switch, Rollback, and Post-Boundary Deferred Teardown
  // =========================================================================
  describe('4. Kill-switch and rollback behavior, including post-boundary deferred teardown', () => {
    it('kill-switch flags (?hybrid=0, sessionStorage, __MONDO_HYBRID_NAV_DISABLED__) override opt-in flags', () => {
      const env1 = createPilotTestEnv({
        initialPathname: '/work',
        initialSearch: '?hybrid=0',
        sessionStorageItems: { mondo_hybrid_nav_pilot: '1' }
      });
      assert.strictEqual(
        isHybridPilotEnabled({ window: env1.mockWin, forceEnable: true }),
        false
      );

      const env2 = createPilotTestEnv({
        initialPathname: '/work',
        initialSearch: '?hybrid=1',
        sessionStorageItems: { mondo_hybrid_nav_disabled: '1' }
      });
      assert.strictEqual(
        isHybridPilotEnabled({ window: env2.mockWin, forceEnable: true }),
        false
      );
    });

    it('immediate disable during pre-boundary FETCHING cancels active work, detaches listeners, and restores scrollRestoration', async () => {
      let rejectOrResolveFetch;
      const env = createPilotTestEnv({
        initialPathname: '/work',
        initialScrollRestoration: 'auto'
      });

      const controller = initHybridNavigationPilot({
        document: env.mockDoc,
        window: env.mockWin,
        forceEnable: true,
        boundCoordinatorOptions: env.createFastBoundOptions({
          loaderAdapter: {
            loadHtml: (_url, { signal }) => new Promise((resolve, reject) => {
              rejectOrResolveFetch = resolve;
              if (signal) {
                signal.addEventListener('abort', () => reject(new Error('aborted')));
              }
            })
          }
        })
      });

      assert.strictEqual(env.mockWin.history.scrollRestoration, 'manual');

      const navPromise = controller.bound.navigate('/work/solitude-sound');
      await new Promise((r) => setTimeout(r, 20));
      assert.strictEqual(controller.getState(), NAVIGATION_STATES.FETCHING);

      const rollbackResult = controller.disable('operator_kill_switch');
      assert.strictEqual(rollbackResult.active, false);
      assert.strictEqual(rollbackResult.status, PILOT_LIFECYCLE_STATES.DISABLED);
      assert.strictEqual(rollbackResult.teardownStatus, TEARDOWN_LIFECYCLE.FINALIZED);
      assert.strictEqual(rollbackResult.deferred, false);
      assert.strictEqual(env.mockWin.history.scrollRestoration, 'auto');
      assert.deepStrictEqual(controller.getListenerStatus(), {
        click: false,
        popstate: false,
        scroll: false,
        pageshow: false
      });

      const navOutcome = await navPromise;
      assert.strictEqual(navOutcome.disposition, NAVIGATION_DISPOSITION.CANCELLED);
    });

    it('Section 7: disable during post-boundary COMMITTING defers final teardown until transaction settles', async () => {
      let releaseMount;
      const mountGate = new Promise((resolve) => { releaseMount = resolve; });

      const env = createPilotTestEnv({
        initialPathname: '/work',
        initialScrollRestoration: 'auto'
      });

      const controller = initHybridNavigationPilot({
        document: env.mockDoc,
        window: env.mockWin,
        forceEnable: true,
        boundCoordinatorOptions: env.createFastBoundOptions({
          lifecycleAdapter: {
            unmountRoute: async () => {},
            mountRoute: async () => {
              await mountGate;
            },
            awaitReadiness: async () => ({ status: 'ready', outcome: 'CRITICAL_MEDIA_READY' })
          }
        })
      });

      const navPromise = controller.bound.navigate('/work/solitude-sound');
      await new Promise((r) => setTimeout(r, 20));

      assert.strictEqual(controller.getState(), NAVIGATION_STATES.COMMITTING);
      assert.strictEqual(controller.quietMarkAdapter.isVeilVisible(), true);

      // Request disable while post-boundary COMMITTING is active
      const rollbackResult = controller.disable('kill_switch_during_commit');

      // Must NOT claim instantaneous complete teardown while post-boundary work is active!
      assert.strictEqual(rollbackResult.active, false);
      assert.strictEqual(rollbackResult.status, PILOT_LIFECYCLE_STATES.ROLLING_BACK_DEFERRED);
      assert.strictEqual(rollbackResult.teardownStatus, TEARDOWN_LIFECYCLE.PENDING_DEFERRED);
      assert.strictEqual(rollbackResult.deferred, true);

      // Click listener is immediately removed so new clicks use native MPA,
      // while protective veil remains visible for the in-flight commit
      assert.strictEqual(controller.getListenerStatus().click, false);
      assert.strictEqual(controller.quietMarkAdapter.isVeilVisible(), true);

      // Now allow post-boundary mount to finish
      releaseMount();
      const navOutcome = await navPromise;
      assert.strictEqual(navOutcome.disposition, NAVIGATION_DISPOSITION.COMPLETED);

      // Deferred teardown must now be finalized and scrollRestoration restored
      assert.strictEqual(controller.status, PILOT_LIFECYCLE_STATES.DISABLED);
      assert.strictEqual(controller.getTeardownStatus(), TEARDOWN_LIFECYCLE.FINALIZED);
      assert.strictEqual(env.mockWin.history.scrollRestoration, 'auto');
      assert.deepStrictEqual(controller.getListenerStatus(), {
        click: false,
        popstate: false,
        scroll: false,
        pageshow: false
      });
    });
  });

  // =========================================================================
  // 6, 7 & 8. Link Interception, Non-Interception Matrix & Mobile Drawer
  // =========================================================================
  describe('6, 7 & 8. Safe link interception, non-interception matrix & mobile drawer preservation (E-G1-02)', () => {
    it('intercepts eligible /work -> /work/:slug and /work/:slug -> /work before bubble-phase Quiet Mark listener', async () => {
      const env = createPilotTestEnv({ initialPathname: '/work' });

      // Register a mock bubble-phase listener simulating quiet-mark.js handleClick BEFORE initHybridNavigationPilot
      let legacyMpaQuietMarkTriggered = false;
      env.mockDoc.addEventListener('click', (e) => {
        if (e.defaultPrevented) return;
        legacyMpaQuietMarkTriggered = true;
      }, { passive: false });

      const controller = initHybridNavigationPilot({
        document: env.mockDoc,
        window: env.mockWin,
        forceEnable: true,
        boundCoordinatorOptions: env.createFastBoundOptions()
      });

      // Nested click target inside <a href="/work/solitude-sound"><span>Title</span></a>
      const anchor = env.createAnchor('/work/solitude-sound');
      const innerSpan = env.mockDoc.createElement('span');
      anchor.appendChild(innerSpan);

      const clickEvent = env.mockDoc.dispatchClick({ target: innerSpan });
      assert.strictEqual(clickEvent.defaultPrevented, true, 'Capture-phase interceptor must preventDefault');
      assert.strictEqual(legacyMpaQuietMarkTriggered, false, 'Bubble-phase MPA Quiet Mark must NOT fire on intercepted link');

      await new Promise((r) => setTimeout(r, 40));
      assert.strictEqual(controller.getRenderedRoute().pathname, '/work/solitude-sound');

      // Now test reverse eligible direction: /work/solitude-sound -> /work
      const backAnchor = env.createAnchor('/work');
      const backEvent = env.mockDoc.dispatchClick({ target: backAnchor });
      assert.strictEqual(backEvent.defaultPrevented, true);
      assert.strictEqual(legacyMpaQuietMarkTriggered, false);

      await new Promise((r) => setTimeout(r, 40));
      assert.strictEqual(controller.getRenderedRoute().pathname, '/work');
    });

    it('does NOT intercept /work/:slugA -> /work/:slugB, non-pilot routes, external URLs, modified clicks, middle-click, target=_blank, download, hash-only, mailto:, tel:, or defaultPrevented', () => {
      const env = createPilotTestEnv({ initialPathname: '/work/solitude-sound' });

      const controller = initHybridNavigationPilot({
        document: env.mockDoc,
        window: env.mockWin,
        forceEnable: true,
        boundCoordinatorOptions: env.createFastBoundOptions()
      });

      const nonInterceptCases = [
        { name: 'project-to-project (/work/a -> /work/b)', target: env.createAnchor('/work/other-project') },
        { name: 'homepage /', target: env.createAnchor('/') },
        { name: 'non-pilot /start', target: env.createAnchor('/start') },
        { name: 'external URL', target: env.createAnchor('https://example.com/work') },
        { name: 'ctrl+click', target: env.createAnchor('/work'), ctrlKey: true },
        { name: 'meta+click', target: env.createAnchor('/work'), metaKey: true },
        { name: 'shift+click', target: env.createAnchor('/work'), shiftKey: true },
        { name: 'alt+click', target: env.createAnchor('/work'), altKey: true },
        { name: 'middle-click (button=1)', target: env.createAnchor('/work'), button: 1 },
        { name: 'target="_blank"', target: env.createAnchor('/work', { target: '_blank' }) },
        { name: 'download link', target: env.createAnchor('/work', { download: '' }) },
        { name: 'rel="external"', target: env.createAnchor('/work', { rel: 'noopener external' }) },
        { name: 'hash-only #top', target: env.createAnchor('#top') },
        { name: 'same-route hash /work/solitude-sound#credits', target: env.createAnchor('/work/solitude-sound#credits') },
        { name: 'mailto: link', target: env.createAnchor('mailto:hello@mondo.studio') },
        { name: 'tel: link', target: env.createAnchor('tel:+123456789') }
      ];

      for (const tc of nonInterceptCases) {
        const evt = env.mockDoc.dispatchClick({
          target: tc.target,
          button: tc.button,
          ctrlKey: tc.ctrlKey,
          metaKey: tc.metaKey,
          shiftKey: tc.shiftKey,
          altKey: tc.altKey
        });
        assert.strictEqual(
          evt.defaultPrevented,
          false,
          `Must NOT intercept ${tc.name}`
        );
      }

      // Already defaultPrevented event must be ignored without starting a hybrid operation
      const alreadyPreventedEvt = env.mockDoc.dispatchClick({
        target: env.createAnchor('/work'),
        defaultPrevented: true
      });
      assert.strictEqual(alreadyPreventedEvt.defaultPrevented, true);
      assert.strictEqual(controller.isBusy(), false);
    });

    it('closes mobile drawer (.main-nav.is-open) and updates aria-expanded="false" when navigating from an eligible link', async () => {
      const env = createPilotTestEnv({ initialPathname: '/work/solitude-sound' });

      // Simulate open mobile drawer
      env.mainNavEl.classList.add('is-open');
      env.navToggleBtn.setAttribute('aria-expanded', 'true');

      initHybridNavigationPilot({
        document: env.mockDoc,
        window: env.mockWin,
        forceEnable: true,
        boundCoordinatorOptions: env.createFastBoundOptions()
      });

      const workNavLink = env.createAnchor('/work');
      env.mainNavEl.appendChild(workNavLink);

      const evt = env.mockDoc.dispatchClick({ target: workNavLink });
      assert.strictEqual(evt.defaultPrevented, true);
      assert.strictEqual(env.mainNavEl.classList.contains('is-open'), false, 'Mobile drawer must be closed');
      assert.strictEqual(env.navToggleBtn.getAttribute('aria-expanded'), 'false', 'aria-expanded must be reset to false');

      await new Promise((r) => setTimeout(r, 40));
    });
  });

  // =========================================================================
  // 9 & 10. History Seeding, Unrelated State Preservation & Scroll Restoration
  // =========================================================================
  describe('9 & 10. Initial History seeding, unrelated state preservation & (scrollX, scrollY) restoration (E-G1-04)', () => {
    it('seeds initial managed History entry on activation while preserving unrelated history.state fields', () => {
      const env = createPilotTestEnv({
        initialPathname: '/work',
        initialHistoryState: { customAnalyticsId: 'abc-123', themePref: 'dark' },
        initialScrollX: 15,
        initialScrollY: 280
      });

      const controller = initHybridNavigationPilot({
        document: env.mockDoc,
        window: env.mockWin,
        forceEnable: true,
        boundCoordinatorOptions: env.createFastBoundOptions()
      });

      assert.strictEqual(controller.active, true);
      assert.strictEqual(env.historyCalls.replaceState.length, 1);

      const seededState = env.mockWin.history.state;
      assert.strictEqual(seededState.mondoHybrid, true);
      assert.strictEqual(seededState.routeId, 'work');
      assert.strictEqual(seededState.scrollX, 15);
      assert.strictEqual(seededState.scrollY, 280);
      // Unrelated history.state fields must remain intact
      assert.strictEqual(seededState.customAnalyticsId, 'abc-123');
      assert.strictEqual(seededState.themePref, 'dark');
    });

    it('captures outgoing (scrollX, scrollY), resets to (0, 0) on forward navigation, and restores saved (scrollX, scrollY) after mount on Back popstate', async () => {
      const env = createPilotTestEnv({
        initialPathname: '/work',
        initialHistoryState: { customToken: 'keep-me' },
        initialScrollX: 0,
        initialScrollY: 0
      });

      let mountCompletedBeforeFinalRestore = false;
      let scrollRestoreCountOnPopstate = 0;

      const controller = initHybridNavigationPilot({
        document: env.mockDoc,
        window: env.mockWin,
        forceEnable: true,
        boundCoordinatorOptions: env.createFastBoundOptions({
          lifecycleAdapter: {
            unmountRoute: async () => {},
            mountRoute: async () => {
              mountCompletedBeforeFinalRestore = true;
            },
            awaitReadiness: async () => ({ status: 'ready', outcome: 'CRITICAL_MEDIA_READY' })
          }
        })
      });

      // User scrolls on /work to (24, 640) before clicking a project card
      env.mockWin.setScroll(24, 640);
      const projectLink = env.createAnchor('/work/solitude-sound');
      env.mockDoc.dispatchClick({ target: projectLink });

      await new Promise((r) => setTimeout(r, 40));

      // Verify outgoing /work entry had (24, 640) captured and unrelated field preserved
      const outgoingSavedState = env.historyCalls.replaceState[env.historyCalls.replaceState.length - 1].state;
      assert.strictEqual(outgoingSavedState.scrollX, 24);
      assert.strictEqual(outgoingSavedState.scrollY, 640);
      assert.strictEqual(outgoingSavedState.customToken, 'keep-me');

      // Verify forward navigation reset scroll to (0, 0) and pushed exactly once
      assert.strictEqual(env.historyCalls.pushState.length, 1);
      assert.strictEqual(env.mockWin.scrollX, 0);
      assert.strictEqual(env.mockWin.scrollY, 0);

      // Now simulate Browser Back to /work with the saved managed state
      const pushCountBeforePopstate = env.historyCalls.pushState.length;
      mountCompletedBeforeFinalRestore = false;
      const scrollCallsBeforePop = env.scrollCalls.length;

      env.mockWin.location.pathname = '/work';
      const popOutcome = await controller.bound.handlePopstate({
        targetUrl: '/work',
        state: outgoingSavedState
      });

      assert.strictEqual(popOutcome.disposition, NAVIGATION_DISPOSITION.COMPLETED);
      // Popstate must NEVER call pushState
      assert.strictEqual(env.historyCalls.pushState.length, pushCountBeforePopstate);
      // Scroll must be restored to (24, 640) and reapplied after mountRoute
      assert.strictEqual(mountCompletedBeforeFinalRestore, true);
      scrollRestoreCountOnPopstate = env.scrollCalls.length - scrollCallsBeforePop;
      assert.ok(scrollRestoreCountOnPopstate >= 2, 'Scroll policy must be applied before and reapplied after mountRoute');
      assert.strictEqual(env.mockWin.scrollX, 24);
      assert.strictEqual(env.mockWin.scrollY, 640);
    });
  });

  // =========================================================================
  // 11 & 12. Popstate Divergence Recovery, Uncommitted Back & Queued Supersession
  // =========================================================================
  describe('11 & 12. Popstate divergence recovery, uncommitted Back & queued traversal supersession (E-G1-04)', () => {
    it('reconciles Browser Back during uncommitted hybrid fetch when browser returns to already-rendered route', async () => {
      let hangFetch;
      const env = createPilotTestEnv({
        initialPathname: '/work',
        initialScrollX: 10,
        initialScrollY: 320
      });

      const controller = initHybridNavigationPilot({
        document: env.mockDoc,
        window: env.mockWin,
        forceEnable: true,
        boundCoordinatorOptions: env.createFastBoundOptions({
          loaderAdapter: {
            loadHtml: (_url, { signal }) => new Promise((resolve, reject) => {
              hangFetch = resolve;
              if (signal) {
                signal.addEventListener('abort', () => reject(new Error('aborted')));
              }
            })
          }
        })
      });

      const savedWorkState = env.mockWin.history.state;

      // Start forward navigation /work -> /work/solitude-sound (hangs in FETCHING before pushState)
      const navPromise = controller.bound.navigate('/work/solitude-sound');
      await new Promise((r) => setTimeout(r, 20));
      assert.strictEqual(controller.getState(), NAVIGATION_STATES.FETCHING);

      // Browser popstate fires returning to /work (same as rendered DOM /work)
      const popRes = await controller.bound.handlePopstate({
        targetUrl: '/work',
        state: savedWorkState
      });

      const navRes = await navPromise;
      assert.strictEqual(navRes.disposition, NAVIGATION_DISPOSITION.CANCELLED);
      assert.strictEqual(popRes.mode, 'reconciled_same_route');
      assert.strictEqual(popRes.fallbackDispatched, false, 'Must not reload when DOM is already at destination');
      assert.strictEqual(env.mockWin.scrollX, 10);
      assert.strictEqual(env.mockWin.scrollY, 320);
      assert.strictEqual(controller.getState(), NAVIGATION_STATES.IDLE);
    });

    it('reconciles Browser Back during uncommitted fetch when browser lands on a DIFFERENT eligible route', async () => {
      const env = createPilotTestEnv({ initialPathname: '/work' });

      const controller = initHybridNavigationPilot({
        document: env.mockDoc,
        window: env.mockWin,
        forceEnable: true,
        boundCoordinatorOptions: env.createFastBoundOptions({
          loaderAdapter: {
            loadHtml: async (url, { signal }) => {
              if (url === '/work/slow-project') {
                return new Promise((_resolve, reject) => {
                  if (signal) {
                    signal.addEventListener('abort', () => reject(new Error('aborted')));
                  }
                });
              }
              return {
                ok: true,
                data: {
                  url: `http://localhost:3005${url}`,
                  pathname: url,
                  route: 'project',
                  slug: 'previous-project',
                  title: 'Previous Project — MONDO',
                  mainHtml: '<section id="project-main"><h1>Previous Project</h1></section>'
                }
              };
            }
          }
        })
      });

      // Click /work/slow-project (uncommitted in FETCHING while DOM is still /work)
      const slowNavPromise = controller.bound.navigate('/work/slow-project');
      await new Promise((r) => setTimeout(r, 20));
      assert.strictEqual(controller.getState(), NAVIGATION_STATES.FETCHING);

      // User presses Browser Back to an earlier history entry /work/previous-project
      env.mockWin.location.pathname = '/work/previous-project';
      const popRes = await controller.bound.handlePopstate({
        targetUrl: '/work/previous-project',
        state: { mondoHybrid: true, routeId: 'project', slug: 'previous-project', scrollX: 0, scrollY: 180 }
      });

      const slowRes = await slowNavPromise;
      assert.strictEqual(slowRes.disposition, NAVIGATION_DISPOSITION.CANCELLED);
      assert.strictEqual(popRes.disposition, NAVIGATION_DISPOSITION.COMPLETED);
      assert.strictEqual(controller.getRenderedRoute().pathname, '/work/previous-project');
      assert.strictEqual(env.mockWin.scrollY, 180);
    });

    it('dispatches native fallback on popstate when destination is ineligible and diverged from rendered DOM', async () => {
      const env = createPilotTestEnv({ initialPathname: '/work/solitude-sound' });

      const controller = initHybridNavigationPilot({
        document: env.mockDoc,
        window: env.mockWin,
        forceEnable: true,
        boundCoordinatorOptions: env.createFastBoundOptions()
      });

      // Popstate traverses from /work/solitude-sound to ineligible /work/another-project
      env.mockWin.location.pathname = '/work/another-project';
      const popRes = await controller.bound.handlePopstate({
        targetUrl: '/work/another-project',
        state: null
      });

      assert.strictEqual(popRes.disposition, NAVIGATION_DISPOSITION.INELIGIBLE_NATIVE_FALLBACK);
      assert.strictEqual(popRes.fallbackDispatched, true);
      assert.deepStrictEqual(env.nativeNavigationCalls.replace, ['/work/another-project']);
    });

    it('escalates pre-commit popstate fetch failure to native fallback so Browser URL and DOM never remain diverged', async () => {
      const env = createPilotTestEnv({ initialPathname: '/work/solitude-sound' });

      const controller = initHybridNavigationPilot({
        document: env.mockDoc,
        window: env.mockWin,
        forceEnable: true,
        boundCoordinatorOptions: env.createFastBoundOptions({
          loaderAdapter: {
            loadHtml: async () => ({ ok: false, error: 'HTTP 503 Service Unavailable' })
          }
        })
      });

      // Browser URL has already moved to /work on popstate while DOM is still /work/solitude-sound
      env.mockWin.location.pathname = '/work';
      const popRes = await controller.bound.handlePopstate({
        targetUrl: '/work',
        state: { mondoHybrid: true, routeId: 'work', scrollX: 0, scrollY: 100 }
      });

      assert.strictEqual(popRes.disposition, NAVIGATION_DISPOSITION.RECOVERED);
      assert.strictEqual(popRes.mode, 'native_fallback');
      assert.deepStrictEqual(env.nativeNavigationCalls.replace, ['/work']);
    });

    it('supersedes older queued popstate traversals during post-boundary execution so only the latest generation drains', async () => {
      let releaseMount;
      const mountGate = new Promise((resolve) => { releaseMount = resolve; });

      const env = createPilotTestEnv({ initialPathname: '/work' });

      const controller = initHybridNavigationPilot({
        document: env.mockDoc,
        window: env.mockWin,
        forceEnable: true,
        boundCoordinatorOptions: env.createFastBoundOptions({
          lifecycleAdapter: {
            unmountRoute: async () => {},
            mountRoute: async (route) => {
              if (route.pathname === '/work/solitude-sound') {
                await mountGate;
              }
            },
            awaitReadiness: async () => ({ status: 'ready', outcome: 'CRITICAL_MEDIA_READY' })
          }
        })
      });

      const navPromise = controller.bound.navigate('/work/solitude-sound');
      await new Promise((r) => setTimeout(r, 20));
      assert.strictEqual(controller.getState(), NAVIGATION_STATES.COMMITTING);

      // Queue first popstate (generation 1)
      const q1 = await controller.bound.handlePopstate({
        targetUrl: '/work',
        state: { mondoHybrid: true, routeId: 'work', scrollX: 0, scrollY: 111 }
      });
      // Queue second popstate (generation 2 supersedes generation 1)
      const q2 = await controller.bound.handlePopstate({
        targetUrl: '/work',
        state: { mondoHybrid: true, routeId: 'work', scrollX: 0, scrollY: 222 }
      });

      assert.strictEqual(q1.disposition, 'queued');
      assert.strictEqual(q2.disposition, 'queued');
      assert.ok(q2.generation > q1.generation);

      // Release mount; drained popstate must use generation 2's state (scrollY: 222)
      releaseMount();
      await navPromise;

      assert.strictEqual(controller.getRenderedRoute().pathname, '/work');
      assert.strictEqual(env.mockWin.scrollY, 222);
    });
  });

  // =========================================================================
  // 13 & 14. Escape-Key Ownership & Quiet Mark Compatibility (E-G1-05)
  // =========================================================================
  describe('13 & 14. Escape-key ownership & Quiet Mark compatibility fixes (E-G1-05)', () => {
    it('Escape cancels pre-boundary hybrid navigation and dismisses veil, but NEVER dismisses veil during post-boundary states', async () => {
      // Part A: Pre-boundary Escape cancels
      let hangFetch;
      const env1 = createPilotTestEnv({ initialPathname: '/work' });
      const controller1 = initHybridNavigationPilot({
        document: env1.mockDoc,
        window: env1.mockWin,
        forceEnable: true,
        boundCoordinatorOptions: env1.createFastBoundOptions({
          loaderAdapter: {
            loadHtml: (_url, { signal }) => new Promise((resolve, reject) => {
              hangFetch = resolve;
              if (signal) {
                signal.addEventListener('abort', () => reject(new Error('aborted')));
              }
            })
          }
        })
      });

      const nav1 = controller1.bound.navigate('/work/solitude-sound');
      await new Promise((r) => setTimeout(r, 20));
      assert.strictEqual(controller1.getState(), NAVIGATION_STATES.FETCHING);

      const handledPre = controller1.handleEscape();
      assert.strictEqual(handledPre, true);
      const outcome1 = await nav1;
      assert.strictEqual(outcome1.disposition, NAVIGATION_DISPOSITION.CANCELLED);
      assert.strictEqual(controller1.quietMarkAdapter.isVeilVisible(), false);

      disableHybridNavigationPilot({ window: env1.mockWin });

      // Part B: Post-boundary Escape is swallowed and NEVER dismisses veil
      let releaseMount;
      const mountGate = new Promise((resolve) => { releaseMount = resolve; });
      const env2 = createPilotTestEnv({ initialPathname: '/work' });
      const controller2 = initHybridNavigationPilot({
        document: env2.mockDoc,
        window: env2.mockWin,
        forceEnable: true,
        boundCoordinatorOptions: env2.createFastBoundOptions({
          lifecycleAdapter: {
            unmountRoute: async () => {},
            mountRoute: async () => { await mountGate; },
            awaitReadiness: async () => ({ status: 'ready', outcome: 'CRITICAL_MEDIA_READY' })
          }
        })
      });

      const nav2 = controller2.bound.navigate('/work/solitude-sound');
      await new Promise((r) => setTimeout(r, 20));
      assert.strictEqual(controller2.getState(), NAVIGATION_STATES.COMMITTING);
      assert.strictEqual(controller2.quietMarkAdapter.isVeilVisible(), true);

      const handledPost = controller2.handleEscape();
      assert.strictEqual(handledPost, true);
      // Veil MUST remain visible while COMMITTING!
      assert.strictEqual(controller2.quietMarkAdapter.isVeilVisible(), true);
      assert.strictEqual(controller2.getState(), NAVIGATION_STATES.COMMITTING);

      releaseMount();
      const outcome2 = await nav2;
      assert.strictEqual(outcome2.disposition, NAVIGATION_DISPOSITION.COMPLETED);
    });

    it('sets data-qm-state="quiet"|"status"|"dismissed" and animates logo visibility under both normal and reduced motion', async () => {
      const envReduced = createPilotTestEnv({
        initialPathname: '/work',
        reducedMotion: true
      });

      const adapterReduced = createQuietMarkAdapter({
        document: envReduced.mockDoc,
        window: envReduced.mockWin,
        reducedMotion: true
      });

      await adapterReduced.showVeil({
        sourceRoute: { type: 'work', pathname: '/work' },
        targetRoute: { type: 'project', pathname: '/work/solitude-sound' },
        operationId: 1
      });

      const overlay = envReduced.mockDoc.getElementById(OVERLAY_ID);
      const logo = envReduced.mockDoc.getElementById(LOGO_ID);

      assert.strictEqual(overlay.getAttribute('data-qm-state'), 'quiet');
      assert.strictEqual(overlay.classList.contains('is-logo-ready'), true);
      assert.strictEqual(logo.classList.contains('is-decoded'), true);
      assert.strictEqual(logo.style.opacity, '1');
      assert.strictEqual(adapterReduced.isVeilVisible(), true);

      await adapterReduced.dismissVeil();
      assert.strictEqual(overlay.getAttribute('data-qm-state'), 'dismissed');
      assert.strictEqual(logo.style.opacity, '0');
      assert.strictEqual(adapterReduced.isVeilVisible(), false);
    });

    it('purges stale project guard classes and dismisses __MONDO_PILOT_GUARD__ when swapping to /work', () => {
      const env = createPilotTestEnv({ initialPathname: '/work/solitude-sound' });
      let guardDismissCalled = false;
      env.mockWin.__MONDO_PILOT_GUARD__ = {
        dismiss: () => { guardDismissCalled = true; }
      };

      env.mockDoc.documentElement.classList.add(
        'is-project-pilot-guard',
        'is-project-pilot-active',
        'is-project-pilot-status',
        'is-project-pilot-error',
        'is-project-css-pending',
        'is-project-css-ready'
      );

      const domAdapter = createDomAdapter({
        document: env.mockDoc,
        window: env.mockWin
      });

      const swapOk = domAdapter.swapMainContent('<div id="work-grid"></div>', {
        id: 'work',
        type: 'work',
        pathname: '/work'
      });

      assert.strictEqual(swapOk, true);
      assert.strictEqual(guardDismissCalled, true);
      for (const cls of [
        'is-project-pilot-guard',
        'is-project-pilot-active',
        'is-project-pilot-status',
        'is-project-pilot-error',
        'is-project-css-pending',
        'is-project-css-ready'
      ]) {
        assert.strictEqual(
          env.mockDoc.documentElement.classList.contains(cls),
          false,
          `Class ${cls} must be purged on swap`
        );
      }
    });

    it('preserves active operation protective veil when a superseded FETCHING operation aborts asynchronously', async () => {
      const env = createPilotTestEnv({ initialPathname: '/work' });

      const controller = initHybridNavigationPilot({
        document: env.mockDoc,
        window: env.mockWin,
        forceEnable: true,
        boundCoordinatorOptions: env.createFastBoundOptions({
          loaderAdapter: {
            loadHtml: async (targetPath, { signal } = {}) => {
              if (targetPath === '/work/solitude-sound') {
                return await new Promise((resolve, reject) => {
                  if (signal && signal.aborted) {
                    const err = new Error('aborted');
                    err.name = 'AbortError';
                    reject(err);
                    return;
                  }
                  if (signal) {
                    signal.addEventListener('abort', () => {
                      // Reject asynchronously on a timer while second operation is in OUTBOUND
                      setTimeout(() => {
                        const err = new Error('aborted');
                        err.name = 'AbortError';
                        reject(err);
                      }, 2);
                    }, { once: true });
                  }
                });
              }
              return {
                ok: true,
                data: {
                  title: 'Cat Battles — MONDO',
                  metaDescription: 'Project details',
                  mainHtml: '<div id="project-main"><h1>Cat Battles</h1></div>',
                  routeType: 'project'
                }
              };
            }
          }
        })
      });

      const nav1 = controller.bound.navigate('/work/solitude-sound');
      await new Promise((r) => setTimeout(r, 15));
      assert.strictEqual(controller.getState(), NAVIGATION_STATES.FETCHING);

      // Trigger second navigation while first is FETCHING
      const nav2 = controller.bound.navigate('/work/cat-battle');
      const [out1, out2] = await Promise.all([nav1, nav2]);

      assert.strictEqual(out1.disposition, NAVIGATION_DISPOSITION.CANCELLED);
      assert.strictEqual(out2.disposition, NAVIGATION_DISPOSITION.COMPLETED);
      assert.strictEqual(out2.targetUrl, '/work/cat-battle');
      assert.strictEqual(env.historyCalls.pushState.length, 1);
      assert.strictEqual(controller.getState(), NAVIGATION_STATES.IDLE);
    });
  });
});

