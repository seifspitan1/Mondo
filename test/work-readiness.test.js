/**
 * MONDO — Work Portfolio First-View Readiness Test Suite (Stage G3.3-A)
 * Automated verification for structural integrity, viewport-aware critical media selection,
 * decode resolution, verified fallback evidence, and timeout classification.
 */

import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  WORK_READINESS_OUTCOMES,
  checkWorkStructure,
  selectCriticalWorkImages,
  hasVerifiedFallback,
  evaluateImageReadiness,
  awaitWorkFirstViewReady
} from '../public/js/features/work/work-readiness.js';

/**
 * Lightweight mock element creator for pure Node.js test execution.
 */
function createMockElement(tag, attrs = {}, children = []) {
  const classListSet = new Set((attrs.className || attrs.class || '').split(/\s+/).filter(Boolean));
  const datasetObj = { ...(attrs.dataset || {}) };
  const styleObj = { ...(attrs.style || {}) };

  const el = {
    tagName: tag.toUpperCase(),
    id: attrs.id || '',
    hidden: Boolean(attrs.hidden),
    complete: attrs.complete !== undefined ? attrs.complete : false,
    naturalWidth: attrs.naturalWidth !== undefined ? attrs.naturalWidth : 0,
    width: attrs.width !== undefined ? attrs.width : 0,
    height: attrs.height !== undefined ? attrs.height : 0,
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
      if (name === 'aria-hidden') return attrs['aria-hidden'] || null;
      if (name === 'loading') return attrs.loading || null;
      if (name.startsWith('data-')) {
        const key = name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        return datasetObj[key] || null;
      }
      return attrs[name] || null;
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
    getBoundingClientRect: attrs.getBoundingClientRect || (() => ({
      width: 0,
      height: 0,
      top: 0,
      bottom: 0,
      left: 0,
      right: 0
    }))
  };

  // Wire parent pointers
  for (const child of children) {
    child.parentNode = el;
  }

  return el;
}

function matches(el, selector) {
  if (!el || !selector) return false;
  if (selector === 'main#main' || selector === '#main') return el.id === 'main';
  if (selector === '#work-grid') return el.id === 'work-grid';
  if (selector === '#project-count') return el.id === 'project-count';
  if (selector === '.project-card') return el.classList.contains('project-card');
  if (selector === '.empty-state') return el.classList.contains('empty-state');
  if (selector === '.concept-label') return el.classList.contains('concept-label');
  if (selector === '.project-view') return el.classList.contains('project-view');
  if (selector === '.project-cover') return el.classList.contains('project-cover');
  if (selector === 'img') return el.tagName === 'IMG';
  return false;
}

function createMockCard({
  id = '',
  loading = 'lazy',
  bounds = { width: 350, height: 200, top: 100, bottom: 300, left: 50, right: 400 },
  isFilteredOut = false,
  hidden = false,
  hasVerifiedFallbackUI = true,
  imgProps = {}
} = {}) {
  const img = createMockElement('img', {
    id: `img-${id}`,
    loading,
    naturalWidth: imgProps.naturalWidth !== undefined ? imgProps.naturalWidth : 0,
    complete: imgProps.complete !== undefined ? imgProps.complete : false,
    decode: imgProps.decode || null,
    dataset: imgProps.dataset || {}
  });

  const coverChildren = [img];
  if (hasVerifiedFallbackUI) {
    coverChildren.push(createMockElement('span', { className: 'concept-label' }));
    coverChildren.push(createMockElement('span', { className: 'project-view' }));
  }

  const cover = createMockElement('div', { className: 'project-cover' }, coverChildren);

  const cardClasses = ['project-card'];
  if (isFilteredOut) cardClasses.push('is-filtered-out');

  return createMockElement('a', {
    id: `card-${id}`,
    className: cardClasses.join(' '),
    hidden,
    getBoundingClientRect: () => bounds
  }, [cover]);
}

describe('Stage G3.3-A: Work Portfolio First-View Readiness', () => {

  describe('Group B1: Structural & Data Readiness Checks', () => {
    it('checkWorkStructure verifies presence of <main id="main"> and #work-grid', () => {
      const grid = createMockElement('div', { id: 'work-grid' });
      const main = createMockElement('main', { id: 'main' }, [grid]);
      const root = { querySelector: (sel) => (sel.includes('main') ? main : null) };

      const res = checkWorkStructure(root);
      assert.strictEqual(res.ok, true);
      assert.strictEqual(res.landmarkEl, main);
      assert.strictEqual(res.gridEl, grid);
    });

    it('checkWorkStructure rejects missing landmark <main id="main">', () => {
      const root = { querySelector: () => null };
      const res = checkWorkStructure(root);
      assert.strictEqual(res.ok, false);
      assert.match(res.error, /Missing required landmark/);
    });

    it('checkWorkStructure rejects missing grid container #work-grid', () => {
      const main = createMockElement('main', { id: 'main' }, []);
      const root = { querySelector: () => main };
      const res = checkWorkStructure(root);
      assert.strictEqual(res.ok, false);
      assert.match(res.error, /Missing required portfolio grid container/);
    });

    it('awaitWorkFirstViewReady returns RECOVERABLE_ERROR when DOM landmark is missing', async () => {
      const root = { querySelector: () => null };
      const res = await awaitWorkFirstViewReady({ root });
      assert.strictEqual(res.outcome, WORK_READINESS_OUTCOMES.RECOVERABLE_ERROR);
      assert.match(res.error, /Missing required landmark/);
    });

    it('recognizes verified empty state (.empty-state) as DATA_READY', async () => {
      const emptyEl = createMockElement('div', { className: 'empty-state' });
      const grid = createMockElement('div', { id: 'work-grid' }, [emptyEl]);
      const main = createMockElement('main', { id: 'main' }, [grid]);
      const root = { querySelector: () => main };

      const res = await awaitWorkFirstViewReady({ root });
      assert.strictEqual(res.outcome, WORK_READINESS_OUTCOMES.DATA_READY);
      assert.strictEqual(res.criticalCount, 0);
    });

    it('rejects unexpected missing content (0 cards without .empty-state)', async () => {
      const grid = createMockElement('div', { id: 'work-grid' }, []);
      const main = createMockElement('main', { id: 'main' }, [grid]);
      const root = { querySelector: () => main };

      const res = await awaitWorkFirstViewReady({ root, allowEmptyGrid: false });
      assert.strictEqual(res.outcome, WORK_READINESS_OUTCOMES.RECOVERABLE_ERROR);
      assert.match(res.error, /no cards and no valid empty state/);
    });
  });

  describe('Group B2: Viewport-Aware Critical Image Selection (Amendment 3 & G3-D04 Option C)', () => {
    it('evaluates both vertical and horizontal intersection on desktop (3 columns)', () => {
      // 3 cards in row 1 (visible), 1 card in row 2 (vertically offscreen)
      const c1 = createMockCard({ id: '1', bounds: { width: 350, height: 200, top: 50, bottom: 250, left: 30, right: 380 } });
      const c2 = createMockCard({ id: '2', bounds: { width: 350, height: 200, top: 50, bottom: 250, left: 410, right: 760 } });
      const c3 = createMockCard({ id: '3', bounds: { width: 350, height: 200, top: 50, bottom: 250, left: 790, right: 1140 } });
      const c4 = createMockCard({ id: '4', bounds: { width: 350, height: 200, top: 900, bottom: 1100, left: 30, right: 380 } }); // Offscreen

      const grid = createMockElement('div', { id: 'work-grid' }, [c1, c2, c3, c4]);

      const selected = selectCriticalWorkImages(grid, { viewportWidth: 1200, viewportHeight: 800 });
      assert.strictEqual(selected.length, 3);
      assert.strictEqual(selected[0].id, 'img-1');
      assert.strictEqual(selected[1].id, 'img-2');
      assert.strictEqual(selected[2].id, 'img-3');
    });

    it('evaluates single-column mobile viewports (only top cards selected)', () => {
      // Mobile 400x700: card 1 visible, card 2 partially visible, card 3 completely offscreen
      const c1 = createMockCard({ id: '1', bounds: { width: 360, height: 220, top: 40, bottom: 260, left: 20, right: 380 } });
      const c2 = createMockCard({ id: '2', bounds: { width: 360, height: 220, top: 300, bottom: 520, left: 20, right: 380 } });
      const c3 = createMockCard({ id: '3', bounds: { width: 360, height: 220, top: 750, bottom: 970, left: 20, right: 380 } }); // Offscreen

      const grid = createMockElement('div', { id: 'work-grid' }, [c1, c2, c3]);

      const selected = selectCriticalWorkImages(grid, { viewportWidth: 400, viewportHeight: 700 });
      assert.strictEqual(selected.length, 2);
      assert.strictEqual(selected[0].id, 'img-1');
      assert.strictEqual(selected[1].id, 'img-2');
    });

    it('excludes cards that are horizontally outside viewport boundaries', () => {
      // Horizontal overflow / scrolled off horizontally
      const c1 = createMockCard({ id: '1', bounds: { width: 350, height: 200, top: 50, bottom: 250, left: 50, right: 400 } });
      const cOff = createMockCard({ id: 'off', bounds: { width: 350, height: 200, top: 50, bottom: 250, left: 1300, right: 1650 } }); // Beyond 1200px width

      const grid = createMockElement('div', { id: 'work-grid' }, [c1, cOff]);

      const selected = selectCriticalWorkImages(grid, { viewportWidth: 1200, viewportHeight: 800 });
      assert.strictEqual(selected.length, 1);
      assert.strictEqual(selected[0].id, 'img-1');
    });

    it('excludes hidden and filtered-out cards', () => {
      const c1 = createMockCard({ id: '1', bounds: { width: 350, height: 200, top: 50, bottom: 250, left: 50, right: 400 } });
      const cFiltered = createMockCard({ id: 'filtered', isFilteredOut: true, bounds: { width: 350, height: 200, top: 50, bottom: 250, left: 450, right: 800 } });
      const cHidden = createMockCard({ id: 'hidden', hidden: true, bounds: { width: 350, height: 200, top: 50, bottom: 250, left: 850, right: 1200 } });

      const grid = createMockElement('div', { id: 'work-grid' }, [c1, cFiltered, cHidden]);

      const selected = selectCriticalWorkImages(grid, { viewportWidth: 1200, viewportHeight: 800 });
      assert.strictEqual(selected.length, 1);
      assert.strictEqual(selected[0].id, 'img-1');
    });

    it('uses hybrid eager-hint fallback when geometry is unmeasurable (mock DOM)', () => {
      // When all bounds are 0x0
      const c1 = createMockCard({ id: '1', loading: 'eager', bounds: { width: 0, height: 0, top: 0, bottom: 0, left: 0, right: 0 } });
      const c2 = createMockCard({ id: '2', loading: 'eager', bounds: { width: 0, height: 0, top: 0, bottom: 0, left: 0, right: 0 } });
      const c3 = createMockCard({ id: '3', loading: 'lazy', bounds: { width: 0, height: 0, top: 0, bottom: 0, left: 0, right: 0 } });

      const grid = createMockElement('div', { id: 'work-grid' }, [c1, c2, c3]);

      const selected = selectCriticalWorkImages(grid);
      assert.strictEqual(selected.length, 2);
      assert.strictEqual(selected[0].id, 'img-1');
      assert.strictEqual(selected[1].id, 'img-2');
    });
  });

  describe('Group B3: Verified Fallback Evidence (Amendment 4)', () => {
    it('confirms verified fallback when card has cover and authentic concept badge', () => {
      const card = createMockCard({ id: '1', hasVerifiedFallbackUI: true });
      const img = card.querySelector('img');
      assert.strictEqual(hasVerifiedFallback(img), true);
    });

    it('confirms verified fallback when explicit data-fallback-verified is set', () => {
      const card = createMockCard({ id: '2', hasVerifiedFallbackUI: false, imgProps: { dataset: { fallbackVerified: 'true' } } });
      const img = card.querySelector('img');
      assert.strictEqual(hasVerifiedFallback(img), true);
    });

    it('rejects verified fallback when card has no visual badges or cover structure', () => {
      const bareImg = createMockElement('img', { id: 'bare' });
      assert.strictEqual(hasVerifiedFallback(bareImg), false);

      const card = createMockCard({ id: '3', hasVerifiedFallbackUI: false });
      const cardImg = card.querySelector('img');
      assert.strictEqual(hasVerifiedFallback(cardImg), false);
    });
  });

  describe('Group B4: Image Decode & Readiness Assessment', () => {
    it('evaluates successful image decode to status "decoded"', async () => {
      const card = createMockCard({
        id: '1',
        imgProps: {
          decode: () => Promise.resolve(),
          naturalWidth: 800
        }
      });
      const img = card.querySelector('img');

      const res = await evaluateImageReadiness(img);
      assert.strictEqual(res.status, 'decoded');
    });

    it('evaluates decode rejection with verified fallback to status "fallback"', async () => {
      const card = createMockCard({
        id: '1',
        hasVerifiedFallbackUI: true,
        imgProps: {
          decode: () => Promise.reject(new Error('Corrupt WebP chunk'))
        }
      });
      const img = card.querySelector('img');

      const res = await evaluateImageReadiness(img);
      assert.strictEqual(res.status, 'fallback');
    });

    it('evaluates decode rejection without fallback to status "error"', async () => {
      const card = createMockCard({
        id: '1',
        hasVerifiedFallbackUI: false,
        imgProps: {
          decode: () => Promise.reject(new Error('Network 404'))
        }
      });
      const img = card.querySelector('img');

      const res = await evaluateImageReadiness(img);
      assert.strictEqual(res.status, 'error');
    });

    it('awaitWorkFirstViewReady returns CRITICAL_MEDIA_READY when all critical images decode', async () => {
      const c1 = createMockCard({ id: '1', imgProps: { decode: () => Promise.resolve(), naturalWidth: 800 } });
      const c2 = createMockCard({ id: '2', imgProps: { decode: () => Promise.resolve(), naturalWidth: 800 } });
      const grid = createMockElement('div', { id: 'work-grid' }, [c1, c2]);
      const main = createMockElement('main', { id: 'main' }, [grid]);
      const root = { querySelector: () => main };

      const res = await awaitWorkFirstViewReady({ root });
      assert.strictEqual(res.outcome, WORK_READINESS_OUTCOMES.CRITICAL_MEDIA_READY);
      assert.strictEqual(res.criticalCount, 2);
      assert.strictEqual(res.decodedCount, 2);
      assert.strictEqual(res.fallbackCount, 0);
    });

    it('awaitWorkFirstViewReady returns VERIFIED_FALLBACK_READY when decode fails but fallback is verified', async () => {
      const c1 = createMockCard({ id: '1', hasVerifiedFallbackUI: true, imgProps: { decode: () => Promise.resolve(), naturalWidth: 800 } });
      const c2 = createMockCard({ id: '2', hasVerifiedFallbackUI: true, imgProps: { decode: () => Promise.reject(new Error('Offline')), naturalWidth: 0 } });
      const grid = createMockElement('div', { id: 'work-grid' }, [c1, c2]);
      const main = createMockElement('main', { id: 'main' }, [grid]);
      const root = { querySelector: () => main };

      const res = await awaitWorkFirstViewReady({ root });
      assert.strictEqual(res.outcome, WORK_READINESS_OUTCOMES.VERIFIED_FALLBACK_READY);
      assert.strictEqual(res.criticalCount, 2);
      assert.strictEqual(res.decodedCount, 1);
      assert.strictEqual(res.fallbackCount, 1);
    });

    it('awaitWorkFirstViewReady returns RECOVERABLE_ERROR when decode fails without verified fallback', async () => {
      const c1 = createMockCard({ id: '1', hasVerifiedFallbackUI: false, imgProps: { decode: () => Promise.reject(new Error('Missing')), naturalWidth: 0 } });
      const grid = createMockElement('div', { id: 'work-grid' }, [c1]);
      const main = createMockElement('main', { id: 'main' }, [grid]);
      const root = { querySelector: () => main };

      const res = await awaitWorkFirstViewReady({ root });
      assert.strictEqual(res.outcome, WORK_READINESS_OUTCOMES.RECOVERABLE_ERROR);
    });
  });

  describe('Group B5: Timeout Integrity & Configurable Deadlines (Amendment 4)', () => {
    it('STRICT TIMEOUT INTEGRITY: timeout returns TIMED_OUT (NEVER CRITICAL_MEDIA_READY)', async () => {
      // Hanging decode promise that never settles
      const c1 = createMockCard({ id: '1', imgProps: { decode: () => new Promise(() => {}) } });
      const grid = createMockElement('div', { id: 'work-grid' }, [c1]);
      const main = createMockElement('main', { id: 'main' }, [grid]);
      const root = { querySelector: () => main };

      // Configurable deadline: 50ms safety timeout
      const res = await awaitWorkFirstViewReady({
        root,
        safetyTimeoutMs: 50,
        decodeTimeoutMs: 30
      });

      assert.strictEqual(res.outcome, WORK_READINESS_OUTCOMES.TIMED_OUT);
      assert.notStrictEqual(res.outcome, WORK_READINESS_OUTCOMES.CRITICAL_MEDIA_READY);
      assert.notStrictEqual(res.outcome, WORK_READINESS_OUTCOMES.VERIFIED_FALLBACK_READY);
    });

    it('respects caller-configured safetyTimeoutMs and decodeTimeoutMs values', async () => {
      const c1 = createMockCard({ id: '1', imgProps: { decode: () => new Promise(() => {}) } });
      const grid = createMockElement('div', { id: 'work-grid' }, [c1]);
      const main = createMockElement('main', { id: 'main' }, [grid]);
      const root = { querySelector: () => main };

      const start = Date.now();
      const res = await awaitWorkFirstViewReady({
        root,
        safetyTimeoutMs: 60,
        decodeTimeoutMs: 40
      });
      const elapsed = Date.now() - start;

      assert.strictEqual(res.outcome, WORK_READINESS_OUTCOMES.TIMED_OUT);
      assert.ok(elapsed >= 35, `Elapsed time should be at least ~40ms, got ${elapsed}ms`);
      assert.ok(elapsed < 200, `Elapsed time should be bounded by test timeout, got ${elapsed}ms`);
    });

    it('cancels immediately and returns ABORTED when signal is triggered', async () => {
      const controller = new AbortController();
      controller.abort();

      const c1 = createMockCard({ id: '1' });
      const grid = createMockElement('div', { id: 'work-grid' }, [c1]);
      const main = createMockElement('main', { id: 'main' }, [grid]);
      const root = { querySelector: () => main };

      const res = await awaitWorkFirstViewReady({ root, signal: controller.signal });
      assert.strictEqual(res.outcome, WORK_READINESS_OUTCOMES.ABORTED);
    });
  });

});

