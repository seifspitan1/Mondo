import { test, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  initNavigation,
  scrollToAnchor
} from '../public/js/features/navigation/navigation.js';
import {
  initLenis,
  stopLenis,
  getLenis,
  initDirectWheel,
  stopDirectWheel,
  initSmoothInertia,
  stopSmoothInertia
} from '../public/js/features/navigation/lenis-scroll.js';
import * as siteModule from '../public/js/site.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

describe('MONDO — SCROLL REFINEMENT 01-R4: Match ShatormFX Scroll Experience', () => {

  describe('1. Removal of Scroll Progress Indicator (Preserved)', () => {
    it('scroll-progress.js module does not exist in the codebase', () => {
      const modulePath = path.join(publicDir, 'js', 'features', 'navigation', 'scroll-progress.js');
      assert.equal(fs.existsSync(modulePath), false, 'scroll-progress.js must not exist');
    });

    it('site.js does not import, reference, or initialize scroll progress', () => {
      const siteContent = fs.readFileSync(path.join(publicDir, 'js', 'site.js'), 'utf8');
      assert.equal(siteContent.includes('scroll-progress'), false);
      assert.equal(siteContent.includes('initScrollProgress'), false);
      assert.equal(siteModule.initScrollProgress, undefined);
    });

    it('header.css does not contain .scroll-progress or .scroll-progress-bar rules', () => {
      const headerCss = fs.readFileSync(path.join(publicDir, 'css', 'layout', 'header.css'), 'utf8');
      assert.equal(headerCss.includes('.scroll-progress'), false);
      assert.equal(headerCss.includes('.scroll-progress-bar'), false);
    });

    const publicPages = [
      'index.html',
      'work/index.html',
      'work/project.html',
      'start/index.html',
      'privacy/index.html'
    ];

    publicPages.forEach((pageRel) => {
      it(`public/${pageRel} does not contain .scroll-progress markup`, () => {
        const filePath = path.join(publicDir, pageRel);
        const html = fs.readFileSync(filePath, 'utf8');
        assert.equal(html.includes('scroll-progress'), false, `${pageRel} must not contain scroll-progress elements`);
        assert.equal(html.includes('scroll-progress-bar'), false, `${pageRel} must not contain scroll-progress-bar elements`);
      });
    });
  });

  describe('2. Navbar Anchor Alignment & Visible Element Targeting', () => {
    it('scrollToAnchor measures the first meaningful visible element (.eyebrow) with 28px desktop clearance', () => {
      let scrolledTo = null;
      const mockEyebrow = {
        getBoundingClientRect: () => ({ top: 1296 })
      };
      const mockSection = {
        id: 'services',
        getBoundingClientRect: () => ({ top: 1200 }),
        querySelector: (sel) => (sel.includes('.eyebrow') ? mockEyebrow : null)
      };
      const mockHeader = {
        offsetHeight: 87,
        getBoundingClientRect: () => ({ height: 87 })
      };

      const prevDoc = globalThis.document;
      const prevWin = globalThis.window;

      globalThis.document = {
        getElementById: (id) => (id === 'services' ? mockSection : null),
        querySelector: (sel) => (sel === '.site-header' ? mockHeader : null)
      };
      globalThis.window = {
        pageYOffset: 0,
        innerWidth: 1440,
        matchMedia: () => ({ matches: false }),
        scrollTo: (opts) => { scrolledTo = opts; }
      };

      try {
        const success = scrollToAnchor('services', { smooth: true });
        assert.equal(success, true);
        // Eyebrow top: 1296. Header height: 87. Default desktop clearance: 28px (within 24-32px).
        // Target: 1296 - 87 - 28 = 1181.
        assert.equal(scrolledTo.top, 1181);
        assert.equal(scrolledTo.behavior, 'smooth');

        // Verify resulting clearance between header bottom (87px) and visible element (1296 - 1181 = 115px)
        const resultingClearance = (1296 - scrolledTo.top) - 87;
        assert.equal(resultingClearance, 28);
        assert.ok(resultingClearance >= 24 && resultingClearance <= 32, 'Desktop clearance must be in [24, 32]px range');
      } finally {
        globalThis.document = prevDoc;
        globalThis.window = prevWin;
      }
    });

    it('scrollToAnchor targets 20px clearance on mobile viewports (within 16-24px)', () => {
      let scrolledTo = null;
      const mockEyebrow = {
        getBoundingClientRect: () => ({ top: 864 })
      };
      const mockSection = {
        id: 'process',
        getBoundingClientRect: () => ({ top: 800 }),
        querySelector: (sel) => (sel.includes('.eyebrow') ? mockEyebrow : null)
      };
      const mockHeader = {
        offsetHeight: 73,
        getBoundingClientRect: () => ({ height: 73 })
      };

      const prevDoc = globalThis.document;
      const prevWin = globalThis.window;

      globalThis.document = {
        getElementById: (id) => (id === 'process' ? mockSection : null),
        querySelector: (sel) => (sel === '.site-header' ? mockHeader : null)
      };
      globalThis.window = {
        pageYOffset: 0,
        innerWidth: 390,
        matchMedia: () => ({ matches: false }),
        scrollTo: (opts) => { scrolledTo = opts; }
      };

      try {
        const success = scrollToAnchor('#process', { smooth: true });
        assert.equal(success, true);
        // Eyebrow top: 864. Header height: 73. Default mobile clearance: 20px (within 16-24px).
        // Target: 864 - 73 - 20 = 771.
        assert.equal(scrolledTo.top, 771);

        const resultingClearance = (864 - scrolledTo.top) - 73;
        assert.equal(resultingClearance, 20);
        assert.ok(resultingClearance >= 16 && resultingClearance <= 24, 'Mobile clearance must be in [16, 24]px range');
      } finally {
        globalThis.document = prevDoc;
        globalThis.window = prevWin;
      }
    });

    it('scrollToAnchor respects explicit clearance overrides if provided', () => {
      let scrolledTo = null;
      const mockSection = {
        id: 'packages',
        getBoundingClientRect: () => ({ top: 1500 }),
        querySelector: () => null
      };

      const prevDoc = globalThis.document;
      const prevWin = globalThis.window;

      globalThis.document = {
        getElementById: (id) => (id === 'packages' ? mockSection : null),
        querySelector: () => ({ offsetHeight: 87 })
      };
      globalThis.window = {
        pageYOffset: 0,
        innerWidth: 1440,
        matchMedia: () => ({ matches: false }),
        scrollTo: (opts) => { scrolledTo = opts; }
      };

      try {
        scrollToAnchor('packages', { clearance: 30 });
        // Target: 1500 - 87 - 30 = 1383
        assert.equal(scrolledTo.top, 1383);
      } finally {
        globalThis.document = prevDoc;
        globalThis.window = prevWin;
      }
    });

    it('scrollToAnchor switches to behavior: instant when prefers-reduced-motion is active', () => {
      let scrolledTo = null;
      const mockSection = {
        id: 'packages',
        getBoundingClientRect: () => ({ top: 2000 }),
        querySelector: () => null
      };

      const prevDoc = globalThis.document;
      const prevWin = globalThis.window;

      globalThis.document = {
        getElementById: (id) => (id === 'packages' ? mockSection : null),
        querySelector: () => ({ offsetHeight: 87 })
      };
      globalThis.window = {
        pageYOffset: 0,
        innerWidth: 1440,
        matchMedia: (q) => ({ matches: q.includes('prefers-reduced-motion') }),
        scrollTo: (opts) => { scrolledTo = opts; }
      };

      try {
        scrollToAnchor('packages', { smooth: true });
        assert.equal(scrolledTo.behavior, 'instant');
      } finally {
        globalThis.document = prevDoc;
        globalThis.window = prevWin;
      }
    });
  });

  describe('3. Pinned Lenis 1.3.8 Implementation (Matching ShatormFX Experience)', () => {
    it('pinned Lenis 1.3.8 distribution files exist locally in public/vendor/lenis', () => {
      const vendorMjs = path.join(publicDir, 'vendor', 'lenis', 'lenis.mjs');
      const vendorMin = path.join(publicDir, 'vendor', 'lenis', 'lenis.min.js');
      assert.ok(fs.existsSync(vendorMjs), 'lenis.mjs must exist in public/vendor/lenis');
      assert.ok(fs.existsSync(vendorMin), 'lenis.min.js must exist in public/vendor/lenis');
    });

    it('initLenis returns no-op when prefers-reduced-motion is active', () => {
      const mockWin = {
        matchMedia: (q) => ({ matches: q.includes('prefers-reduced-motion') }),
        navigator: { maxTouchPoints: 0 }
      };

      const cleanup = initLenis({ window: mockWin });
      assert.equal(getLenis(), null, 'Lenis must not initialize under reduced motion');
      cleanup();
    });

    it('initLenis returns no-op on touch / mobile devices', () => {
      const mockWin = {
        matchMedia: () => ({ matches: false }),
        navigator: { maxTouchPoints: 5 },
        ontouchstart: {}
      };

      const cleanup = initLenis({ window: mockWin });
      assert.equal(getLenis(), null, 'Lenis must not initialize on touch devices');
      cleanup();
    });

    it('stopLenis cleanly fulfills lifecycle contracts and binds global stop hooks', () => {
      assert.equal(typeof stopLenis, 'function');
      assert.doesNotThrow(() => stopLenis());
      assert.equal(typeof stopDirectWheel, 'function');
      assert.doesNotThrow(() => stopDirectWheel());
      assert.equal(typeof stopSmoothInertia, 'function');
      assert.doesNotThrow(() => stopSmoothInertia());
    });

    it('backward compatibility exports are preserved', () => {
      assert.equal(typeof initDirectWheel, 'function');
      assert.equal(typeof initSmoothInertia, 'function');
      assert.equal(typeof initLenis, 'function');
    });

    it('lenis-scroll.js configures wheelMultiplier to exactly 0.75 per Refinement 01-R5', () => {
      const source = fs.readFileSync(path.join(publicDir, 'js', 'features', 'navigation', 'lenis-scroll.js'), 'utf8');
      assert.match(source, /wheelMultiplier:\s*0\.75/);
    });
  });

  describe('4. Production Bundling & Manifest Constraints', () => {
    it('site.bundle.js is compiled and strictly adheres to the < 35,000 bytes budget', () => {
      const manifestPath = path.join(publicDir, 'dist', 'manifest.json');
      assert.ok(fs.existsSync(manifestPath), 'manifest.json must exist');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      const siteBundle = manifest.bundles['js/site.js'];
      assert.ok(siteBundle, 'js/site.js entry must exist in manifest');
      assert.ok(
        siteBundle.size < 35000,
        `site.bundle.js (${siteBundle.size} B) must remain strictly under 35,000 bytes`
      );

      const onDiskPath = path.join(publicDir, 'dist', 'js', 'site.bundle.js');
      const stat = fs.statSync(onDiskPath);
      assert.equal(stat.size, siteBundle.size, 'On-disk file size must exactly match manifest declared size');
    });

    it('site.js preserves all required public symbols and bootstrap functions', () => {
      assert.equal(typeof siteModule.initNavigation, 'function');
      assert.equal(typeof siteModule.initDirectWheel, 'function');
      assert.equal(typeof siteModule.initSmoothInertia, 'function');
      assert.equal(typeof siteModule.initQuietMark, 'function');
      assert.equal(typeof siteModule.escapeHtml, 'function');
      assert.equal(typeof siteModule.renderProjectCard, 'function');
      assert.equal(typeof siteModule.icons, 'object');
      assert.equal(typeof siteModule.track, 'function');
      assert.equal(typeof siteModule.initOfflinePreparation, 'function');
      assert.equal(typeof siteModule.isHybridPilotEnabled, 'function');
      assert.equal(typeof siteModule.DEFAULT_HYBRID_PILOT_ENABLED, 'boolean');
    });
  });
});
