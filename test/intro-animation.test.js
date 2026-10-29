import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  shouldShowIntro,
  markShown,
  prefersReducedMotion,
  initIntro
} from '../public/js/features/intro/intro.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Intro Controller: Server/headless environment safety', () => {
  // Should never crash when window/document are undefined
  assert.equal(shouldShowIntro(), false);
  assert.equal(prefersReducedMotion(), false);
  assert.doesNotThrow(() => markShown());
  assert.doesNotThrow(() => initIntro());
});

test('Intro Controller: Session storage guard logic', () => {
  const mockStorage = {};
  global.window = {
    location: { pathname: '/' },
    matchMedia: (query) => ({ matches: false })
  };
  global.sessionStorage = {
    getItem: (key) => mockStorage[key] || null,
    setItem: (key, val) => { mockStorage[key] = String(val); }
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
    global.sessionStorage.getItem = () => { throw new Error('SecurityError: storage disabled'); };
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

test('Intro CSS: Premium logo reveal, handoff, and backdrop reveal properties', () => {
  const cssPath = path.join(rootDir, 'public', 'css', 'features', 'intro.css');
  assert.ok(fs.existsSync(cssPath), 'intro.css must exist');
  const css = fs.readFileSync(cssPath, 'utf8');

  // Verify scale 0.97 initial state
  assert.ok(css.includes('scale(0.97)'), 'Intro logo initial scale must be 0.97 for soft entrance');
  assert.ok(css.includes('opacity: 0'), 'Intro logo must start with opacity 0');

  // Verify reveal state
  assert.ok(css.includes('.mondo-intro--reveal .mondo-intro__logo'), 'Must define reveal state');
  assert.ok(css.includes('scale(1)'), 'Reveal state must settle gently to scale(1)');

  // Verify handoff state
  assert.ok(css.includes('.mondo-intro--handoff .mondo-intro__logo'), 'Must define handoff state');
  assert.ok(css.includes('var(--handoff-tx'), 'Must use dynamic CSS transform variable --handoff-tx');
  assert.ok(css.includes('var(--handoff-ty'), 'Must use dynamic CSS transform variable --handoff-ty');
  assert.ok(css.includes('var(--handoff-scale'), 'Must use dynamic CSS transform variable --handoff-scale');

  // Verify backdrop page reveal
  assert.ok(css.includes('.mondo-intro::before'), 'Must have backdrop pseudo-element');
  assert.ok(css.includes('.mondo-intro--handoff::before'), 'Must fade backdrop during handoff');

  // Verify real header logo coordinate protection
  assert.ok(css.includes('.brand-mark--intro-target'), 'Must hide target header mark during handoff to prevent double logo');

  // Verify reduced motion handling
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'Must include reduced motion query');
});

test('Intro HTML: Flash-prevention script and image preload integrity', () => {
  const htmlPath = path.join(rootDir, 'public', 'index.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Preload logo asset
  assert.ok(
    html.includes('<link rel="preload" as="image" href="/assets/mondo-mark.webp" type="image/webp" />'),
    'HTML must preload /assets/mondo-mark.webp'
  );

  // Synchronous head script for has-intro
  assert.ok(html.includes('has-intro'), 'HTML head must set has-intro synchronously to prevent homepage flash');
  assert.ok(html.includes('mondo_intro_shown'), 'Head script must check mondo_intro_shown session storage');
  assert.ok(html.includes('prefers-reduced-motion'), 'Head script must respect prefers-reduced-motion');

  // Authentic logo markup in intro
  assert.ok(html.includes('class="mondo-intro" id="mondo-intro"'), 'Must have #mondo-intro element');
  assert.ok(html.includes('src="/assets/mondo-mark.webp"'), 'Intro must use authentic mondo-mark.webp asset');
});

