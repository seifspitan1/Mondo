/**
 * MONDO Route Lifecycle & First-View Readiness Contracts Test Suite
 * Phase 5C Stage G1
 *
 * Validates:
 * - Module exports and canonical mount/unmount aliases across all routes
 * - First-view readiness contracts (videos, fonts, background images, route manifests)
 * - Group A: Basic Initialization & Idempotency
 * - Group B: Async Safety & Stale Request Invalidation
 * - Group C: Route-Specific Functionality across Remounts
 * - Group D: Historical Phase 5C Preservation (D23-D30, G1 geometry, D24 prefetch)
 * - Group E: Negative Cases (no duplicate submissions, detached listeners, timer safety)
 *
 * Uses Node's built-in test runner (node:test) and assert/strict.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

// Readiness & Contracts
import {
  STATES,
  DEP_STATES,
  waitForVideoFirstFrame,
  waitForFontsReady,
  waitForBackgroundImages,
  ROUTE_READINESS_CONTRACTS,
  getRouteReadinessContract
} from '../public/js/shared/readiness.js';

// Route Modules
import * as homeEntry from '../public/js/home.js';
import * as workEntry from '../public/js/work.js';
import * as startEntry from '../public/js/start.js';
import * as projectEntry from '../public/js/project.js';

import { mountHome, unmountHome } from '../public/js/features/home/home-page.js';
import { mountWork, unmountWork } from '../public/js/features/work/work-page.js';
import { mountEnquiry, unmountEnquiry } from '../public/js/features/enquiry/enquiry-form.js';
import { mountProject, unmountProject } from '../public/js/features/project/project-page.js';
import { defaultProjects, defaultSettings } from '../public/js/shared/defaults.js';

const ROOT = resolve('.');
const PUBLIC = join(ROOT, 'public');

function readPublicFile(relPath) {
  return readFileSync(join(PUBLIC, relPath), 'utf-8');
}

// ========================================================================
// DOM & Environment Mock Utilities
// ========================================================================

function matchesSingle(el, sel) {
  sel = sel.trim();
  if (sel.startsWith('#')) return el.id === sel.slice(1);
  if (sel.startsWith('.')) return el.classList && el.classList.contains(sel.slice(1));
  if (sel.startsWith('[') && sel.endsWith(']')) {
    const inner = sel.slice(1, -1);
    const eqIdx = inner.indexOf('=');
    if (eqIdx !== -1) {
      const k = inner.slice(0, eqIdx).trim();
      const v = inner.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
      return el.getAttribute && el.getAttribute(k) === v;
    }
    return el.hasAttribute && el.hasAttribute(inner);
  }
  return el.tagName && el.tagName.toLowerCase() === sel.toLowerCase();
}

function matchesSelector(el, sel) {
  const parts = sel.trim().split(/\s+/);
  if (parts.length === 1) return matchesSingle(el, parts[0]);
  if (!matchesSingle(el, parts[parts.length - 1])) return false;
  let curr = el.parentNode;
  let i = parts.length - 2;
  while (curr && i >= 0) {
    if (matchesSingle(curr, parts[i])) {
      i--;
    }
    curr = curr.parentNode;
  }
  return i < 0;
}

function querySelectorAllDeep(root, selector) {
  const results = [];
  function walk(node) {
    if (!node || !node.children) return;
    for (const child of node.children) {
      if (matchesSelector(child, selector)) {
        results.push(child);
      }
      walk(child);
    }
  }
  walk(root);
  return results;
}

function createMockElement(tagName, attrs = {}) {
  const listeners = {};
  const dataset = {};
  const classListSet = new Set();
  const children = [];
  let _innerHTML = '';
  let _textContent = '';
  let _value = attrs.value || '';
  let _checked = Boolean(attrs.checked);

  const el = {
    tagName: tagName.toUpperCase(),
    dataset,
    children,
    parentNode: null,
    style: {},
    disabled: Boolean(attrs.disabled),

    get value() { return _value; },
    set value(v) { _value = String(v); },

    get checked() { return _checked; },
    set checked(v) { _checked = Boolean(v); },

    getAttribute(name) {
      if (name === 'class') return Array.from(classListSet).join(' ');
      if (name.startsWith('data-')) return dataset[name.slice(5)];
      return attrs[name] !== undefined ? attrs[name] : null;
    },
    setAttribute(name, val) {
      if (name === 'class') {
        classListSet.clear();
        String(val).split(/\s+/).filter(Boolean).forEach((c) => classListSet.add(c));
      } else if (name.startsWith('data-')) {
        dataset[name.slice(5)] = String(val);
      } else {
        attrs[name] = String(val);
      }
    },
    removeAttribute(name) {
      if (name === 'class') classListSet.clear();
      else if (name.startsWith('data-')) delete dataset[name.slice(5)];
      else delete attrs[name];
    },
    hasAttribute(name) {
      if (name === 'class') return classListSet.size > 0;
      if (name.startsWith('data-')) return dataset[name.slice(5)] !== undefined;
      return attrs[name] !== undefined;
    },
    classList: {
      add(...classes) { classes.forEach((c) => classListSet.add(c)); },
      remove(...classes) { classes.forEach((c) => classListSet.delete(c)); },
      contains(c) { return classListSet.has(c); },
      toggle(c, force) {
        if (force === true) classListSet.add(c);
        else if (force === false) classListSet.delete(c);
        else if (classListSet.has(c)) classListSet.delete(c);
        else classListSet.add(c);
      }
    },
    get id() { return attrs.id || ''; },
    set id(val) { attrs.id = val; },

    get innerHTML() { return _innerHTML; },
    set innerHTML(val) { _innerHTML = val; },

    get textContent() { return _textContent; },
    set textContent(val) { _textContent = val; },

    addEventListener(evt, handler) {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push(handler);
    },
    removeEventListener(evt, handler) {
      if (!listeners[evt]) return;
      listeners[evt] = listeners[evt].filter((h) => h !== handler);
    },
    getListenerCount(evt) {
      return (listeners[evt] || []).length;
    },
    dispatchEvent(evt) {
      const type = typeof evt === 'string' ? evt : evt.type;
      const handlers = (listeners[type] || []).slice();
      handlers.forEach((h) => h(evt));
    },
    click() {
      this.dispatchEvent({ type: 'click', target: this, preventDefault() {} });
    },
    appendChild(child) {
      child.parentNode = this;
      children.push(child);
      return child;
    },
    removeChild(child) {
      const idx = children.indexOf(child);
      if (idx !== -1) {
        children.splice(idx, 1);
        child.parentNode = null;
      }
      return child;
    },
    replaceWith(newNode) {
      if (this.parentNode) {
        const idx = this.parentNode.children.indexOf(this);
        if (idx !== -1) {
          this.parentNode.children[idx] = newNode;
          newNode.parentNode = this.parentNode;
          this.parentNode = null;
        }
      }
    },
    cloneNode(deep) {
      const clone = createMockElement(tagName, { ...attrs });
      Object.assign(clone.dataset, dataset);
      classListSet.forEach((c) => clone.classList.add(c));
      clone.innerHTML = _innerHTML;
      clone.textContent = _textContent;
      clone.value = _value;
      clone.checked = _checked;
      if (deep) {
        children.forEach((c) => clone.appendChild(c.cloneNode(true)));
      }
      return clone;
    },
    querySelector(selector) {
      return querySelectorAllDeep(this, selector)[0] || null;
    },
    querySelectorAll(selector) {
      return querySelectorAllDeep(this, selector);
    },
    focus() { this._focused = true; },
    scrollIntoView() {}
  };

  if (attrs.id) el.id = attrs.id;
  if (attrs.class) {
    String(attrs.class).split(/\s+/).filter(Boolean).forEach((c) => classListSet.add(c));
  }
  return el;
}

function createMockDocument() {
  const root = createMockElement('html');
  const body = createMockElement('body');
  root.appendChild(body);

  const doc = {
    documentElement: root,
    body,
    createElement(tag) {
      return createMockElement(tag);
    },
    getElementById(id) {
      return querySelectorAllDeep(root, `#${id}`)[0] || null;
    },
    querySelector(sel) {
      return querySelectorAllDeep(root, sel)[0] || null;
    },
    querySelectorAll(sel) {
      return querySelectorAllDeep(root, sel);
    },
    fonts: {
      ready: Promise.resolve()
    }
  };

  return doc;
}

function createMockWindow(customProps = {}) {
  const listeners = {};
  return {
    location: { pathname: '/', search: '' },
    __MONDO_PROJECT_READY__: false,
    __MONDO_BOOTSTRAP_STATE__: 'idle',
    __MONDO_WATCHDOG_FIRED__: false,
    addEventListener(evt, handler) {
      if (!listeners[evt]) listeners[evt] = [];
      listeners[evt].push(handler);
    },
    removeEventListener(evt, handler) {
      if (!listeners[evt]) return;
      listeners[evt] = listeners[evt].filter((h) => h !== handler);
    },
    dispatchEvent(evt) {
      const type = typeof evt === 'string' ? evt : evt.type;
      (listeners[type] || []).forEach((h) => h(evt));
    },
    ...customProps
  };
}

// ========================================================================
// SECTION 1: Route Lifecycle Contract Exports & Aliases
// ========================================================================

describe('Route Lifecycle Contract Exports & Aliases', () => {
  it('Home entry and feature module export canonical mount and unmount', () => {
    assert.equal(typeof homeEntry.mountHome, 'function');
    assert.equal(typeof homeEntry.unmountHome, 'function');
    assert.equal(typeof homeEntry.mount, 'function');
    assert.equal(typeof homeEntry.unmount, 'function');
    assert.equal(homeEntry.mount, homeEntry.mountHome);
    assert.equal(homeEntry.unmount, homeEntry.unmountHome);
  });

  it('Work entry and feature module export canonical mount and unmount', () => {
    assert.equal(typeof workEntry.mountWork, 'function');
    assert.equal(typeof workEntry.unmountWork, 'function');
    assert.equal(typeof workEntry.mount, 'function');
    assert.equal(typeof workEntry.unmount, 'function');
    assert.equal(workEntry.mount, workEntry.mountWork);
    assert.equal(workEntry.unmount, workEntry.unmountWork);
  });

  it('Start/Enquiry entry and feature module export canonical mount and unmount', () => {
    assert.equal(typeof startEntry.mountEnquiry, 'function');
    assert.equal(typeof startEntry.unmountEnquiry, 'function');
    assert.equal(typeof startEntry.mount, 'function');
    assert.equal(typeof startEntry.unmount, 'function');
    assert.equal(startEntry.mount, startEntry.mountEnquiry);
    assert.equal(startEntry.unmount, startEntry.unmountEnquiry);
  });

  it('Project entry and feature module export canonical mount and unmount', () => {
    assert.equal(typeof projectEntry.mountProject, 'function');
    assert.equal(typeof projectEntry.unmountProject, 'function');
    assert.equal(typeof projectEntry.mount, 'function');
    assert.equal(typeof projectEntry.unmount, 'function');
    assert.equal(projectEntry.mount, projectEntry.mountProject);
    assert.equal(projectEntry.unmount, projectEntry.unmountProject);
  });
});

// ========================================================================
// SECTION 2: Central Readiness Extensions & Contracts
// ========================================================================

describe('Central Readiness Extensions & Contracts', () => {
  it('STATES and DEP_STATES expose CANCELLED state', () => {
    assert.equal(STATES.CANCELLED, 'CANCELLED');
    assert.equal(DEP_STATES.CANCELLED, 'cancelled');
  });

  it('ROUTE_READINESS_CONTRACTS covers all independent public routes', () => {
    const routes = Object.keys(ROUTE_READINESS_CONTRACTS);
    assert.ok(routes.includes('/'), 'Missing / contract');
    assert.ok(routes.includes('/work'), 'Missing /work contract');
    assert.ok(routes.includes('/work/:slug'), 'Missing /work/:slug contract');
    assert.ok(routes.includes('/start'), 'Missing /start contract');
    assert.ok(routes.includes('/privacy'), 'Missing /privacy contract');

    for (const route of routes) {
      const contract = ROUTE_READINESS_CONTRACTS[route];
      assert.ok(contract.id, `Contract for ${route} missing id`);
      assert.ok(Array.isArray(contract.critical), `Contract for ${route} missing critical array`);
      assert.ok(Array.isArray(contract.optional), `Contract for ${route} missing optional array`);
    }
  });

  it('getRouteReadinessContract resolves static and dynamic routes with safe null fallback', () => {
    assert.equal(getRouteReadinessContract('/').id, 'home');
    assert.equal(getRouteReadinessContract('/work').id, 'work');
    assert.equal(getRouteReadinessContract('/work/rainbow-orchard').id, 'project');
    assert.equal(getRouteReadinessContract('/work/cat-battle').id, 'project');
    assert.equal(getRouteReadinessContract('/start').id, 'enquiry');
    assert.equal(getRouteReadinessContract('/privacy').id, 'privacy');
    assert.equal(getRouteReadinessContract('/unknown-page'), null);
  });

  it('waitForVideoFirstFrame resolves true visual frame readiness via readyState >= 2', async () => {
    const video = { readyState: 2 };
    const res = await waitForVideoFirstFrame(video, { timeoutMs: 50 });
    assert.equal(res.status, 'frame_ready');
  });

  it('waitForVideoFirstFrame supports poster image decode probe', async () => {
    const origImage = globalThis.Image;
    globalThis.Image = class {
      constructor() {
        this.src = '';
        this.complete = true;
        this.naturalWidth = 100;
      }
      async decode() {
        return undefined; // simulate instant decode
      }
      addEventListener(evt, fn) {
        if (evt === 'load') fn();
      }
      removeEventListener() {}
    };

    try {
      const video = { readyState: 0, poster: '/assets/sample-poster.webp' };
      const res = await waitForVideoFirstFrame(video, { timeoutMs: 100, checkPoster: true });
      assert.equal(res.status, 'poster_ready');
    } finally {
      globalThis.Image = origImage;
    }
  });

  it('waitForFontsReady gracefully resolves with document.fonts', async () => {
    const origDoc = globalThis.document;
    globalThis.document = {
      fonts: {
        ready: Promise.resolve()
      }
    };

    try {
      const res = await waitForFontsReady(100);
      assert.equal(res.status, 'ready');
    } finally {
      globalThis.document = origDoc;
    }
  });

  it('waitForBackgroundImages handles direct URLs and missing elements gracefully', async () => {
    const origImage = globalThis.Image;
    globalThis.Image = class {
      constructor() {
        this.src = '';
        this.complete = true;
        this.naturalWidth = 100;
      }
      async decode() {
        return undefined;
      }
      addEventListener(evt, fn) {
        if (evt === 'load') fn();
      }
      removeEventListener() {}
    };

    try {
      const res = await waitForBackgroundImages(['/assets/bg-test.webp'], 100);
      assert.equal(res.status, 'settled');
      assert.equal(res.count, 1);
    } finally {
      globalThis.Image = origImage;
    }
  });
});

// ========================================================================
// SECTION 3: Group A — Basic Route Initialization & Idempotency
// ========================================================================

describe('Group A: Basic Initialization & Idempotency', () => {
  it('mountHome initializes DOM and is strictly idempotent on duplicate mount', async () => {
    const doc = createMockDocument();
    const packagesGrid = createMockElement('div', { id: 'packages-grid' });
    const segContainer = createMockElement('div', { class: 'segmented' });
    const btnOneOff = createMockElement('button', { class: 'active' });
    const btnMonthly = createMockElement('button');
    segContainer.appendChild(btnOneOff);
    segContainer.appendChild(btnMonthly);

    doc.body.appendChild(packagesGrid);
    doc.body.appendChild(segContainer);

    // Initial mount
    await mountHome({ root: doc, fetchContent: async () => ({ settings: defaultSettings, projects: defaultProjects }) });
    assert.equal(doc.body.dataset.homeMounted, 'true');
    assert.ok(packagesGrid.innerHTML.length > 0, 'Packages must be rendered');
    assert.equal(btnOneOff.getListenerCount('click'), 1);

    // Duplicate mount without unmounting -> must be no-op
    await mountHome({ root: doc, fetchContent: async () => ({ settings: defaultSettings, projects: defaultProjects }) });
    assert.equal(btnOneOff.getListenerCount('click'), 1, 'Listeners must not be duplicated');

    // Unmount
    unmountHome({ root: doc });
    assert.equal(doc.body.dataset.homeMounted, undefined);

    // Remount after unmount
    await mountHome({ root: doc, fetchContent: async () => ({ settings: defaultSettings, projects: defaultProjects }) });
    assert.equal(doc.body.dataset.homeMounted, 'true');
  });

  it('mountWork initializes DOM and is strictly idempotent on duplicate mount', async () => {
    const doc = createMockDocument();
    const workGrid = createMockElement('div', { id: 'work-grid' });
    const projectCount = createMockElement('div', { id: 'project-count' });
    const filterList = createMockElement('div', { class: 'filter-list' });
    const btnAll = createMockElement('button', { 'data-filter': 'All', class: 'active' });
    const btnGames = createMockElement('button', { 'data-filter': 'Trailers' });
    filterList.appendChild(btnAll);
    filterList.appendChild(btnGames);

    doc.body.appendChild(workGrid);
    doc.body.appendChild(projectCount);
    doc.body.appendChild(filterList);

    // Initial mount
    await mountWork({ root: doc, fetchContent: async () => ({ projects: defaultProjects }) });
    assert.equal(doc.body.dataset.workMounted, 'true');
    assert.ok(workGrid.innerHTML.length > 0, 'Work grid must be populated');
    assert.equal(btnAll.getListenerCount('click'), 1);

    // Duplicate mount -> no duplicate listeners
    await mountWork({ root: doc, fetchContent: async () => ({ projects: defaultProjects }) });
    assert.equal(btnAll.getListenerCount('click'), 1);

    // Unmount
    unmountWork({ root: doc });
    assert.equal(doc.body.dataset.workMounted, undefined);

    // Remount
    await mountWork({ root: doc, fetchContent: async () => ({ projects: defaultProjects }) });
    assert.equal(doc.body.dataset.workMounted, 'true');
  });

  it('mountEnquiry initializes form, sets up prefill, and handles remount cleanly', async () => {
    const doc = createMockDocument();
    const enquiryWrap = createMockElement('div', { id: 'enquiry-wrap' });
    const selectedPkgWrap = createMockElement('div', { id: 'selected-package-wrap' });
    const form = createMockElement('form', { id: 'enquiry-form' });
    const inputPkg = createMockElement('input', { name: 'packageName', id: 'package-name-input' });
    const inputGoal = createMockElement('textarea', { name: 'goal', id: 'enquiry-goal' });
    const submitBtn = createMockElement('button', { type: 'submit' });
    form.appendChild(selectedPkgWrap);
    form.appendChild(inputPkg);
    form.appendChild(inputGoal);
    form.appendChild(submitBtn);
    enquiryWrap.appendChild(form);
    doc.body.appendChild(enquiryWrap);

    let submitted = 0;
    const mockSubmit = async () => {
      submitted++;
      return { id: 'mock-123' };
    };

    // First mount with query parameters
    await mountEnquiry({
      root: doc,
      url: '/start?package=MONDO%20LAUNCH',
      apiSubmit: mockSubmit,
      fetchContent: async () => ({})
    });

    assert.equal(doc.body.dataset.enquiryMounted, 'true');
    assert.equal(inputPkg.value, 'MONDO LAUNCH');
    assert.equal(form.getListenerCount('submit'), 1);

    // Duplicate mount -> no duplicate listener
    await mountEnquiry({
      root: doc,
      url: '/start?package=MONDO%20LAUNCH',
      apiSubmit: mockSubmit,
      fetchContent: async () => ({})
    });
    assert.equal(form.getListenerCount('submit'), 1);

    // Unmount
    unmountEnquiry({ root: doc });
    assert.equal(doc.body.dataset.enquiryMounted, undefined);

    // Remount with different search query
    await mountEnquiry({
      root: doc,
      url: '/start?package=MONDO%20LOOP',
      apiSubmit: mockSubmit,
      fetchContent: async () => ({})
    });

    assert.equal(doc.body.dataset.enquiryMounted, 'true');
    assert.equal(doc.querySelector('#package-name-input').value, 'MONDO LOOP');
  });

  it('mountProject initializes project detail view and cleans up globals on unmount', async () => {
    const doc = createMockDocument();
    const main = createMockElement('main', { id: 'project-main' });
    const introWrap = createMockElement('div', { id: 'project-intro-wrap' });
    const media = createMockElement('div', { id: 'project-media' });
    const story = createMockElement('div', { id: 'project-story' });
    const explore = createMockElement('div', { id: 'explore-grid' });
    main.appendChild(introWrap);
    main.appendChild(media);
    main.appendChild(story);
    main.appendChild(explore);
    doc.body.appendChild(main);

    globalThis.window = createMockWindow({
      location: { pathname: '/work/rainbow-orchard', search: '' }
    });

    // Mount
    await mountProject({
      root: doc,
      fallbackProjects: defaultProjects,
      fetchContent: async () => ({ projects: defaultProjects })
    });

    assert.equal(doc.body.dataset.projectMounted, 'true');
    assert.equal(globalThis.window.__MONDO_PROJECT_READY__, true);
    assert.equal(globalThis.window.__MONDO_BOOTSTRAP_STATE__, 'ready');

    // Unmount
    unmountProject({ root: doc });
    assert.equal(doc.body.dataset.projectMounted, undefined);
    assert.equal(globalThis.window.__MONDO_PROJECT_READY__, false);
    assert.equal(globalThis.window.__MONDO_BOOTSTRAP_STATE__, 'idle');

    // Remount
    await mountProject({
      root: doc,
      fallbackProjects: defaultProjects,
      fetchContent: async () => ({ projects: defaultProjects })
    });
    assert.equal(globalThis.window.__MONDO_PROJECT_READY__, true);

    unmountProject({ root: doc });
    delete globalThis.window;
  });
});

// ========================================================================
// SECTION 4: Group B — Async Safety & Operation Invalidation
// ========================================================================

describe('Group B: Async Safety & Stale Request Invalidation', () => {
  it('mountHome discards late-resolving fetch if unmounted before resolution', async () => {
    const doc = createMockDocument();
    const packagesGrid = createMockElement('div', { id: 'packages-grid' });
    doc.body.appendChild(packagesGrid);

    let resolveFetch;
    const fetchPromise = new Promise((res) => { resolveFetch = res; });

    // Start mount with pending fetch
    const mountPromise = mountHome({
      root: doc,
      fetchContent: () => fetchPromise
    });

    // Unmount before fetch resolves
    unmountHome({ root: doc });

    // Late resolve with modified packages
    const modifiedSettings = {
      ...defaultSettings,
      packages: [{ id: 'late-pack', name: 'LATE ARRIVAL', subtitle: 'Should not appear', price: '$999', cadence: 'one-off', features: [] }]
    };
    resolveFetch({ settings: modifiedSettings, projects: defaultProjects });
    await mountPromise;

    // Verify packagesGrid does NOT contain the late arrival package
    assert.doesNotMatch(packagesGrid.innerHTML, /LATE ARRIVAL/);
  });

  it('mountWork invalidates earlier in-flight request when consecutive mounts occur', async () => {
    const doc = createMockDocument();
    const workGrid = createMockElement('div', { id: 'work-grid' });
    const countEl = createMockElement('div', { id: 'project-count' });
    const filterList = createMockElement('div', { class: 'filter-list' });
    doc.body.appendChild(workGrid);
    doc.body.appendChild(countEl);
    doc.body.appendChild(filterList);

    let resolveFetchA;
    const fetchAPromise = new Promise((res) => { resolveFetchA = res; });

    // Mount A
    const promiseA = mountWork({
      root: doc,
      fetchContent: () => fetchAPromise
    });

    // Unmount and immediately start Mount B
    unmountWork({ root: doc });

    const fastProjectsB = [{
      slug: 'project-b-fresh',
      title: 'Project B Fresh',
      category: 'Games',
      client: 'Studio B',
      year: '2026',
      heroMedia: { kind: 'image', url: '/b.webp' }
    }];

    await mountWork({
      root: doc,
      fetchContent: async () => ({ projects: fastProjectsB })
    });

    // Now resolve late Fetch A with stale projects
    const staleProjectsA = [{
      slug: 'project-a-stale',
      title: 'Project A Stale',
      category: 'Games',
      client: 'Studio A',
      year: '2025',
      heroMedia: { kind: 'image', url: '/a.webp' }
    }];
    resolveFetchA({ projects: staleProjectsA });
    await promiseA;

    // Assert grid renders Project B, not Project A
    assert.match(workGrid.innerHTML, /Project B Fresh/);
    assert.doesNotMatch(workGrid.innerHTML, /Project A Stale/);
  });

  it('mountEnquiry respects AbortSignal and ignores aborted async content hydration', async () => {
    const doc = createMockDocument();
    const enquiryWrap = createMockElement('div', { id: 'enquiry-wrap' });
    const form = createMockElement('form', { id: 'enquiry-form' });
    enquiryWrap.appendChild(form);
    doc.body.appendChild(enquiryWrap);

    const controller = new AbortController();
    controller.abort(); // already aborted

    let fetchCalled = false;
    await mountEnquiry({
      root: doc,
      signal: controller.signal,
      fetchContent: async () => {
        fetchCalled = true;
        return { settings: { email: 'late@mondo.test' } };
      }
    });

    assert.equal(fetchCalled, false, 'Aborted mount must not call fetchContent');
    unmountEnquiry({ root: doc });
  });
});

// ========================================================================
// SECTION 5: Group C — Route-Specific Functionality Across Remounts
// ========================================================================

describe('Group C: Route-Specific Functionality Across Remounts', () => {
  it('Landing Page: package toggle and work filters function smoothly after remount', async () => {
    const doc = createMockDocument();
    const packagesGrid = createMockElement('div', { id: 'packages-grid' });
    const segContainer = createMockElement('div', { class: 'segmented' });
    const btnOneOff = createMockElement('button', { class: 'active' });
    const btnMonthly = createMockElement('button');
    segContainer.appendChild(btnOneOff);
    segContainer.appendChild(btnMonthly);

    const workSection = createMockElement('section', { class: 'selected-work' });
    const filterList = createMockElement('div', { class: 'filter-list' });
    const btnFilterAll = createMockElement('button', { class: 'active', 'data-filter': 'All' });
    const btnFilterTrailers = createMockElement('button', { 'data-filter': 'Trailers' });
    filterList.appendChild(btnFilterAll);
    filterList.appendChild(btnFilterTrailers);
    workSection.appendChild(filterList);

    doc.body.appendChild(packagesGrid);
    doc.body.appendChild(segContainer);
    doc.body.appendChild(workSection);

    // Cycle 1: Mount
    await mountHome({ root: doc, fetchContent: async () => ({ settings: defaultSettings, projects: defaultProjects }) });
    btnMonthly.click();
    assert.match(packagesGrid.innerHTML, /MONDO LOOP/);

    // Cycle 2: Unmount & Remount
    unmountHome({ root: doc });
    await mountHome({ root: doc, fetchContent: async () => ({ settings: defaultSettings, projects: defaultProjects }) });

    // Click monthly button on remounted page
    const remountedMonthly = doc.querySelectorAll('.segmented button')[1];
    remountedMonthly.click();
    assert.match(packagesGrid.innerHTML, /MONDO LOOP/);

    // Click one-off button
    const remountedOneOff = doc.querySelectorAll('.segmented button')[0];
    remountedOneOff.click();
    assert.match(packagesGrid.innerHTML, /MONDO LAUNCH/);
    unmountHome({ root: doc });
  });

  it('Work Page: filter buttons update active state after remount', async () => {
    const doc = createMockDocument();
    const workGrid = createMockElement('div', { id: 'work-grid' });
    const countEl = createMockElement('div', { id: 'project-count' });
    const filterList = createMockElement('div', { class: 'filter-list' });
    const btnAll = createMockElement('button', { 'data-filter': 'All', class: 'active' });
    const btnTrailers = createMockElement('button', { 'data-filter': 'Trailers' });
    filterList.appendChild(btnAll);
    filterList.appendChild(btnTrailers);

    doc.body.appendChild(workGrid);
    doc.body.appendChild(countEl);
    doc.body.appendChild(filterList);

    // Mount -> Unmount -> Remount
    await mountWork({ root: doc, fetchContent: async () => ({ projects: defaultProjects }) });
    unmountWork({ root: doc });
    await mountWork({ root: doc, fetchContent: async () => ({ projects: defaultProjects }) });

    // Trigger filter change on remounted view
    const remountedTrailers = doc.querySelectorAll('.filter-list button')[1];
    const remountedAll = doc.querySelectorAll('.filter-list button')[0];
    remountedTrailers.click();
    assert.equal(remountedTrailers.classList.contains('active'), true);
    assert.equal(remountedAll.classList.contains('active'), false);
    unmountWork({ root: doc });
  });

  it('Project Details: cleans up watchdog and coordinator on unmount and reinitializes on remount', async () => {
    const doc = createMockDocument();
    const main = createMockElement('main', { id: 'project-main' });
    const introWrap = createMockElement('div', { id: 'project-intro-wrap' });
    const media = createMockElement('div', { id: 'project-media' });
    const story = createMockElement('div', { id: 'project-story' });
    const explore = createMockElement('div', { id: 'explore-grid' });
    main.appendChild(introWrap);
    main.appendChild(media);
    main.appendChild(story);
    main.appendChild(explore);
    doc.body.appendChild(main);

    globalThis.window = createMockWindow({
      location: { pathname: '/work/rainbow-orchard', search: '' }
    });

    const coord1 = await mountProject({
      root: doc,
      fallbackProjects: defaultProjects,
      fetchContent: async () => ({ projects: defaultProjects })
    });

    assert.ok(globalThis.window.__MONDO_READINESS_COORDINATOR__);
    assert.equal(globalThis.window.__MONDO_PROJECT_READY__, true);

    // Unmount must destroy coordinator and reset readiness
    unmountProject({ root: doc });
    assert.equal(globalThis.window.__MONDO_READINESS_COORDINATOR__, null);
    assert.equal(globalThis.window.__MONDO_PROJECT_READY__, false);

    // Remount creates a fresh coordinator and sets ready again
    const coord2 = await mountProject({
      root: doc,
      fallbackProjects: defaultProjects,
      fetchContent: async () => ({ projects: defaultProjects })
    });
    assert.notEqual(coord2, coord1);
    assert.equal(globalThis.window.__MONDO_PROJECT_READY__, true);

    unmountProject({ root: doc });
    delete globalThis.window;
  });
});

// ========================================================================
// SECTION 6: Group D — Historical Phase 5C Preservation
// ========================================================================

describe('Group D: Historical Phase 5C Preservation', () => {
  it('D23/D25 decode resilience: mountProject handles image decode errors gracefully', async () => {
    const doc = createMockDocument();
    const main = createMockElement('main', { id: 'project-main' });
    main.appendChild(createMockElement('div', { id: 'project-intro-wrap' }));
    main.appendChild(createMockElement('div', { id: 'project-media' }));
    main.appendChild(createMockElement('div', { id: 'project-story' }));
    main.appendChild(createMockElement('div', { id: 'explore-grid' }));
    doc.body.appendChild(main);

    globalThis.window = createMockWindow({
      location: { pathname: '/work/rainbow-orchard', search: '' }
    });

    const origImage = globalThis.Image;
    globalThis.Image = class {
      constructor() {
        this.src = '';
      }
      async decode() {
        throw new Error('Simulated image decode network timeout');
      }
    };

    try {
      // Must not crash; fallback is applied
      const coordinator = await mountProject({
        root: doc,
        fallbackProjects: defaultProjects,
        fetchContent: async () => ({ projects: defaultProjects })
      });

      assert.ok(coordinator);
      assert.equal(globalThis.window.__MONDO_PROJECT_READY__, true);
    } finally {
      globalThis.Image = origImage;
      unmountProject({ root: doc });
      delete globalThis.window;
    }
  });

  it('D27/D28 non-destructive error host preserves subcontainers across unmount and remount', () => {
    const doc = createMockDocument();
    const main = createMockElement('main', { id: 'project-main' });
    const intro = createMockElement('div', { id: 'project-intro-wrap' });
    const media = createMockElement('div', { id: 'project-media' });
    main.appendChild(intro);
    main.appendChild(media);
    doc.body.appendChild(main);

    globalThis.window = createMockWindow({
      location: { pathname: '/work/rainbow-orchard', search: '' }
    });

    unmountProject({ root: doc });

    assert.ok(doc.getElementById('project-intro-wrap'), 'Intro wrap must not be destroyed');
    assert.ok(doc.getElementById('project-media'), 'Media wrap must not be destroyed');
    delete globalThis.window;
  });

  it('G1-MINIMAL Geometry critical CSS remains intact in project.html', () => {
    const html = readPublicFile('work/project.html');
    const criticalCssMatch = html.match(/<style\s+id=["']mondo-pilot-critical-css["']>([\s\S]*?)<\/style>/i);
    assert.ok(criticalCssMatch, '<style id="mondo-pilot-critical-css"> must exist');
    assert.ok(criticalCssMatch[1].includes('max-width: 100%'), 'img max-width 100% rule must be present');
  });

  it('D24-LIMITED prefetch resource hint remains intact in work/index.html', () => {
    const html = readPublicFile('work/index.html');
    assert.ok(
      html.includes('<link rel="prefetch" as="image" href="/assets/intro/mondo-white.png">'),
      'Authentic PNG prefetch link must remain in public/work/index.html'
    );
  });
});

// ========================================================================
// SECTION 7: Group E — Negative Cases & Safety Guarantees
// ========================================================================

describe('Group E: Negative Cases & Safety Guarantees', () => {
  it('Enquiry form does not submit multiple times when mountEnquiry was called multiple times', async () => {
    const doc = createMockDocument();
    const enquiryWrap = createMockElement('div', { id: 'enquiry-wrap' });
    const form = createMockElement('form', { id: 'enquiry-form' });
    const inputName = createMockElement('input', { name: 'name', value: 'Studio Pilot' });
    const inputEmail = createMockElement('input', { name: 'email', value: 'pilot@example.test' });
    const inputGoal = createMockElement('textarea', { name: 'goal', value: 'We need full design and creative animation for a new release.' });
    const inputConsent = createMockElement('input', { name: 'consent', type: 'checkbox', checked: true });
    const submitBtn = createMockElement('button', { type: 'submit' });

    form.appendChild(inputName);
    form.appendChild(inputEmail);
    form.appendChild(inputGoal);
    form.appendChild(inputConsent);
    form.appendChild(submitBtn);
    enquiryWrap.appendChild(form);
    doc.body.appendChild(enquiryWrap);

    let submitCount = 0;
    const mockSubmit = async () => {
      submitCount++;
      return { id: 'submission-1' };
    };

    const origFormData = globalThis.FormData;
    globalThis.FormData = class {
      constructor() {}
      get(k) {
        if (k === 'name') return 'Studio Pilot';
        if (k === 'email') return 'pilot@example.test';
        if (k === 'goal') return 'We need full design and creative animation for a new release.';
        if (k === 'consent') return 'on';
        return '';
      }
    };

    try {
      // Call mount 3 times consecutively
      await mountEnquiry({ root: doc, apiSubmit: mockSubmit, fetchContent: async () => ({}) });
      await mountEnquiry({ root: doc, apiSubmit: mockSubmit, fetchContent: async () => ({}) });
      await mountEnquiry({ root: doc, apiSubmit: mockSubmit, fetchContent: async () => ({}) });

      // Submit form
      form.dispatchEvent({ type: 'submit', preventDefault() {} });
      await new Promise((r) => setTimeout(r, 20));

      assert.equal(submitCount, 1, 'Form must submit exactly once despite repeated mount calls');
    } finally {
      globalThis.FormData = origFormData;
      unmountEnquiry({ root: doc });
    }
  });

  it('Detached buttons do not retain listeners after unmount', async () => {
    const doc = createMockDocument();
    const workGrid = createMockElement('div', { id: 'work-grid' });
    const countEl = createMockElement('div', { id: 'project-count' });
    const filterList = createMockElement('div', { class: 'filter-list' });
    const btnAll = createMockElement('button', { 'data-filter': 'All', class: 'active' });
    const btnTrailers = createMockElement('button', { 'data-filter': 'Trailers' });
    filterList.appendChild(btnAll);
    filterList.appendChild(btnTrailers);
    doc.body.appendChild(workGrid);
    doc.body.appendChild(countEl);
    doc.body.appendChild(filterList);

    await mountWork({ root: doc, fetchContent: async () => ({ projects: defaultProjects }) });

    // Unmount replaces buttons with clones
    unmountWork({ root: doc });

    // Inspect buttons in DOM: all have 0 listeners
    const remainingButtons = doc.querySelectorAll('.filter-list button');
    assert.equal(remainingButtons.length, 2);
    remainingButtons.forEach((btn) => {
      assert.equal(btn.getListenerCount('click'), 0, 'Buttons in DOM must have 0 listeners after unmount');
    });
  });

  it('Unmounted project page does not fire watchdog or leak state into global scope', async () => {
    const doc = createMockDocument();
    const main = createMockElement('main', { id: 'project-main' });
    main.appendChild(createMockElement('div', { id: 'project-intro-wrap' }));
    doc.body.appendChild(main);

    globalThis.window = createMockWindow({
      location: { pathname: '/work/rainbow-orchard', search: '' }
    });

    await mountProject({
      root: doc,
      fallbackProjects: defaultProjects,
      fetchContent: async () => ({ projects: defaultProjects })
    });

    unmountProject({ root: doc });

    // Verify global state reset
    assert.equal(globalThis.window.__MONDO_PROJECT_READY__, false);
    assert.equal(globalThis.window.__MONDO_BOOTSTRAP_STATE__, 'idle');
    assert.equal(globalThis.window.__MONDO_WATCHDOG_FIRED__, false);

    delete globalThis.window;
  });
});
