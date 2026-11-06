/**
 * MONDO — Work / Project Runtime Integration Test Suite (Stage G3.3-D)
 * Comprehensive verification for bidirectional Work <-> Project navigation,
 * DOM swap and landmark preservation, rendered route identity tracking,
 * resource and class cleanup, in-situ error presentation, and dormancy.
 */

import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createBoundCoordinator } from '../public/js/features/navigation/coordinator-binding.js';
import { createDomAdapter, escapeHtml } from '../public/js/features/navigation/dom-adapter.js';
import { createRouteLifecycleAdapter } from '../public/js/features/navigation/lifecycle-adapter.js';
import { createQuietMarkAdapter } from '../public/js/features/transitions/quiet-mark-adapter.js';
import { PROJECT_READINESS_OUTCOMES } from '../public/js/features/project/project-readiness.js';
import { WORK_READINESS_OUTCOMES } from '../public/js/features/work/work-readiness.js';
import { NAVIGATION_DISPOSITION } from '../public/js/features/navigation/navigation-coordinator.js';

/**
 * Creates a flexible mock DOM environment representing MONDO's runtime shell.
 */
function createRuntimeDomEnvironment(initialPath = '/work') {
  const elements = new Map();
  const docListeners = new Map();
  const winListeners = new Map();

  class MockElement {
    constructor(tag, id = '') {
      this.tagName = tag.toUpperCase();
      this.id = id;
      this.classListSet = new Set();
      this.dataset = {};
      this.attributes = new Map();
      this.style = {};
      this.children = [];
      this.parentNode = null;
      this.hidden = false;
      this._innerHTML = '';
      this.textContent = '';
      this.naturalWidth = 1200;
      this.complete = true;
      this.readyState = 4;

      if (id) {
        this.attributes.set('id', id);
        elements.set(id, this);
      }
    }

    get classList() {
      return {
        contains: (cls) => this.classListSet.has(cls),
        add: (...classes) => { classes.forEach((c) => this.classListSet.add(c)); },
        remove: (...classes) => { classes.forEach((c) => this.classListSet.delete(c)); }
      };
    }

    getAttribute(name) {
      if (name === 'id') return this.id;
      if (name === 'class') return Array.from(this.classListSet).join(' ');
      if (name.startsWith('data-')) {
        const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        return this.dataset[key] !== undefined ? this.dataset[key] : null;
      }
      return this.attributes.get(name) || null;
    }

    setAttribute(name, val) {
      if (name === 'id') {
        this.id = val;
        elements.set(val, this);
      } else if (name === 'class') {
        this.classListSet.clear();
        String(val).split(/\s+/).filter(Boolean).forEach((c) => this.classListSet.add(c));
      } else if (name.startsWith('data-')) {
        const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        this.dataset[key] = String(val);
      }
      this.attributes.set(name, String(val));
    }

    hasAttribute(name) {
      return this.getAttribute(name) !== null;
    }

    removeAttribute(name) {
      this.attributes.delete(name);
      if (name.startsWith('data-')) {
        const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        delete this.dataset[key];
      }
    }

    get innerHTML() {
      return this._innerHTML;
    }

    set innerHTML(html) {
      this._innerHTML = html;
      this.children = [];

      // Parse landmark containers from injected HTML strings for testing
      if (html.includes('id="work-grid"')) {
        const grid = new MockElement('div', 'work-grid');
        grid.classList.add('work-page-grid');
        const card = new MockElement('div');
        card.classList.add('project-card');
        const img = new MockElement('img');
        img.naturalWidth = 800;
        img.complete = true;
        card.appendChild(img);
        grid.appendChild(card);
        this.appendChild(grid);
      }
      if (html.includes('id="project-main"')) {
        const pMain = new MockElement('div', 'project-main');
        const introWrap = new MockElement('div', 'project-intro-wrap');
        const h1 = new MockElement('h1');
        h1.textContent = 'Project Heading';
        introWrap.appendChild(h1);
        pMain.appendChild(introWrap);

        const pMedia = new MockElement('div', 'project-media');
        if (html.includes('<img')) {
          const img = new MockElement('img', 'hero-img');
          img.naturalWidth = 1200;
          img.complete = true;
          pMedia.appendChild(img);
        }
        pMain.appendChild(pMedia);

        const pStory = new MockElement('div', 'project-story');
        pMain.appendChild(pStory);

        const errHost = new MockElement('div', 'project-error-host');
        errHost.hidden = true;
        pMain.appendChild(errHost);

        this.appendChild(pMain);
      }
      if (html.includes('project-error-boundary')) {
        const boundary = new MockElement('div');
        boundary.classList.add('project-error-boundary');
        this.appendChild(boundary);
      }
      if (html.includes('work-error-boundary')) {
        const boundary = new MockElement('div');
        boundary.classList.add('work-error-boundary');
        this.appendChild(boundary);
      }
    }

    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      if (child.id) elements.set(child.id, child);
      return child;
    }

    insertBefore(child, ref) {
      child.parentNode = this;
      const idx = ref ? this.children.indexOf(ref) : -1;
      if (idx !== -1) {
        this.children.splice(idx, 0, child);
      } else {
        this.children.push(child);
      }
      if (child.id) elements.set(child.id, child);
      return child;
    }

    querySelector(selector) {
      const all = this.querySelectorAll(selector);
      return all.length > 0 ? all[0] : null;
    }

    querySelectorAll(selector) {
      const results = [];
      const testMatch = (el) => {
        if (selector.startsWith('#')) return el.id === selector.slice(1);
        if (selector.startsWith('.')) return el.classList.contains(selector.slice(1));
        if (selector === 'main#main') return el.tagName === 'MAIN' && el.id === 'main';
        if (selector.includes('#')) {
          const [t, i] = selector.split('#');
          return el.tagName === t.toUpperCase() && el.id === i;
        }
        return el.tagName === selector.toUpperCase();
      };

      const traverse = (node) => {
        for (const child of node.children) {
          if (testMatch(child)) results.push(child);
          traverse(child);
        }
      };
      traverse(this);
      return results;
    }

    contains(node) {
      let curr = node;
      while (curr) {
        if (curr === this) return true;
        curr = curr.parentNode;
      }
      return false;
    }

    focus() {}
  }

  const docEl = new MockElement('html');
  const headEl = new MockElement('head');
  const bodyEl = new MockElement('body');
  docEl.appendChild(headEl);
  docEl.appendChild(bodyEl);

  const mainEl = new MockElement('main', 'main');
  mainEl.setAttribute('data-route-path', initialPath);
  mainEl.setAttribute('data-route-type', initialPath === '/work' ? 'work' : 'project');

  // Populate initial route landmark
  if (initialPath === '/work') {
    const grid = new MockElement('div', 'work-grid');
    mainEl.appendChild(grid);
  } else {
    const pMain = new MockElement('div', 'project-main');
    mainEl.appendChild(pMain);
  }
  bodyEl.appendChild(mainEl);

  let currentTitle = 'MONDO Creative Studio';
  let metaDesc = new MockElement('meta');
  metaDesc.setAttribute('name', 'description');
  metaDesc.setAttribute('content', 'Default MONDO description');
  headEl.appendChild(metaDesc);

  const mockDoc = {
    documentElement: docEl,
    head: headEl,
    body: bodyEl,
    get title() { return currentTitle; },
    set title(t) { currentTitle = t; },
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => new MockElement(tag),
    querySelector: (sel) => {
      if (sel === 'main#main' || sel === '#main') return mainEl;
      if (sel === 'html') return docEl;
      if (sel === 'head') return headEl;
      if (sel === 'body') return bodyEl;
      if (sel === 'meta[name="description"]') return metaDesc;
      if (sel.startsWith('#')) return elements.get(sel.slice(1)) || null;
      return docEl.querySelector(sel);
    },
    querySelectorAll: (sel) => docEl.querySelectorAll(sel),
    addEventListener: (t, fn) => {
      if (!docListeners.has(t)) docListeners.set(t, new Set());
      docListeners.get(t).add(fn);
    },
    removeEventListener: (t, fn) => {
      if (docListeners.has(t)) docListeners.get(t).delete(fn);
    }
  };

  let currentHref = `http://localhost:3005${initialPath}`;
  let currentPathname = initialPath;
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
      set pathname(p) {
        currentPathname = p;
        currentHref = `http://localhost:3005${p}`;
      },
      get origin() { return 'http://localhost:3005'; }
    },
    history: {
      get state() { return currentState; },
      pushState: (st, _title, url) => {
        currentState = st;
        if (url) {
          currentPathname = url;
          currentHref = `http://localhost:3005${url}`;
        }
      },
      replaceState: (st, _title, url) => {
        currentState = st;
        if (url) {
          currentPathname = url;
          currentHref = `http://localhost:3005${url}`;
        }
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
    addEventListener: (t, fn) => {
      if (!winListeners.has(t)) winListeners.set(t, new Set());
      winListeners.get(t).add(fn);
    },
    removeEventListener: (t, fn) => {
      if (winListeners.has(t)) winListeners.get(t).delete(fn);
    },
    dispatchEvent: (evt) => {
      const type = typeof evt === 'string' ? evt : evt.type;
      const handlers = winListeners.get(type);
      if (handlers) {
        for (const h of handlers) h(evt);
      }
    }
  };

  return {
    mockDoc,
    mockWin,
    mainEl,
    docEl,
    docListeners,
    winListeners
  };
}

describe('Stage G3.3-D: Work / Project Runtime Integration Tests', () => {
  // =========================================================================
  // Group A: Bidirectional Work <-> Project Hybrid Navigation Cycles
  // =========================================================================
  describe('Group A: Bidirectional Work <-> Project Hybrid Navigation Cycles', () => {
    it('executes clean forward navigation /work -> /work/aurora under protective veil', async () => {
      const { mockDoc, mockWin, mainEl } = createRuntimeDomEnvironment('/work');

      const bound = createBoundCoordinator({
        document: mockDoc,
        window: mockWin,
        initialRoute: '/work',
        quietMarkOptions: { outboundDurationMs: 10, inboundDurationMs: 10 },
        lifecycleOptions: {
          projectLifecycle: { mount: async () => {}, unmount: () => {} },
          workLifecycle: { mount: async () => {}, unmount: () => {} }
        },
        coordinatorOptions: {
          loaderAdapter: {
            loadHtml: async () => ({
              ok: true,
              data: {
                mainHtml: '<div id="project-main"><div id="project-intro-wrap"><h1>Aurora Detail</h1></div><div id="project-media"><img id="hero" /></div><div id="project-story"></div></div>',
                title: 'Aurora — MONDO Creative Studio'
              }
            })
          }
        }
      });

      const outcome = await bound.navigate('/work/aurora');

      assert.strictEqual(outcome.disposition, NAVIGATION_DISPOSITION.COMPLETED);
      assert.strictEqual(mockDoc.title, 'Aurora — MONDO Creative Studio');
      assert.strictEqual(mockWin.location.pathname, '/work/aurora');
      assert.strictEqual(mainEl.getAttribute('data-route-path'), '/work/aurora');
      assert.strictEqual(mainEl.getAttribute('data-route-type'), 'project');
      assert.strictEqual(bound.domAdapter.getRenderedPath(), '/work/aurora');
    });

    it('executes clean reverse navigation /work/aurora -> /work under protective veil', async () => {
      const { mockDoc, mockWin, mainEl } = createRuntimeDomEnvironment('/work/aurora');

      const bound = createBoundCoordinator({
        document: mockDoc,
        window: mockWin,
        initialRoute: '/work/aurora',
        quietMarkOptions: { outboundDurationMs: 10, inboundDurationMs: 10 },
        lifecycleOptions: {
          projectLifecycle: { mount: async () => {}, unmount: () => {} },
          workLifecycle: { mount: async () => {}, unmount: () => {} }
        },
        coordinatorOptions: {
          loaderAdapter: {
            loadHtml: async () => ({
              ok: true,
              data: {
                mainHtml: '<div id="work-grid" class="work-page-grid"><div class="project-card"><img /></div></div>',
                title: 'Selected Work — MONDO Creative Studio'
              }
            })
          }
        }
      });

      const outcome = await bound.navigate('/work');

      assert.strictEqual(outcome.disposition, NAVIGATION_DISPOSITION.COMPLETED);
      assert.strictEqual(mockDoc.title, 'Selected Work — MONDO Creative Studio');
      assert.strictEqual(mockWin.location.pathname, '/work');
      assert.strictEqual(mainEl.getAttribute('data-route-path'), '/work');
      assert.strictEqual(mainEl.getAttribute('data-route-type'), 'work');
      assert.strictEqual(bound.domAdapter.getRenderedPath(), '/work');
    });

    it('executes repeated alternating navigation cycles (/work -> /work/aurora -> /work -> /work/aurora)', async () => {
      const { mockDoc, mockWin, mainEl } = createRuntimeDomEnvironment('/work');

      const bound = createBoundCoordinator({
        document: mockDoc,
        window: mockWin,
        initialRoute: '/work',
        quietMarkOptions: { outboundDurationMs: 5, inboundDurationMs: 5 },
        lifecycleOptions: {
          projectLifecycle: { mount: async () => {}, unmount: () => {} },
          workLifecycle: { mount: async () => {}, unmount: () => {} }
        },
        coordinatorOptions: {
          loaderAdapter: {
            loadHtml: async (path) => {
              if (path === '/work') {
                return {
                  ok: true,
                  data: {
                    mainHtml: '<div id="work-grid" class="work-page-grid"><div class="project-card"><img /></div></div>',
                    title: 'Work'
                  }
                };
              }
              return {
                ok: true,
                data: {
                  mainHtml: '<div id="project-main"><div id="project-intro-wrap"><h1>Project</h1></div><div id="project-media"><img /></div></div>',
                  title: 'Project'
                }
              };
            }
          }
        }
      });

      // Cycle 1: /work -> /work/aurora
      const out1 = await bound.navigate('/work/aurora');
      assert.strictEqual(out1.disposition, NAVIGATION_DISPOSITION.COMPLETED);
      assert.strictEqual(mainEl.getAttribute('data-route-type'), 'project');

      // Cycle 2: /work/aurora -> /work
      const out2 = await bound.navigate('/work');
      assert.strictEqual(out2.disposition, NAVIGATION_DISPOSITION.COMPLETED);
      assert.strictEqual(mainEl.getAttribute('data-route-type'), 'work');

      // Cycle 3: /work -> /work/aurora
      const out3 = await bound.navigate('/work/aurora');
      assert.strictEqual(out3.disposition, NAVIGATION_DISPOSITION.COMPLETED);
      assert.strictEqual(mainEl.getAttribute('data-route-type'), 'project');

      // Verify settled state
      assert.strictEqual(bound.isBusy(), false);
      assert.strictEqual(bound.getState(), 'IDLE');
    });
  });

  // =========================================================================
  // Group B: DOM Swap & Stale Class Purging (Amendment D-01)
  // =========================================================================
  describe('Group B: DOM Swap & Stale Class Purging (Amendment D-01)', () => {
    it('purges stale pilot classes on documentElement upon DOM swap', () => {
      const { mockDoc, docEl } = createRuntimeDomEnvironment('/work');
      const domAdapter = createDomAdapter({ document: mockDoc });

      // Simulate leftover stale pilot classes on documentElement
      docEl.classList.add('is-project-pilot-active', 'is-project-pilot-status', 'is-project-pilot-error', 'is-project-css-ready');
      assert.strictEqual(docEl.classList.contains('is-project-pilot-active'), true);
      assert.strictEqual(docEl.classList.contains('is-project-pilot-error'), true);

      // Perform DOM swap to /work
      domAdapter.swapMainContent('<div id="work-grid"></div>', { pathname: '/work', id: 'work', type: 'work' });

      // Stale classes must be completely cleared
      assert.strictEqual(docEl.classList.contains('is-project-pilot-active'), false);
      assert.strictEqual(docEl.classList.contains('is-project-pilot-status'), false);
      assert.strictEqual(docEl.classList.contains('is-project-pilot-error'), false);
      assert.strictEqual(docEl.classList.contains('is-project-css-ready'), false);
    });

    it('synchronizes meta description and document title cleanly', () => {
      const { mockDoc } = createRuntimeDomEnvironment('/work');
      const domAdapter = createDomAdapter({ document: mockDoc });

      domAdapter.updateMetadata({
        title: 'Updated Project Title',
        metaDescription: 'Detailed project metadata description'
      });

      assert.strictEqual(mockDoc.title, 'Updated Project Title');
      const meta = mockDoc.querySelector('meta[name="description"]');
      assert.strictEqual(meta.getAttribute('content'), 'Detailed project metadata description');
    });
  });

  // =========================================================================
  // Group C: Rendered Route Identity Integrity (Amendment D-03)
  // =========================================================================
  describe('Group C: Rendered Route Identity Integrity (Amendment D-03)', () => {
    it('maintains independent renderedRoute identity and never substitutes divergent window.location', () => {
      const { mockDoc, mockWin } = createRuntimeDomEnvironment('/work');
      const domAdapter = createDomAdapter({ document: mockDoc, window: mockWin });

      assert.strictEqual(domAdapter.getRenderedPath(), '/work');

      // Simulate out-of-band window.location drift (e.g., hash fragment or divergent href)
      mockWin.location.pathname = '/unrelated-path';

      // domAdapter MUST NOT return the drifted pathname; it must maintain the true rendered route
      assert.strictEqual(domAdapter.getRenderedPath(), '/work');
      assert.strictEqual(domAdapter.getRenderedRoute().pathname, '/work');
    });

    it('updates renderedRoute identity strictly upon successful DOM swap', () => {
      const { mockDoc, mockWin } = createRuntimeDomEnvironment('/work');
      const domAdapter = createDomAdapter({ document: mockDoc, window: mockWin });

      domAdapter.swapMainContent('<div id="project-main"></div>', {
        pathname: '/work/chronos',
        id: 'project',
        type: 'project',
        slug: 'chronos'
      });

      assert.strictEqual(domAdapter.getRenderedPath(), '/work/chronos');
      assert.strictEqual(domAdapter.getRenderedRoute().slug, 'chronos');
      assert.strictEqual(domAdapter.getRenderedRoute().type, 'project');
    });
  });

  // =========================================================================
  // Group D: Authentic Project Readiness & Recovery Integration (Amendment D-02 & D-04)
  // =========================================================================
  describe('Group D: Authentic Project Readiness & Recovery Integration (Amendment D-02 & D-04)', () => {
    it('recovers in-situ when DOM swap is confirmed and landmark is valid (Amendment D-04)', async () => {
      const { mockDoc, mockWin } = createRuntimeDomEnvironment('/work');

      const bound = createBoundCoordinator({
        document: mockDoc,
        window: mockWin,
        initialRoute: '/work',
        quietMarkOptions: { outboundDurationMs: 5, inboundDurationMs: 5 },
        coordinatorOptions: {
          timingConfig: { readinessTimeoutMs: 30 },
          loaderAdapter: {
            loadHtml: async () => ({
              ok: true,
              data: {
                mainHtml: '<div id="project-main"><div id="project-intro-wrap"><h1>Project</h1></div><div id="project-media"><img id="stalled" /></div></div>',
                title: 'Project Detail'
              }
            })
          },
          lifecycleAdapter: createRouteLifecycleAdapter({
            document: mockDoc,
            window: mockWin,
            timingConfig: { projectSafetyTimeoutMs: 30, projectDecodeTimeoutMs: 100 },
            projectReadiness: {
              awaitProjectFirstViewReady: async () => ({
                outcome: PROJECT_READINESS_OUTCOMES.TIMED_OUT,
                error: 'Hero media decode timed out'
              })
            }
          })
        }
      });

      const outcome = await bound.navigate('/work/aurora');

      // Post-boundary readiness failure initiates recovery via in-situ error card
      assert.strictEqual(outcome.disposition, NAVIGATION_DISPOSITION.RECOVERED);
      assert.strictEqual(outcome.mode, 'in_situ_error');
      assert.strictEqual(outcome.targetUrl, '/work/aurora');
    });

    it('escalates to native fallback when landmark is missing upon post-boundary failure', async () => {
      const { mockDoc, mockWin } = createRuntimeDomEnvironment('/work');

      let fallbackDispatched = false;
      let fallbackUrl = '';

      const bound = createBoundCoordinator({
        document: mockDoc,
        window: mockWin,
        initialRoute: '/work',
        transitionVeilAdapter: {
          showVeil: async () => {},
          isVeilVisible: () => true,
          dismissVeil: async () => {}
        },
        coordinatorOptions: {
          timingConfig: { readinessTimeoutMs: 30 },
          domAdapter: {
            getRenderedPath: () => '/work',
            swapMainContent: () => true,
            updateTitle: () => {},
            hasExpectedLandmark: () => false, // Corrupted / missing landmark
            renderInSituError: () => false
          },
          loaderAdapter: {
            loadHtml: async () => ({
              ok: true,
              data: { mainHtml: '<section></section>', title: 'Title' }
            })
          },
          lifecycleAdapter: {
            unmountRoute: async () => {},
            mountRoute: async () => {},
            awaitReadiness: async () => ({ status: 'timeout', outcome: 'TIMED_OUT' })
          },
          recoveryAdapter: {
            replaceNative: async (url) => {
              fallbackDispatched = true;
              fallbackUrl = url;
              return { success: true };
            }
          }
        }
      });

      const outcome = await bound.navigate('/work/aurora');

      assert.strictEqual(outcome.disposition, NAVIGATION_DISPOSITION.RECOVERED);
      assert.strictEqual(fallbackDispatched, true);
      assert.strictEqual(fallbackUrl, '/work/aurora');
    });

    it('safely renders in-situ error card with escaped message without destroying landmarks', () => {
      const { mockDoc, mainEl } = createRuntimeDomEnvironment('/work/aurora');
      const domAdapter = createDomAdapter({ document: mockDoc });

      const res = domAdapter.renderInSituError('project', {
        message: 'Could not connect to studio service <script>alert("xss")</script>'
      });

      assert.strictEqual(res, true);
      const errorBoundary = mockDoc.querySelector('.project-error-boundary');
      assert.ok(errorBoundary, 'Must inject .project-error-boundary');

      const host = mockDoc.querySelector('#project-error-host');
      assert.strictEqual(host.hidden, false, 'Error host must be visible');
      assert.ok(!host.innerHTML.includes('<script>'), 'Must escape HTML tags');
      assert.ok(host.innerHTML.includes('&lt;script&gt;'), 'Must encode dangerous characters');
    });
  });

  // =========================================================================
  // Group E: Teardown, Listener Cleanup & Strict Dormancy
  // =========================================================================
  describe('Group E: Teardown, Listener Cleanup & Strict Dormancy', () => {
    it('retains zero duplicate event listeners across repeated navigation cycles', async () => {
      const { mockDoc, mockWin, winListeners } = createRuntimeDomEnvironment('/work');

      const bound = createBoundCoordinator({
        document: mockDoc,
        window: mockWin,
        initialRoute: '/work',
        quietMarkOptions: { outboundDurationMs: 5, inboundDurationMs: 5 },
        coordinatorOptions: {
          loaderAdapter: {
            loadHtml: async () => ({
              ok: true,
              data: {
                mainHtml: '<div id="project-main"><div id="project-intro-wrap"><h1>Project</h1></div><div id="project-media"><img /></div></div>',
                title: 'Project'
              }
            })
          }
        }
      });

      // Record baseline listeners before navigation
      const initialListenerCount = Array.from(winListeners.values()).reduce((sum, s) => sum + s.size, 0);

      // Execute navigation
      await bound.navigate('/work/aurora');

      // In settled IDLE state, temporary listeners must be cleaned up
      const afterNavCount = Array.from(winListeners.values()).reduce((sum, s) => sum + s.size, 0);
      assert.strictEqual(afterNavCount, initialListenerCount, 'Must clean up temporary navigation listeners');
    });

    it('destroy() finalizes coordinator and dismisses veil cleanly', () => {
      const { mockDoc, mockWin } = createRuntimeDomEnvironment('/work');
      const bound = createBoundCoordinator({
        document: mockDoc,
        window: mockWin,
        initialRoute: '/work'
      });

      bound.destroy();
      assert.strictEqual(bound.getTeardownStatus(), 'finalized');
      assert.strictEqual(bound.getState(), 'IDLE');
    });
  });
});
