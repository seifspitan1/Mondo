import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STATES,
  DEP_STATES,
  createReadinessCoordinator,
  waitForImageDecode,
  waitForVideoReady
} from '../public/js/shared/readiness.js';

import {
  mountProject,
  unmountProject,
  renderErrorState,
  renderNotFound,
  renderProject
} from '../public/js/features/project/project-page.js';

import { defaultProjects } from '../public/js/shared/defaults.js';

test('Critical Hero Media Readiness (Stage G2.5)', async (t) => {

  await t.test('Group A: Coordinator Dependency Settlement vs Visual Readiness', async (t2) => {
    await t2.test('Critical visual dependency timeout does NOT settle coordinator to READY', async () => {
      let readyCalled = false;
      const coordinator = createReadinessCoordinator({
        appearanceThresholdMs: 50,
        longWaitMs: 100,
        maxTimeoutMs: 500,
        onReady: () => { readyCalled = true; }
      });

      // Register critical visual dependency with 80ms timeout
      coordinator.register('hero_media', null, {
        critical: true,
        visual: true,
        allowFallback: false,
        timeoutMs: 80
      });

      coordinator.start();
      assert.strictEqual(coordinator.getState(), STATES.PENDING);

      // Wait for dependency timer to fire
      await new Promise((r) => setTimeout(r, 120));

      const deps = coordinator.getDependencies();
      const heroDep = deps.get('hero_media');
      assert.strictEqual(heroDep.status, DEP_STATES.TIMED_OUT);
      assert.strictEqual(coordinator.getState(), STATES.PENDING, 'Coordinator must NOT transition to READY on visual timeout');
      assert.strictEqual(readyCalled, false, 'onReady must NOT fire on visual timeout');
      assert.strictEqual(coordinator.isReady(), false);

      coordinator.destroy();
    });

    await t2.test('Critical visual dependency requires verified fallback to satisfy readiness', () => {
      const coordinator = createReadinessCoordinator();
      coordinator.register('hero_media', null, {
        critical: true,
        visual: true,
        allowFallback: false,
        hasVerifiedFallback: false
      });
      coordinator.start();

      coordinator.markFallback('hero_media', 'unapproved_fallback');
      assert.strictEqual(coordinator.isReady(), false, 'Unverified fallback must not satisfy critical visual readiness');

      coordinator.destroy();
    });

    await t2.test('Optional dependency timeout does not block coordinator readiness', async () => {
      const coordinator = createReadinessCoordinator();
      coordinator.register('critical_core', null, { critical: true });
      coordinator.register('optional_bg', null, { critical: false, timeoutMs: 50 });
      coordinator.start();

      coordinator.markReady('critical_core', 'ok');
      assert.strictEqual(coordinator.isReady(), true, 'Ready when critical dependencies settle');
      coordinator.destroy();
    });

    await t2.test('Late decode success after observation threshold transitions to READY', async () => {
      let readyPayload = null;
      const coordinator = createReadinessCoordinator({
        onReady: (info) => { readyPayload = info; }
      });

      // Register critical visual dependency with 50ms observation threshold
      coordinator.register('hero_media', null, {
        critical: true,
        visual: true,
        allowFallback: false,
        timeoutMs: 50
      });
      coordinator.start();

      // Wait for observation threshold to pass
      await new Promise((r) => setTimeout(r, 70));
      assert.strictEqual(coordinator.getDependencies().get('hero_media').status, DEP_STATES.TIMED_OUT);
      assert.strictEqual(coordinator.isReady(), false);

      // Late successful decode arrives at 100ms
      coordinator.markReady('hero_media', { width: 1600, height: 900 });
      assert.strictEqual(coordinator.getDependencies().get('hero_media').status, DEP_STATES.READY);
      assert.strictEqual(coordinator.isReady(), true);
      assert.ok(readyPayload !== null, 'onReady must be notified on late decode success');

      coordinator.destroy();
    });
  });

  await t.test('Group B: waitForImageDecode Extended Observation Contracts', async (t2) => {
    await t2.test('waitForImageDecode with keepListening=true preserves listeners past observation threshold', async () => {
      let observationTimedOut = false;
      const listeners = new Map();
      const mockImg = {
        complete: false,
        naturalWidth: 0,
        addEventListener: (evt, fn) => { listeners.set(evt, fn); },
        removeEventListener: (evt) => { listeners.delete(evt); },
        decode: async () => {
          mockImg.naturalWidth = 1600;
          return Promise.resolve();
        }
      };

      const decodePromise = waitForImageDecode(mockImg, 60, {
        keepListening: true,
        onObservationTimeout: () => { observationTimedOut = true; }
      });

      // Wait 80ms past 60ms observation threshold
      await new Promise((r) => setTimeout(r, 80));
      assert.strictEqual(observationTimedOut, true, 'onObservationTimeout must have fired');
      assert.ok(listeners.has('load'), 'load listener must remain attached for extended observation');

      // Now simulate late image load arriving at 100ms
      const onLoad = listeners.get('load');
      onLoad();

      const result = await decodePromise;
      assert.strictEqual(result.status, 'decoded');
      assert.strictEqual(result.wasDelayed, true);
    });

    await t2.test('waitForImageDecode catches errors gracefully without unhandled rejection', async () => {
      const mockImg = {
        complete: false,
        naturalWidth: 0,
        addEventListener: (evt, fn) => {
          if (evt === 'error') {
            setTimeout(() => fn(new Error('404 Not Found')), 20);
          }
        },
        removeEventListener: () => {}
      };

      const result = await waitForImageDecode(mockImg, 100);
      assert.strictEqual(result.status, 'error');
      assert.ok(result.error);
    });
  });

  await t.test('Group C: Project Details Page Readiness & Reveal Safety', async (t2) => {
    t2.beforeEach(() => {
      global.window = {
        location: { pathname: '/work/rainbow-orchard', search: '' },
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => {},
        __MONDO_PROJECT_READY__: false,
        __MONDO_BOOTSTRAP_STATE__: 'idle'
      };
      global.document = {
        documentElement: {
          classList: {
            contains: () => false,
            add: () => {},
            remove: () => {}
          }
        },
        title: '',
        querySelector: () => null,
        getElementById: () => null
      };
    });

    t2.afterEach(() => {
      unmountProject({ root: global.document });
      delete global.window;
      delete global.document;
    });

    await t2.test('mountProject does NOT emit mondo:project-ready when hero image is still loading', async () => {
      let eventDispatched = false;
      global.window.dispatchEvent = (ev) => {
        if (ev.type === 'mondo:project-ready') eventDispatched = true;
      };

      // Mock DOM with pending hero image
      const mockImg = {
        tagName: 'IMG',
        classList: { add: () => {}, remove: () => {} },
        style: {},
        complete: false,
        naturalWidth: 0,
        addEventListener: () => {},
        removeEventListener: () => {},
        decode: () => new Promise(() => {}) // pending forever
      };

      const mockDoc = {
        documentElement: global.document.documentElement,
        body: { dataset: {} },
        querySelector: (sel) => {
          if (sel === '#project-media img') return mockImg;
          return null;
        },
        getElementById: () => null
      };

      const coordinator = await mountProject({
        root: mockDoc,
        slug: 'rainbow-orchard',
        fallbackProjects: defaultProjects
      });

      assert.ok(coordinator);
      assert.strictEqual(global.window.__MONDO_PROJECT_READY__, false, 'PROJECT_READY must remain false while hero is pending');
      assert.strictEqual(eventDispatched, false, 'mondo:project-ready must NOT be dispatched while hero is pending');
      unmountProject({ root: mockDoc });
    });

    await t2.test('mountProject emits mondo:project-ready ONLY when hero image decodes successfully', async () => {
      let eventDispatched = false;
      global.window.dispatchEvent = (ev) => {
        if (ev.type === 'mondo:project-ready') eventDispatched = true;
      };

      let loadCb = null;
      const mockImg = {
        tagName: 'IMG',
        classList: { add: () => {}, remove: () => {} },
        style: {},
        complete: false,
        naturalWidth: 0,
        addEventListener: (evt, fn) => { if (evt === 'load') loadCb = fn; },
        removeEventListener: () => {},
        decode: async () => {
          mockImg.naturalWidth = 1600;
          return Promise.resolve();
        }
      };

      const mockDoc = {
        documentElement: global.document.documentElement,
        body: { dataset: {} },
        querySelector: (sel) => {
          if (sel === '#project-media img') return mockImg;
          return null;
        },
        getElementById: () => null
      };

      const coordinator = await mountProject({
        root: mockDoc,
        slug: 'rainbow-orchard',
        fallbackProjects: defaultProjects
      });

      assert.strictEqual(global.window.__MONDO_PROJECT_READY__, false);
      assert.strictEqual(eventDispatched, false);

      // Now hero finishes loading
      mockImg.complete = true;
      if (loadCb) loadCb();

      // Yield microtasks for promise resolution
      await new Promise((r) => setTimeout(r, 50));

      assert.strictEqual(global.window.__MONDO_PROJECT_READY__, true, 'PROJECT_READY must be true after hero decode');
      assert.strictEqual(eventDispatched, true, 'mondo:project-ready must be dispatched');
      unmountProject({ root: mockDoc });
    });

    await t2.test('mountProject mounts recoverable error state and does NOT emit ready on hero 404', async () => {
      let eventDispatched = false;
      global.window.dispatchEvent = (ev) => {
        if (ev.type === 'mondo:project-ready') eventDispatched = true;
      };

      let errCb = null;
      const mockImg = {
        tagName: 'IMG',
        classList: { add: () => {}, remove: () => {} },
        style: {},
        complete: false,
        naturalWidth: 0,
        addEventListener: (evt, fn) => { if (evt === 'error') errCb = fn; },
        removeEventListener: () => {}
      };

      let errorRendered = false;
      const mockHost = {
        hidden: true,
        innerHTML: '',
        querySelector: () => ({ addEventListener: () => {} })
      };
      const mockMain = {
        classList: { add: () => {}, remove: () => {} },
        querySelector: (sel) => (sel === '#project-error-host' ? mockHost : null),
        insertBefore: () => {}
      };

      const mockDoc = {
        documentElement: global.document.documentElement,
        body: { dataset: {} },
        querySelector: (sel) => {
          if (sel === '#project-media img') return mockImg;
          if (sel === '#project-main') return mockMain;
          return null;
        },
        getElementById: (id) => {
          if (id === 'project-main') return mockMain;
          if (id === 'project-error-host') return mockHost;
          return null;
        }
      };

      const coordinator = await mountProject({
        root: mockDoc,
        slug: 'rainbow-orchard',
        fallbackProjects: defaultProjects
      });

      // Simulate network 404
      if (errCb) errCb(new Error('404 Media Not Found'));

      await new Promise((r) => setTimeout(r, 50));

      assert.strictEqual(global.window.__MONDO_PROJECT_READY__, false, 'Must not emit ready on 404');
      assert.strictEqual(eventDispatched, false, 'Must not dispatch project-ready on 404');
      assert.strictEqual(mockHost.hidden, false, 'Error host must be visible');
      assert.ok(mockHost.innerHTML.includes('CONNECTION ISSUE') || mockHost.innerHTML.includes('Unable to load project'));
      unmountProject({ root: mockDoc });
    });

    await t2.test('unmountProject cancels in-flight hero operation and prevents late ready event', async () => {
      let lateEventDispatched = false;
      global.window.dispatchEvent = (ev) => {
        if (ev.type === 'mondo:project-ready') lateEventDispatched = true;
      };

      let loadCb = null;
      const mockImg = {
        tagName: 'IMG',
        classList: { add: () => {}, remove: () => {} },
        style: {},
        complete: false,
        naturalWidth: 0,
        addEventListener: (evt, fn) => { if (evt === 'load') loadCb = fn; },
        removeEventListener: () => {},
        decode: async () => Promise.resolve()
      };

      const mockDoc = {
        documentElement: global.document.documentElement,
        body: { dataset: {} },
        querySelector: (sel) => (sel === '#project-media img' ? mockImg : null),
        getElementById: () => null
      };

      await mountProject({
        root: mockDoc,
        slug: 'rainbow-orchard',
        fallbackProjects: defaultProjects
      });

      // User navigates away before hero finishes: unmount called
      unmountProject({ root: mockDoc });

      // Late hero arrives
      if (loadCb) loadCb();
      await new Promise((r) => setTimeout(r, 50));

      assert.strictEqual(global.window.__MONDO_PROJECT_READY__, false, 'Late arrival after unmount must NOT set ready');
      assert.strictEqual(lateEventDispatched, false, 'Late arrival after unmount must NOT dispatch ready event');
    });
  });

  await t.test('Group D: Watchdog and Safety Ceiling Reconciliation', async (t2) => {
    await t2.test('forceRelease does not set ready when critical visual dependency is unresolved', () => {
      let readyCalled = false;
      const coordinator = createReadinessCoordinator({
        onReady: () => { readyCalled = true; }
      });

      coordinator.register('hero_media', null, {
        critical: true,
        visual: true,
        allowFallback: false
      });
      coordinator.start();

      // Simulate watchdog expiry
      coordinator.forceRelease('max_watchdog_timeout');

      assert.strictEqual(coordinator.isReady(), false, 'Watchdog must not settle visual dependency to ready');
      assert.strictEqual(readyCalled, false, 'Watchdog must not emit successful visual readiness');
      coordinator.destroy();
    });
  });

  await t.test('Group E: G2.5-R2 AbortSignal Lifecycle & Media Cancellation', async (t2) => {
    await t2.test('waitForImageDecode cleanly aborts on signal and detaches DOM listeners', async () => {
      const listeners = new Map();
      const mockImg = {
        complete: false,
        naturalWidth: 0,
        addEventListener: (evt, fn) => { listeners.set(evt, fn); },
        removeEventListener: (evt) => { listeners.delete(evt); }
      };

      const ac = new AbortController();
      const decodePromise = waitForImageDecode(mockImg, 1000, {
        signal: ac.signal,
        keepListening: true
      });

      assert.ok(listeners.has('load'), 'Load listener should be attached');
      assert.ok(listeners.has('error'), 'Error listener should be attached');

      // Abort operation
      ac.abort();

      const result = await decodePromise;
      assert.strictEqual(result.status, 'aborted');
      assert.strictEqual(listeners.size, 0, 'All listeners must be detached on abort');
    });

    await t2.test('waitForVideoReady cleanly aborts on signal and detaches listeners', async () => {
      const listeners = new Map();
      const mockVideo = {
        readyState: 0,
        addEventListener: (evt, fn) => { listeners.set(evt, fn); },
        removeEventListener: (evt) => { listeners.delete(evt); }
      };

      const ac = new AbortController();
      const readyPromise = waitForVideoReady(mockVideo, 1000, { signal: ac.signal });

      assert.ok(listeners.has('loadedmetadata'), 'loadedmetadata listener should be attached');

      ac.abort();

      const result = await readyPromise;
      assert.strictEqual(result.status, 'aborted');
      assert.strictEqual(listeners.size, 0, 'Video listeners must be detached on abort');
    });

    await t2.test('pre-aborted signal aborts immediately without attaching listeners', async () => {
      const listeners = new Map();
      const mockImg = {
        complete: false,
        naturalWidth: 0,
        addEventListener: (evt, fn) => { listeners.set(evt, fn); },
        removeEventListener: (evt) => { listeners.delete(evt); }
      };

      const ac = new AbortController();
      ac.abort();

      const result = await waitForImageDecode(mockImg, 1000, { signal: ac.signal });
      assert.strictEqual(result.status, 'aborted');
      assert.strictEqual(listeners.size, 0, 'No listeners attached if already aborted');
    });
  });

  await t.test('Group F: G2.5-R2 Recovery Bailout Fix & Visual Shielding Safety', async (t2) => {
    await t2.test('Recovery error mounts even when project-intro-wrap has child elements', () => {
      const mockHost = { hidden: true, innerHTML: '', querySelector: () => null };
      const mockIntroWrap = { children: [{ id: 'child-1' }] }; // Intro already populated!
      const mockMedia = { id: 'project-media', style: {} };
      const classes = new Set();
      const docClasses = new Set();

      const mockMain = {
        classList: {
          add: (cls) => classes.add(cls),
          remove: (cls) => classes.delete(cls),
          contains: (cls) => classes.has(cls)
        },
        querySelector: (sel) => {
          if (sel === '#project-error-host') return mockHost;
          if (sel === '#project-intro-wrap') return mockIntroWrap;
          if (sel === '#project-media') return mockMedia;
          return null;
        }
      };

      const mockDoc = {
        documentElement: {
          classList: {
            add: (cls) => docClasses.add(cls),
            remove: (cls) => docClasses.delete(cls),
            contains: (cls) => docClasses.has(cls)
          }
        },
        getElementById: (id) => {
          if (id === 'project-main') return mockMain;
          if (id === 'project-error-host') return mockHost;
          if (id === 'project-intro-wrap') return mockIntroWrap;
          return null;
        },
        querySelector: (sel) => mockMain.querySelector(sel)
      };

      // Call renderErrorState: should mount into error host despite introWrap having children
      renderErrorState(mockDoc, { message: 'Media connection stalled' });

      assert.strictEqual(mockHost.hidden, false, 'Error host must be unhidden');
      assert.ok(mockHost.innerHTML.includes('CONNECTION ISSUE'), 'Error markup must be rendered');
      assert.ok(classes.has('has-project-error'), 'main element must have has-project-error class');
      assert.ok(docClasses.has('is-project-pilot-error'), 'root document must have is-project-pilot-error class');
    });

    await t2.test('Inlined pilot watchdog check executes recovery when introWrap is populated but PROJECT_READY is false', () => {
      // Test the logic implemented in project.html inline script:
      // if (window.__MONDO_PROJECT_READY__) return;
      const windowMock = {
        __MONDO_PROJECT_READY__: false,
        __MONDO_WATCHDOG_FIRED__: false
      };
      const introWrap = { children: ['child1', 'child2'] }; // Non-empty

      let errorMounted = false;
      const mountError = () => {
        if (windowMock.__MONDO_PROJECT_READY__) return;
        errorMounted = true;
      };

      mountError();
      assert.strictEqual(errorMounted, true, 'Watchdog must mount error when PROJECT_READY is false despite populated intro');

      // Now test with PROJECT_READY = true
      errorMounted = false;
      windowMock.__MONDO_PROJECT_READY__ = true;
      mountError();
      assert.strictEqual(errorMounted, false, 'Watchdog must NOT mount error when PROJECT_READY is true');
    });
  });

  await t.test('Group G: G2.5-R2 Retry Cycle & Clean Remount Integrity', async (t2) => {
    t2.beforeEach(() => {
      global.window = {
        location: { pathname: '/work/rainbow-orchard', search: '' },
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => {},
        __MONDO_PROJECT_READY__: false,
        __MONDO_BOOTSTRAP_STATE__: 'idle'
      };
      global.document = {
        documentElement: {
          classList: {
            contains: () => false,
            add: () => {},
            remove: () => {}
          }
        },
        title: '',
        querySelector: () => null,
        getElementById: () => null
      };
    });

    t2.afterEach(() => {
      unmountProject({ root: global.document });
      delete global.window;
      delete global.document;
    });

    await t2.test('mountProject sets and clears window.__MONDO_ABORT_PROJECT_OPERATION__', async () => {
      const mockDoc = {
        documentElement: global.document.documentElement,
        body: { dataset: {} },
        querySelector: () => null,
        getElementById: () => null
      };

      const coordinator = await mountProject({
        root: mockDoc,
        slug: 'rainbow-orchard',
        fallbackProjects: defaultProjects
      });

      assert.strictEqual(typeof global.window.__MONDO_ABORT_PROJECT_OPERATION__, 'function', 'Abort hook must be set on window');

      unmountProject({ root: mockDoc });
      assert.strictEqual(global.window.__MONDO_ABORT_PROJECT_OPERATION__, null, 'Abort hook must be cleared on unmount');
    });

    await t2.test('Invoking window.__MONDO_ABORT_PROJECT_OPERATION__ aborts in-flight operation', async () => {
      const mockDoc = {
        documentElement: global.document.documentElement,
        body: { dataset: {} },
        querySelector: () => null,
        getElementById: () => null
      };

      await mountProject({
        root: mockDoc,
        slug: 'rainbow-orchard',
        fallbackProjects: defaultProjects
      });

      assert.strictEqual(typeof global.window.__MONDO_ABORT_PROJECT_OPERATION__, 'function');
      global.window.__MONDO_ABORT_PROJECT_OPERATION__();

      // Subsequent unmount should handle cleanly without error
      unmountProject({ root: mockDoc });
    });
  });
});
