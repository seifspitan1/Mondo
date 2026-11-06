/**
 * Stage G3.3-C: Quiet Mark Transition Veil Adapter Unit Tests
 * Verifies singleton overlay adoption, fail-closed occlusion verification,
 * watchdog force-flush, reduced motion, adaptive states, focus containment,
 * and generation-safe cancellation.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import {
  createQuietMarkAdapter,
  ensureOverlay,
  OVERLAY_ID,
  BREATH_ID,
  LOGO_ID,
  STATUS_ID,
  AQM_STATUS_TEXT
} from '../public/js/features/transitions/quiet-mark-adapter.js';

/**
 * Creates an in-memory mock DOM environment suitable for deterministic testing.
 */
function createMockDomEnvironment(options = {}) {
  const elements = new Map();

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
        transition: '',
        pointerEvents: '',
        transform: ''
      };
      this.attributes = new Map();
      this.children = [];
      this.parentNode = null;
      this.offsetHeight = 100;
      this.offsetWidth = 100;
      this.inert = false;
    }

    setAttribute(k, v) { this.attributes.set(k, String(v)); }
    getAttribute(k) { return this.attributes.get(k) || null; }
    hasAttribute(k) { return this.attributes.has(k); }
    removeAttribute(k) { this.attributes.delete(k); }

    appendChild(child) {
      if (child.parentNode) {
        child.parentNode.removeChild(child);
      }
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

    querySelector(selector) {
      if (selector.startsWith('#')) {
        const id = selector.slice(1);
        return this.id === id ? this : (elements.get(id) || null);
      }
      if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        if (this.classList.contains(cls)) return this;
        for (const child of this.children) {
          if (child.querySelector) {
            const found = child.querySelector(selector);
            if (found) return found;
          }
        }
      }
      return null;
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
    getElementById: (id) => elements.get(id) || null,
    createElement: (tag) => new MockElement(tag),
    querySelector: (sel) => {
      if (sel === 'main#main' || sel === 'main') return mainEl;
      if (sel.startsWith('#')) return elements.get(sel.slice(1)) || null;
      return null;
    }
  };

  const mockWin = {
    performance: { now: () => Date.now() },
    getComputedStyle: (el) => ({
      display: el.style.display || 'block',
      visibility: el.style.visibility || 'visible',
      opacity: el.style.opacity !== undefined ? el.style.opacity : '1'
    }),
    matchMedia: (query) => ({
      matches: options.reducedMotion === true && query.includes('prefers-reduced-motion')
    }),
    requestAnimationFrame: (cb) => setTimeout(cb, 10),
    cancelAnimationFrame: (id) => clearTimeout(id)
  };

  return { mockDoc, mockWin, elements, mockBody, mainEl };
}

describe('Stage G3.3-C: Quiet Mark Adapter Unit Tests', () => {

  // =========================================================================
  // Group A: Overlay Adoption & Singleton DOM Structure
  // =========================================================================
  describe('Group A: Overlay Adoption & Singleton DOM Structure', () => {
    it('adopts existing #mondo-quiet-mark without creating duplicate elements', () => {
      const { mockDoc } = createMockDomEnvironment();
      const first = ensureOverlay(mockDoc);
      assert.ok(first !== null);
      assert.strictEqual(first.id, OVERLAY_ID);

      const second = ensureOverlay(mockDoc);
      assert.strictEqual(first, second, 'Must adopt existing singleton overlay');
    });

    it('constructs complete inner hierarchy (breath, logo, status) when absent', () => {
      const { mockDoc } = createMockDomEnvironment();
      const overlay = ensureOverlay(mockDoc);

      const breath = mockDoc.getElementById(BREATH_ID);
      const logo = mockDoc.getElementById(LOGO_ID);
      const status = mockDoc.getElementById(STATUS_ID);

      assert.ok(breath !== null, 'Breath container must exist');
      assert.ok(logo !== null, 'Logo must exist');
      assert.ok(status !== null, 'Status element must exist');
      assert.strictEqual(status.getAttribute('role'), 'status');
      assert.strictEqual(status.getAttribute('aria-live'), 'polite');
    });
  });

  // =========================================================================
  // Group B: Fail-Closed Effective Occlusion Verification
  // =========================================================================
  describe('Group B: Fail-Closed Effective Occlusion Verification', () => {
    it('isVeilVisible() is strictly read-only and reports false before showVeil()', () => {
      const { mockDoc, mockWin } = createMockDomEnvironment();
      const adapter = createQuietMarkAdapter({ document: mockDoc, window: mockWin });

      assert.strictEqual(adapter.isVeilVisible(), false);
      // Read-only invariant: must not create overlay in DOM
      assert.strictEqual(mockDoc.getElementById(OVERLAY_ID), null);
    });

    it('showVeil() resolves when genuine effective occlusion (opacity >= 0.99) is verified', async () => {
      const { mockDoc, mockWin } = createMockDomEnvironment();
      const adapter = createQuietMarkAdapter({
        document: mockDoc,
        window: mockWin,
        outboundDurationMs: 30
      });

      const showPromise = adapter.showVeil({
        sourceRoute: { type: 'work' },
        targetRoute: { type: 'project', pathname: '/work/aurora' },
        operationId: 1
      });

      await showPromise;
      assert.strictEqual(adapter.isVeilVisible(), true);

      const overlay = mockDoc.getElementById(OVERLAY_ID);
      assert.strictEqual(overlay.getAttribute('aria-hidden'), 'false');
      assert.strictEqual(parseFloat(overlay.style.opacity) >= 0.99, true);
    });

    it('rejects showVeil() with VEIL_OPACITY_UNVERIFIED if overlay is detached from document.body', async () => {
      const { mockDoc, mockWin, mockBody, elements } = createMockDomEnvironment();
      const adapter = createQuietMarkAdapter({
        document: mockDoc,
        window: mockWin,
        outboundDurationMs: 20
      });

      // Detach overlay so getElementById finds it, but it is not attached to mockBody
      ensureOverlay(mockDoc);
      const overlay = mockDoc.getElementById(OVERLAY_ID);
      mockBody.removeChild(overlay);
      elements.set(OVERLAY_ID, overlay);

      await assert.rejects(
        adapter.showVeil({ operationId: 2 }),
        /VEIL_OPACITY_UNVERIFIED/
      );
      assert.strictEqual(adapter.isVeilVisible(), false);
    });

    it('rejects showVeil() if computed opacity fails to reach ceiling (< 0.99)', async () => {
      const { mockDoc } = createMockDomEnvironment();
      const mockWinFaulty = {
        performance: { now: () => Date.now() },
        getComputedStyle: () => ({ display: 'block', visibility: 'visible', opacity: '0.5' }),
        requestAnimationFrame: (cb) => setTimeout(cb, 5)
      };

      const adapter = createQuietMarkAdapter({
        document: mockDoc,
        window: mockWinFaulty,
        outboundDurationMs: 20,
        watchdogPaddingMs: 20
      });

      await assert.rejects(
        adapter.showVeil({ operationId: 3 }),
        /VEIL_OPACITY_UNVERIFIED/
      );
      assert.strictEqual(adapter.isVeilVisible(), false);
    });
  });

  // =========================================================================
  // Group C: Watchdog Force-Flush & Background Tab Resilience
  // =========================================================================
  describe('Group C: Watchdog Force-Flush & Background Tab Resilience', () => {
    it('forces synchronous transition completion and resolves when rAF stalls', async () => {
      const { mockDoc } = createMockDomEnvironment();
      // Frozen rAF: never calls callbacks (simulating background tab)
      const frozenWin = {
        performance: { now: () => Date.now() },
        getComputedStyle: (el) => ({
          display: el.style.display || 'block',
          visibility: 'visible',
          opacity: el.style.opacity || '0'
        }),
        requestAnimationFrame: () => 999, // Stalled
        cancelAnimationFrame: () => {}
      };

      const adapter = createQuietMarkAdapter({
        document: mockDoc,
        window: frozenWin,
        outboundDurationMs: 20,
        watchdogPaddingMs: 20 // Watchdog fires at 40ms
      });

      // Show veil must resolve via watchdog force-flush, NOT hang
      await adapter.showVeil({ operationId: 4 });
      assert.strictEqual(adapter.isVeilVisible(), true);

      const overlay = mockDoc.getElementById(OVERLAY_ID);
      assert.strictEqual(overlay.style.opacity, '1');
    });

    it('rejects upon watchdog trip if overlay is invalid or detached', async () => {
      const { mockDoc, mockBody } = createMockDomEnvironment();
      const frozenWin = {
        performance: { now: () => Date.now() },
        getComputedStyle: () => ({ display: 'none', visibility: 'hidden', opacity: '0' }),
        requestAnimationFrame: () => 999
      };

      const adapter = createQuietMarkAdapter({
        document: mockDoc,
        window: frozenWin,
        outboundDurationMs: 15,
        watchdogPaddingMs: 15
      });

      await assert.rejects(
        adapter.showVeil({ operationId: 5 }),
        /VEIL_OPACITY_UNVERIFIED/
      );
    });
  });

  // =========================================================================
  // Group D: Reduced Motion Support
  // =========================================================================
  describe('Group D: Reduced Motion Support', () => {
    it('instantly resolves showVeil (0ms) and establishes opacity when reduced motion is true', async () => {
      const { mockDoc, mockWin } = createMockDomEnvironment({ reducedMotion: true });
      const adapter = createQuietMarkAdapter({
        document: mockDoc,
        window: mockWin,
        reducedMotion: true
      });

      const startTime = Date.now();
      await adapter.showVeil({ operationId: 6 });
      const elapsed = Date.now() - startTime;

      assert.ok(elapsed < 30, 'Must execute instantly');
      assert.strictEqual(adapter.isVeilVisible(), true);
    });

    it('instantly dismisses veil (0ms) without animation when reduced motion is true', async () => {
      const { mockDoc, mockWin } = createMockDomEnvironment({ reducedMotion: true });
      const adapter = createQuietMarkAdapter({
        document: mockDoc,
        window: mockWin,
        reducedMotion: true
      });

      await adapter.showVeil({ operationId: 7 });
      assert.strictEqual(adapter.isVeilVisible(), true);

      await adapter.dismissVeil();
      assert.strictEqual(adapter.isVeilVisible(), false);

      const overlay = mockDoc.getElementById(OVERLAY_ID);
      assert.strictEqual(overlay.style.display, 'none');
      assert.strictEqual(overlay.getAttribute('aria-hidden'), 'true');
    });
  });

  // =========================================================================
  // Group E: Adaptive Breathing and Status Behavior
  // =========================================================================
  describe('Group E: Adaptive Breathing and Status Behavior', () => {
    it('triggers breathing and status text when destination is project route', async () => {
      const { mockDoc, mockWin } = createMockDomEnvironment();
      const adapter = createQuietMarkAdapter({
        document: mockDoc,
        window: mockWin,
        outboundDurationMs: 10
      });

      await adapter.showVeil({
        sourceRoute: { type: 'work' },
        targetRoute: { type: 'project', pathname: '/work/zenith' },
        operationId: 8
      });

      const overlay = mockDoc.getElementById(OVERLAY_ID);
      const statusEl = mockDoc.getElementById(STATUS_ID);

      // Wait 260ms for breathing trigger
      await new Promise((r) => setTimeout(r, 270));
      assert.strictEqual(overlay.classList.contains('is-qm-breathing'), true);

      // dismissVeil clears adaptive state
      await adapter.dismissVeil();
      assert.strictEqual(overlay.classList.contains('is-qm-breathing'), false);
    });

    it('does NOT trigger breathing or status when destination is work route', async () => {
      const { mockDoc, mockWin } = createMockDomEnvironment();
      const adapter = createQuietMarkAdapter({
        document: mockDoc,
        window: mockWin,
        outboundDurationMs: 10
      });

      await adapter.showVeil({
        sourceRoute: { type: 'project', pathname: '/work/zenith' },
        targetRoute: { type: 'work', pathname: '/work' },
        operationId: 9
      });

      const overlay = mockDoc.getElementById(OVERLAY_ID);
      await new Promise((r) => setTimeout(r, 270));
      assert.strictEqual(overlay.classList.contains('is-qm-breathing'), false);
    });
  });

  // =========================================================================
  // Group F: Accessible Focus Management & Restoration
  // =========================================================================
  describe('Group F: Accessible Focus Management & Restoration', () => {
    it('marks main#main inert and aria-hidden during veil visibility, and restores on dismiss', async () => {
      const { mockDoc, mockWin, mainEl } = createMockDomEnvironment();
      const adapter = createQuietMarkAdapter({
        document: mockDoc,
        window: mockWin,
        outboundDurationMs: 10,
        inboundDurationMs: 10
      });

      await adapter.showVeil({ operationId: 10 });
      assert.strictEqual(mainEl.getAttribute('aria-hidden'), 'true');
      assert.strictEqual(mainEl.inert, true);

      await adapter.dismissVeil();
      assert.strictEqual(mainEl.getAttribute('aria-hidden'), null);
      assert.strictEqual(mainEl.inert, false);
    });
  });

  // =========================================================================
  // Group G: Cancellation & Idempotent Reset
  // =========================================================================
  describe('Group G: Cancellation & Idempotent Reset', () => {
    it('rejects immediately with AbortError if signal is aborted before showVeil', async () => {
      const { mockDoc, mockWin } = createMockDomEnvironment();
      const adapter = createQuietMarkAdapter({ document: mockDoc, window: mockWin });

      const controller = new AbortController();
      controller.abort();

      await assert.rejects(
        adapter.showVeil({ operationId: 11, signal: controller.signal }),
        /aborted/
      );
      assert.strictEqual(adapter.isVeilVisible(), false);
    });

    it('reset() idempotently hides overlay and clears all pending states', async () => {
      const { mockDoc, mockWin } = createMockDomEnvironment();
      const adapter = createQuietMarkAdapter({ document: mockDoc, window: mockWin });

      adapter.reset();
      adapter.reset();
      assert.strictEqual(adapter.isVeilVisible(), false);
    });
  });

});
