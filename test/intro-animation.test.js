import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  shouldShowIntro,
  markShown,
  prefersReducedMotion,
  initIntro,
  DUR_MS,
  MAX_WAIT_MS,
  ASSET_PATHS
} from '../public/js/features/intro/intro.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Intro Controller: Server/headless environment safety and constants', () => {
  // Should never crash when window/document are undefined
  assert.equal(shouldShowIntro(), false);
  assert.equal(prefersReducedMotion(), false);
  assert.doesNotThrow(() => markShown());
  assert.doesNotThrow(() => initIntro());

  // Verify Phase 5A Concept 06 V2 timing constants
  assert.equal(DUR_MS, 4200, 'Duration must match approved reference pacing (4200ms)');
  assert.equal(MAX_WAIT_MS, 5200, 'Hard timeout must provide bounded safety margin (5200ms)');
  assert.ok(ASSET_PATHS.white, 'Must define white layer asset path');
  assert.ok(ASSET_PATHS.black, 'Must define black layer asset path');
  assert.ok(ASSET_PATHS.metal, 'Must define metal layer asset path');
  assert.ok(ASSET_PATHS.rim, 'Must define rim layer asset path');
  assert.ok(ASSET_PATHS.depth, 'Must define depth layer asset path');
});

test('Intro Controller: Session storage guard logic', () => {
  const mockStorage = {};
  global.window = {
    location: { pathname: '/' },
    matchMedia: (query) => ({ matches: false })
  };
  global.sessionStorage = {
    getItem: (key) => mockStorage[key] || null,
    setItem: (key, val) => {
      mockStorage[key] = String(val);
    }
  };

  try {
    // First visit: should show intro
    assert.equal(shouldShowIntro(), true);

    // After markShown: should skip intro
    markShown();
    assert.equal(mockStorage['mondo_intro_shown'], '1');
    assert.equal(shouldShowIntro(), false);

    // Admin routes must always skip intro even on fresh session
    delete mockStorage['mondo_intro_shown'];
    global.window.location.pathname = '/admin';
    assert.equal(shouldShowIntro(), false);
    global.window.location.pathname = '/admin/settings';
    assert.equal(shouldShowIntro(), false);

    // Reset path
    global.window.location.pathname = '/';

    // Storage access failure fails safely
    global.sessionStorage.getItem = () => {
      throw new Error('SecurityError: storage disabled');
    };
    assert.equal(shouldShowIntro(), false);
  } finally {
    delete global.window;
    delete global.sessionStorage;
  }
});

test('Intro Controller: Reduced motion detection', () => {
  global.window = {
    matchMedia: (query) => ({
      matches: query.includes('prefers-reduced-motion: reduce')
    })
  };

  try {
    assert.equal(prefersReducedMotion(), true);
  } finally {
    delete global.window;
  }
});

test('Intro CSS: Phase 5A Canvas overlay, header target, and accessibility rules', () => {
  const cssPath = path.join(rootDir, 'public', 'css', 'features', 'intro.css');
  assert.ok(fs.existsSync(cssPath), 'intro.css must exist');
  const css = fs.readFileSync(cssPath, 'utf8');

  // Verify overlay container
  assert.ok(css.includes('.mondo-intro'), 'Must define .mondo-intro container');
  assert.ok(css.includes('z-index: 9999'), 'Intro overlay must have top z-index (9999)');
  assert.ok(css.includes('background-color: #000000'), 'Intro overlay starts with true black background');

  // Verify stage canvas rules
  assert.ok(css.includes('.mondo-intro__stage'), 'Must define .mondo-intro__stage canvas styles');
  assert.ok(css.includes('pointer-events: none'), 'Canvas stage must be pointer-events: none');
  assert.ok(css.includes('position: fixed'), 'Canvas stage must be fixed full-screen');

  // Verify real header logo coordinate protection
  assert.ok(
    css.includes('.brand-mark--intro-target'),
    'Must hide target header mark during handoff to prevent double logo'
  );
  assert.ok(css.includes('opacity: 0 !important'), 'Target mark must be opacity: 0 during flight');

  // Verify reduced motion handling
  assert.ok(
    css.includes('@media (prefers-reduced-motion: reduce)'),
    'Must include reduced motion query'
  );
});

test('Intro HTML: Phase 5A Asset preloads, canvas markup, and session check', () => {
  const htmlPath = path.join(rootDir, 'public', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Preload logo assets
  assert.ok(
    html.includes('<link rel="preload" as="image" href="/assets/mondo-mark.webp" type="image/webp" />'),
    'HTML must preload /assets/mondo-mark.webp for header docking'
  );
  assert.ok(
    html.includes('href="/assets/intro/mondo-white.png"'),
    'HTML must preload mondo-white.png'
  );
  assert.ok(
    html.includes('href="/assets/intro/mondo-black.png"'),
    'HTML must preload mondo-black.png'
  );
  assert.ok(
    html.includes('href="/assets/intro/mondo-metal.png"'),
    'HTML must preload mondo-metal.png'
  );
  assert.ok(
    html.includes('href="/assets/intro/mondo-rim.png"'),
    'HTML must preload mondo-rim.png'
  );
  assert.ok(
    html.includes('href="/assets/intro/mondo-depth.png"'),
    'HTML must preload mondo-depth.png'
  );

  // Synchronous head script for has-intro
  assert.ok(
    html.includes('has-intro'),
    'HTML head must set has-intro synchronously to prevent homepage flash'
  );
  assert.ok(
    html.includes('mondo_intro_shown'),
    'Head script must check mondo_intro_shown session storage'
  );
  assert.ok(
    html.includes('prefers-reduced-motion'),
    'Head script must respect prefers-reduced-motion'
  );

  // Canvas markup in intro
  assert.ok(
    html.includes('class="mondo-intro" id="mondo-intro"'),
    'Must have #mondo-intro container element'
  );
  assert.ok(
    html.includes('id="mondo-intro-stage"'),
    'Must have #mondo-intro-stage canvas element'
  );
});

test('Phase 5A Asset Integrity: 5 authentic visual layer PNG files exist and are valid', () => {
  const layers = [
    'public/assets/intro/mondo-white.png',
    'public/assets/intro/mondo-black.png',
    'public/assets/intro/mondo-metal.png',
    'public/assets/intro/mondo-rim.png',
    'public/assets/intro/mondo-depth.png'
  ];

  for (const layer of layers) {
    const fullPath = path.join(rootDir, layer);
    assert.ok(fs.existsSync(fullPath), `Layer asset must exist: ${layer}`);
    const stat = fs.statSync(fullPath);
    assert.ok(stat.size > 50000, `Layer asset must be non-empty: ${layer} (${stat.size} bytes)`);

    // Verify 610x870 dimensions from PNG header
    const buf = fs.readFileSync(fullPath);
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    assert.equal(width, 610, `Layer ${layer} width must be 610`);
    assert.equal(height, 870, `Layer ${layer} height must be 870`);
  }
});
