/**
 * MONDO — Project Detail First-View Readiness Test Suite (Stage G3.3-D)
 * Automated verification for structural integrity, project data validation,
 * hero media decoding, verified fallback evidence, typography gating,
 * and strict timeout integrity per Mandatory Amendment D-02.
 */

import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  PROJECT_READINESS_OUTCOMES,
  DEFAULT_PROJECT_READINESS_DEADLINE_MS,
  DEFAULT_PROJECT_DECODE_DEADLINE_MS,
  DEFAULT_PROJECT_FONT_GATE_DEADLINE_MS,
  checkProjectStructure,
  checkProjectData,
  hasVerifiedFallback,
  evaluateHeroMedia,
  gateProjectFonts,
  awaitProjectFirstViewReady
} from '../public/js/features/project/project-readiness.js';

/**
 * Lightweight mock element creator for pure Node.js test execution.
 */
function createMockElement(tag, attrs = {}, children = []) {
  const classListSet = new Set((attrs.className || attrs.class || '').split(/\s+/).filter(Boolean));
  const datasetObj = { ...(attrs.dataset || {}) };
  const styleObj = { ...(attrs.style || {}) };
  const listeners = new Map();

  const el = {
    tagName: tag.toUpperCase(),
    id: attrs.id || '',
    hidden: Boolean(attrs.hidden),
    complete: attrs.complete !== undefined ? attrs.complete : false,
    naturalWidth: attrs.naturalWidth !== undefined ? attrs.naturalWidth : 0,
    width: attrs.width !== undefined ? attrs.width : 0,
    height: attrs.height !== undefined ? attrs.height : 0,
    readyState: attrs.readyState !== undefined ? attrs.readyState : 0,
    currentTime: attrs.currentTime !== undefined ? attrs.currentTime : 0,
    textContent: attrs.textContent !== undefined ? attrs.textContent : '',
    decode: attrs.decode || null,
    children: [...children],
    parentNode: null,
    style: styleObj,
    dataset: datasetObj,
    classList: {
      contains: (cls) => classListSet.has(cls),
      add: (cls) => classListSet.add(cls),
      remove: (cls) => classListSet.delete(cls)
    },
    getAttribute(name) {
      if (name === 'id') return el.id;
      if (name === 'class') return Array.from(classListSet).join(' ');
      if (name === 'hidden') return el.hidden ? '' : null;
      if (name.startsWith('data-')) {
        const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        return datasetObj[key] !== undefined ? datasetObj[key] : null;
      }
      return attrs[name] !== undefined ? attrs[name] : null;
    },
    setAttribute(name, val) {
      if (name === 'id') el.id = val;
      else if (name === 'class') {
        classListSet.clear();
        String(val).split(/\s+/).filter(Boolean).forEach((c) => classListSet.add(c));
      } else if (name.startsWith('data-')) {
        const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        datasetObj[key] = String(val);
      }
      attrs[name] = String(val);
    },
    addEventListener(event, fn) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event).add(fn);
    },
    removeEventListener(event, fn) {
      if (listeners.has(event)) listeners.get(event).delete(fn);
    },
    dispatchEvent(event) {
      const type = typeof event === 'string' ? event : event.type;
      const handlers = listeners.get(type);
      if (handlers) {
        for (const h of handlers) h(event);
      }
    },
    closest(selector) {
      let curr = el;
      while (curr) {
        if (matches(curr, selector)) return curr;
        curr = curr.parentNode;
      }
      return null;
    },
    querySelector(selector) {
      const all = el.querySelectorAll(selector);
      return all.length > 0 ? all[0] : null;
    },
    querySelectorAll(selector) {
      const results = [];
      function traverse(node) {
        for (const child of node.children) {
          if (matches(child, selector)) {
            results.push(child);
          }
          traverse(child);
        }
      }
      traverse(el);
      return results;
    },
    appendChild(child) {
      child.parentNode = el;
      el.children.push(child);
      return child;
    }
  };

  for (const child of children) {
    child.parentNode = el;
  }

  return el;
}

function matches(el, selector) {
  if (!el || !selector) return false;
  if (selector.startsWith('#')) return el.id === selector.slice(1);
  if (selector.startsWith('.')) return el.classList && el.classList.contains(selector.slice(1));
  if (selector === 'main#main') return el.tagName === 'MAIN' && el.id === 'main';
  if (selector.includes('#')) {
    const [tag, id] = selector.split('#');
    return el.tagName === tag.toUpperCase() && el.id === id;
  }
  return el.tagName === selector.toUpperCase();
}

/**
 * Creates a standard mock Project Detail DOM tree.
 */
function createMockProjectDom(options = {}) {
  const {
    slug = 'aurora',
    title = 'Project Aurora',
    hasError = false,
    hasNotFound = false,
    errorHostVisible = false,
    errorHostContent = '',
    hasMedia = true,
    mediaType = 'img',
    mediaAttrs = {},
    noMediaExemption = false
  } = options;

  const titleEl = createMockElement('h1', { textContent: title });
  const introWrap = createMockElement('div', { id: 'project-intro-wrap', class: 'project-intro' }, [titleEl]);

  const mediaChildren = [];
  if (hasMedia) {
    if (mediaType === 'img') {
      mediaChildren.push(createMockElement('img', {
        id: 'project-hero-img',
        naturalWidth: mediaAttrs.naturalWidth !== undefined ? mediaAttrs.naturalWidth : 1200,
        complete: mediaAttrs.complete !== undefined ? mediaAttrs.complete : true,
        decode: mediaAttrs.decode || null,
        dataset: mediaAttrs.dataset || {},
        class: mediaAttrs.class || ''
      }));
    } else if (mediaType === 'video') {
      mediaChildren.push(createMockElement('video', {
        id: 'project-hero-video',
        readyState: mediaAttrs.readyState !== undefined ? mediaAttrs.readyState : 4,
        currentTime: mediaAttrs.currentTime !== undefined ? mediaAttrs.currentTime : 1,
        dataset: mediaAttrs.dataset || {},
        class: mediaAttrs.class || ''
      }));
    }
  }

  const mediaContainerAttrs = { id: 'project-media', class: 'project-media' };
  if (noMediaExemption) {
    mediaContainerAttrs.dataset = { noMedia: 'true' };
  }
  const mediaEl = createMockElement('div', mediaContainerAttrs, mediaChildren);

  const storyEl = createMockElement('div', { id: 'project-story', class: 'project-story' });

  const projectMainClasses = ['project-details'];
  if (hasError) projectMainClasses.push('has-project-error');
  if (hasNotFound) projectMainClasses.push('has-project-not-found');

  const mainChildren = [introWrap, mediaEl, storyEl];
  if (errorHostVisible || errorHostContent) {
    const errorHost = createMockElement('div', {
      id: 'project-error-host',
      hidden: !errorHostVisible,
      textContent: errorHostContent
    });
    mainChildren.unshift(errorHost);
  }

  const projectMain = createMockElement('div', {
    id: 'project-main',
    class: projectMainClasses.join(' '),
    dataset: { projectSlug: slug }
  }, mainChildren);

  const landmark = createMockElement('main', { id: 'main', class: 'container' }, [projectMain]);

  const mockDoc = {
    querySelector: (sel) => {
      if (matches(landmark, sel)) return landmark;
      return landmark.querySelector(sel);
    },
    querySelectorAll: (sel) => {
      const res = [];
      if (matches(landmark, sel)) res.push(landmark);
      return res.concat(landmark.querySelectorAll(sel));
    },
    getElementById: (id) => {
      if (landmark.id === id) return landmark;
      return landmark.querySelector(`#${id}`);
    }
  };

  return { mockDoc, landmark, projectMain, introWrap, mediaEl, storyEl };
}

describe('Stage G3.3-D: Project Detail First-View Readiness Unit Tests', () => {
  // =========================================================================
  // Group A: Factory, Exports & Dormancy
  // =========================================================================
  describe('Group A: Factory, Exports & Dormancy', () => {
    it('exports all 7 deterministic outcome states in PROJECT_READINESS_OUTCOMES', () => {
      assert.strictEqual(PROJECT_READINESS_OUTCOMES.STRUCTURAL_READY, 'STRUCTURAL_READY');
      assert.strictEqual(PROJECT_READINESS_OUTCOMES.DATA_READY, 'DATA_READY');
      assert.strictEqual(PROJECT_READINESS_OUTCOMES.CRITICAL_MEDIA_READY, 'CRITICAL_MEDIA_READY');
      assert.strictEqual(PROJECT_READINESS_OUTCOMES.VERIFIED_FALLBACK_READY, 'VERIFIED_FALLBACK_READY');
      assert.strictEqual(PROJECT_READINESS_OUTCOMES.RECOVERABLE_ERROR, 'RECOVERABLE_ERROR');
      assert.strictEqual(PROJECT_READINESS_OUTCOMES.TIMED_OUT, 'TIMED_OUT');
      assert.strictEqual(PROJECT_READINESS_OUTCOMES.ABORTED, 'ABORTED');
      assert.ok(Object.isFrozen(PROJECT_READINESS_OUTCOMES), 'Must be Object.freeze');
    });

    it('exports configurable timing defaults', () => {
      assert.strictEqual(DEFAULT_PROJECT_READINESS_DEADLINE_MS, 3500);
      assert.strictEqual(DEFAULT_PROJECT_DECODE_DEADLINE_MS, 2500);
      assert.strictEqual(DEFAULT_PROJECT_FONT_GATE_DEADLINE_MS, 200);
    });
  });

  // =========================================================================
  // Group B: Structural Validation (checkProjectStructure)
  // =========================================================================
  describe('Group B: Structural Validation (checkProjectStructure)', () => {
    it('validates a complete project DOM structure successfully', () => {
      const { mockDoc, landmark, projectMain, introWrap, mediaEl, storyEl } = createMockProjectDom();
      const res = checkProjectStructure(mockDoc);

      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.landmarkEl, landmark);
      assert.strictEqual(res.projectMainEl, projectMain);
      assert.strictEqual(res.introWrapEl, introWrap);
      assert.strictEqual(res.mediaEl, mediaEl);
      assert.strictEqual(res.storyEl, storyEl);
    });

    it('rejects when root is invalid or missing', () => {
      const res = checkProjectStructure(null);
      assert.strictEqual(res.ok, false);
      assert.match(res.error, /invalid or missing/i);
    });

    it('rejects when landmark <main id="main"> is missing', () => {
      const emptyDoc = { querySelector: () => null };
      const res = checkProjectStructure(emptyDoc);
      assert.strictEqual(res.ok, false);
      assert.match(res.error, /Missing required landmark/i);
    });

    it('rejects when #project-main container is missing inside landmark', () => {
      const landmark = createMockElement('main', { id: 'main' }, []);
      const doc = { querySelector: (sel) => (sel === 'main#main' ? landmark : null) };
      const res = checkProjectStructure(doc);
      assert.strictEqual(res.ok, false);
      assert.match(res.error, /Missing required project container #project-main/i);
    });
  });

  // =========================================================================
  // Group C: Project Data & Error Host Checks (checkProjectData)
  // =========================================================================
  describe('Group C: Project Data & Error Host Checks (checkProjectData)', () => {
    it('passes when project data heading is populated and no error classes exist', () => {
      const { mockDoc } = createMockProjectDom({ slug: 'aurora', title: 'Aurora Design' });
      const res = checkProjectData(mockDoc, { slug: 'aurora' });

      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.title, 'Aurora Design');
      assert.strictEqual(res.slug, 'aurora');
    });

    it('rejects when #project-main has has-project-error class', () => {
      const { mockDoc } = createMockProjectDom({ hasError: true });
      const res = checkProjectData(mockDoc);

      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.hasError, true);
      assert.match(res.error, /has-project-error/i);
    });

    it('rejects when #project-main has has-project-not-found class', () => {
      const { mockDoc } = createMockProjectDom({ hasNotFound: true });
      const res = checkProjectData(mockDoc);

      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.hasError, true);
      assert.match(res.error, /has-project-not-found/i);
    });

    it('rejects when visible #project-error-host contains error content', () => {
      const { mockDoc } = createMockProjectDom({
        errorHostVisible: true,
        errorHostContent: 'Error loading project'
      });
      const res = checkProjectData(mockDoc);

      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.hasError, true);
      assert.match(res.error, /error host contains visible error/i);
    });

    it('rejects when project title heading is empty', () => {
      const { mockDoc } = createMockProjectDom({ title: '   ' });
      const res = checkProjectData(mockDoc);

      assert.strictEqual(res.ok, false);
      assert.strictEqual(res.hasError, false);
      assert.match(res.error, /Missing or empty project title/i);
    });

    it('rejects when expected slug mismatches rendered data-project-slug', () => {
      const { mockDoc } = createMockProjectDom({ slug: 'aurora' });
      const res = checkProjectData(mockDoc, { slug: 'different-slug' });

      assert.strictEqual(res.ok, false);
      assert.match(res.error, /Project slug mismatch/i);
    });
  });

  // =========================================================================
  // Group D: Verified Fallback Evidence (hasVerifiedFallback)
  // =========================================================================
  describe('Group D: Verified Fallback Evidence (hasVerifiedFallback)', () => {
    it('identifies verified fallback when element has data-fallback-verified="true"', () => {
      const img = createMockElement('img', { dataset: { fallbackVerified: 'true' } });
      assert.strictEqual(hasVerifiedFallback(img), true);
    });

    it('identifies verified fallback when element has .has-fallback-visual class', () => {
      const img = createMockElement('img', { class: 'has-fallback-visual' });
      assert.strictEqual(hasVerifiedFallback(img), true);
    });

    it('identifies verified fallback when container has .project-cover and .concept-label', () => {
      const label = createMockElement('span', { class: 'concept-label' });
      const cover = createMockElement('div', { class: 'project-cover' }, [label]);
      const img = createMockElement('img', {});
      cover.appendChild(img);

      assert.strictEqual(hasVerifiedFallback(img), true);
    });

    it('rejects when element and container lack authentic fallback markers', () => {
      const container = createMockElement('div', { id: 'project-media' });
      const img = createMockElement('img', {});
      container.appendChild(img);

      assert.strictEqual(hasVerifiedFallback(img), false);
    });
  });

  // =========================================================================
  // Group E: Hero Media Evaluation (evaluateHeroMedia)
  // =========================================================================
  describe('Group E: Hero Media Evaluation (evaluateHeroMedia)', () => {
    it('evaluates pre-decoded image immediately to status "decoded"', async () => {
      const img = createMockElement('img', { naturalWidth: 1600, complete: true });
      const res = await evaluateHeroMedia(img);
      assert.strictEqual(res.status, 'decoded');
    });

    it('evaluates image with .is-decoded class immediately to status "decoded"', async () => {
      const img = createMockElement('img', { class: 'is-decoded' });
      const res = await evaluateHeroMedia(img);
      assert.strictEqual(res.status, 'decoded');
    });

    it('evaluates successful img.decode() promise to status "decoded"', async () => {
      const img = createMockElement('img', {
        naturalWidth: 0,
        decode: async () => {
          img.naturalWidth = 1200;
        }
      });
      const res = await evaluateHeroMedia(img);
      assert.strictEqual(res.status, 'decoded');
    });

    it('evaluates decode rejection with verified fallback to status "fallback"', async () => {
      const img = createMockElement('img', {
        dataset: { fallbackVerified: 'true' },
        decode: async () => { throw new Error('Decode corrupted'); }
      });
      const res = await evaluateHeroMedia(img);
      assert.strictEqual(res.status, 'fallback');
    });

    it('evaluates decode rejection without fallback to status "error"', async () => {
      const img = createMockElement('img', {
        decode: async () => { throw new Error('Image network error'); }
      });
      const res = await evaluateHeroMedia(img);
      assert.strictEqual(res.status, 'error');
    });

    it('evaluates ready video (readyState >= 2) to status "decoded"', async () => {
      const video = createMockElement('video', { readyState: 3 });
      const res = await evaluateHeroMedia(video);
      assert.strictEqual(res.status, 'decoded');
    });

    it('evaluates video canplay event to status "decoded"', async () => {
      const video = createMockElement('video', { readyState: 0 });
      const evalPromise = evaluateHeroMedia(video, { decodeTimeoutMs: 100 });
      // Emit canplay event
      setTimeout(() => video.dispatchEvent('canplay'), 10);
      const res = await evalPromise;
      assert.strictEqual(res.status, 'decoded');
    });
  });

  // =========================================================================
  // Group F: Typography Gate & Font Readiness (gateProjectFonts)
  // =========================================================================
  describe('Group F: Typography Gate & Font Readiness (gateProjectFonts)', () => {
    it('resolves true immediately when document.fonts is absent', async () => {
      const res = await gateProjectFonts(null, 200);
      assert.strictEqual(res, true);
    });

    it('resolves true when fonts.ready resolves within deadline ceiling', async () => {
      const fonts = { ready: Promise.resolve() };
      const res = await gateProjectFonts(fonts, 200);
      assert.strictEqual(res, true);
    });

    it('bounds font delay at configured deadline ceiling without hanging', async () => {
      const fonts = { ready: new Promise(() => {}) }; // Stalled fonts
      const startTime = Date.now();
      const res = await gateProjectFonts(fonts, 30);
      const elapsed = Date.now() - startTime;

      assert.strictEqual(res, false);
      assert.ok(elapsed >= 25 && elapsed < 100, `Must be bounded near 30ms, took ${elapsed}ms`);
    });
  });

  // =========================================================================
  // Group G: First-View Readiness Orchestration & Mandatory Amendment D-02
  // =========================================================================
  describe('Group G: First-View Readiness Orchestration & Mandatory Amendment D-02', () => {
    it('resolves CRITICAL_MEDIA_READY when hero image decodes successfully', async () => {
      const { mockDoc } = createMockProjectDom({
        slug: 'aurora',
        hasMedia: true,
        mediaAttrs: { naturalWidth: 1600, complete: true }
      });

      const res = await awaitProjectFirstViewReady({ root: mockDoc, expectedSlug: 'aurora' });
      assert.strictEqual(res.outcome, PROJECT_READINESS_OUTCOMES.CRITICAL_MEDIA_READY);
      assert.strictEqual(res.mediaStatus, 'decoded');
    });

    it('resolves VERIFIED_FALLBACK_READY when hero media fails but verified fallback is present', async () => {
      const { mockDoc } = createMockProjectDom({
        slug: 'aurora',
        hasMedia: true,
        mediaAttrs: {
          naturalWidth: 0,
          complete: false,
          dataset: { fallbackVerified: 'true' },
          decode: async () => { throw new Error('Decode error'); }
        }
      });

      const res = await awaitProjectFirstViewReady({ root: mockDoc, expectedSlug: 'aurora' });
      assert.strictEqual(res.outcome, PROJECT_READINESS_OUTCOMES.VERIFIED_FALLBACK_READY);
      assert.strictEqual(res.mediaStatus, 'fallback');
    });

    it('resolves RECOVERABLE_ERROR when hero media fails without verified fallback', async () => {
      const { mockDoc } = createMockProjectDom({
        slug: 'aurora',
        hasMedia: true,
        mediaAttrs: {
          naturalWidth: 0,
          complete: false,
          decode: async () => { throw new Error('Decode error'); }
        }
      });

      const res = await awaitProjectFirstViewReady({ root: mockDoc, expectedSlug: 'aurora' });
      assert.strictEqual(res.outcome, PROJECT_READINESS_OUTCOMES.RECOVERABLE_ERROR);
    });

    it('AMENDMENT D-02: rejects DATA_READY and returns RECOVERABLE_ERROR when no hero media is present and exemption is NOT established', async () => {
      const { mockDoc } = createMockProjectDom({
        slug: 'aurora',
        hasMedia: false,
        noMediaExemption: false // NOT established
      });

      const res = await awaitProjectFirstViewReady({ root: mockDoc, expectedSlug: 'aurora' });
      assert.strictEqual(res.outcome, PROJECT_READINESS_OUTCOMES.RECOVERABLE_ERROR);
      assert.match(res.error, /no-media exemption is not established/i);
    });

    it('AMENDMENT D-02: resolves DATA_READY when no hero media is required AND explicit exemption is established', async () => {
      const { mockDoc } = createMockProjectDom({
        slug: 'aurora',
        hasMedia: false,
        noMediaExemption: true // Explicitly established
      });

      const res = await awaitProjectFirstViewReady({
        root: mockDoc,
        expectedSlug: 'aurora',
        allowNoMedia: true
      });
      assert.strictEqual(res.outcome, PROJECT_READINESS_OUTCOMES.DATA_READY);
    });

    it('STRICT TIMEOUT INTEGRITY: returns TIMED_OUT (NEVER CRITICAL_MEDIA_READY or VERIFIED_FALLBACK_READY) when media decode exceeds safety ceiling', async () => {
      const { mockDoc } = createMockProjectDom({
        slug: 'aurora',
        hasMedia: true,
        mediaAttrs: {
          naturalWidth: 0,
          complete: false,
          decode: () => new Promise(() => {}) // Stalled decode
        }
      });

      const res = await awaitProjectFirstViewReady({
        root: mockDoc,
        expectedSlug: 'aurora',
        safetyTimeoutMs: 30,
        decodeTimeoutMs: 100
      });

      assert.strictEqual(res.outcome, PROJECT_READINESS_OUTCOMES.TIMED_OUT);
      assert.notStrictEqual(res.outcome, PROJECT_READINESS_OUTCOMES.CRITICAL_MEDIA_READY);
      assert.notStrictEqual(res.outcome, PROJECT_READINESS_OUTCOMES.VERIFIED_FALLBACK_READY);
    });

    it('cancels immediately and returns ABORTED when AbortSignal triggers', async () => {
      const { mockDoc } = createMockProjectDom({ slug: 'aurora' });
      const controller = new AbortController();
      controller.abort();

      const res = await awaitProjectFirstViewReady({
        root: mockDoc,
        expectedSlug: 'aurora',
        signal: controller.signal
      });

      assert.strictEqual(res.outcome, PROJECT_READINESS_OUTCOMES.ABORTED);
    });
  });
});

