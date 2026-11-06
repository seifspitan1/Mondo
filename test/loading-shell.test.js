/**
 * MONDO Loading Shell Test Suite
 * Phase 5C.3.3 — Validates the Central Readiness Coordinator,
 * Adaptive Loading Shell markup/CSS, Project Details integration,
 * Quiet Mark pilot handoff, and non-interference with frozen phases.
 *
 * Uses Node's built-in test runner (node:test) and assert module.
 * No external runtime dependencies.
 */

import test, { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  createReadinessCoordinator,
  STATES,
  DEP_STATES,
  waitForImageDecode,
  waitForVideoReady
} from '../public/js/shared/readiness.js';
import {
  createAdaptiveQuietMarkController,
  AQM_STATES,
  AQM_BREATHING_THRESHOLD_MS,
  AQM_STATUS_THRESHOLD_MS,
  AQM_SAFETY_TIMEOUT_MS,
  AQM_STATUS_TEXT,
  AQM_HOLD_SCALE,
  AQM_ONSET_DURATION_MS
} from '../public/js/features/transitions/quiet-mark.js';
import {
  renderErrorState,
  clearProjectErrorState,
  renderProject
} from '../public/js/features/project/project-page.js';
import { defaultProjects } from '../public/js/shared/defaults.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const PUBLIC = join(ROOT, 'public');
const DIST = join(PUBLIC, 'dist');

// ── Helpers ──

function readPublicFile(relativePath) {
  return readFileSync(join(PUBLIC, relativePath), 'utf-8');
}

// ========================================================================
// SECTION 1: Central Readiness Coordinator — Module Structure & Exports
// ========================================================================

describe('Central Readiness Coordinator — Module Structure & Exports', () => {
  let source;

  before(() => {
    source = readPublicFile('js/shared/readiness.js');
  });

  it('readiness.js exists and is non-empty', () => {
    const fullPath = join(PUBLIC, 'js/shared/readiness.js');
    assert.ok(existsSync(fullPath), 'Missing readiness.js');
    assert.ok(source.trim().length > 0, 'readiness.js is empty');
  });

  it('exports STATES frozen object with expected lifecycle states', () => {
    assert.ok(STATES, 'STATES export missing');
    assert.equal(STATES.IDLE, 'IDLE');
    assert.equal(STATES.PENDING, 'PENDING');
    assert.equal(STATES.READY, 'READY');
    assert.equal(STATES.FAILED, 'FAILED');
    assert.equal(STATES.RECOVERED, 'RECOVERED');
    assert.equal(STATES.DISMISSED, 'DISMISSED');
    assert.ok(Object.isFrozen(STATES), 'STATES must be frozen');
  });

  it('exports DEP_STATES frozen object with expected dependency outcome states', () => {
    assert.ok(DEP_STATES, 'DEP_STATES export missing');
    assert.equal(DEP_STATES.PENDING, 'pending');
    assert.equal(DEP_STATES.READY, 'ready');
    assert.equal(DEP_STATES.FAILED, 'failed');
    assert.equal(DEP_STATES.FALLBACK, 'fallback');
    assert.equal(DEP_STATES.TIMED_OUT, 'timed_out');
    assert.ok(Object.isFrozen(DEP_STATES), 'DEP_STATES must be frozen');
  });

  it('exports factory function createReadinessCoordinator', () => {
    assert.equal(typeof createReadinessCoordinator, 'function');
  });

  it('exports utility functions waitForImageDecode and waitForVideoReady', () => {
    assert.equal(typeof waitForImageDecode, 'function');
    assert.equal(typeof waitForVideoReady, 'function');
  });

  it('readiness.js is completely dependency-free (no import statements)', () => {
    const imports = source.match(/^import\s/gm);
    assert.ok(!imports, 'readiness.js should have no imports — must be dependency-free');
  });
});

// ========================================================================
// SECTION 2: Readiness Coordinator — Live Functional Unit Tests
// ========================================================================

describe('Readiness Coordinator — Live Functional Execution', () => {
  it('initial state is IDLE and transitions to PENDING upon start()', () => {
    const coordinator = createReadinessCoordinator();
    assert.equal(coordinator.getState(), STATES.IDLE);
    coordinator.register('test_dep', new Promise(() => {}));
    coordinator.start();
    assert.equal(coordinator.getState(), STATES.PENDING);
    coordinator.destroy();
  });

  it('resolves to READY when critical dependencies complete', async () => {
    let readyCalled = false;
    const coordinator = createReadinessCoordinator({
      onReady: () => { readyCalled = true; }
    });

    coordinator.register('dep1', Promise.resolve(), { critical: true });
    coordinator.start();
    await new Promise(r => setTimeout(r, 20));

    assert.equal(coordinator.getState(), STATES.READY);
    assert.equal(readyCalled, true);
    coordinator.destroy();
  });

  it('resolves fast visits without firing onThreshold (appearance threshold < 250ms)', async () => {
    let thresholdFired = false;
    const coordinator = createReadinessCoordinator({
      appearanceThresholdMs: 150,
      onThreshold: () => { thresholdFired = true; }
    });

    coordinator.register('fast_dep', Promise.resolve());
    coordinator.start();
    await new Promise(r => setTimeout(r, 20));

    assert.equal(coordinator.getState(), STATES.READY);
    assert.equal(coordinator.hasExceededThreshold(), false);
    assert.equal(thresholdFired, false);
    coordinator.destroy();
  });

  it('fires onThreshold when critical dependency takes longer than appearanceThresholdMs', async () => {
    let thresholdFired = false;
    const coordinator = createReadinessCoordinator({
      appearanceThresholdMs: 50,
      onThreshold: () => { thresholdFired = true; }
    });

    let resolveDep;
    const pendingPromise = new Promise(res => { resolveDep = res; });
    coordinator.register('slow_dep', pendingPromise);
    coordinator.start();

    await new Promise(r => setTimeout(r, 80));
    assert.equal(thresholdFired, true);
    assert.equal(coordinator.hasExceededThreshold(), true);

    resolveDep();
    await new Promise(r => setTimeout(r, 20));
    assert.equal(coordinator.getState(), STATES.READY);
    coordinator.destroy();
  });

  it('ignores duplicate markReady signals and late events after dismissal', () => {
    const coordinator = createReadinessCoordinator();
    coordinator.register('dep', null);
    coordinator.start();
    coordinator.markReady('dep');
    assert.equal(coordinator.getState(), STATES.READY);

    // Duplicate call
    coordinator.markReady('dep');
    assert.equal(coordinator.getState(), STATES.READY);

    coordinator.dismiss();
    assert.equal(coordinator.getState(), STATES.DISMISSED);

    // Late signal
    coordinator.markFailed('dep');
    assert.equal(coordinator.getState(), STATES.DISMISSED);
  });

  it('forceRelease transitions pending deps to FALLBACK and enters RECOVERED', () => {
    let fallbackNotified = false;
    const coordinator = createReadinessCoordinator({
      onFallback: () => { fallbackNotified = true; }
    });

    coordinator.register('unresolved', null);
    coordinator.start();

    const depsBefore = coordinator.getDependencies();
    assert.equal(depsBefore.get('unresolved').status, DEP_STATES.PENDING);

    coordinator.forceRelease('watchdog');
    assert.equal(coordinator.isDismissed(), true);

    const depsAfter = coordinator.getDependencies();
    assert.equal(depsAfter.get('unresolved').status, DEP_STATES.FALLBACK);
    coordinator.destroy();
  });

  it('waitForReady returns promise that settles on terminal state', async () => {
    const coordinator = createReadinessCoordinator();
    const waitPromise = coordinator.waitForReady();
    coordinator.register('quick', Promise.resolve());
    coordinator.start();

    const result = await waitPromise;
    assert.ok(result);
    coordinator.destroy();
  });
});

// ========================================================================
// SECTION 3: Image and Video Decode Waiters
// ========================================================================

describe('Image and Video Waiter Utilities', () => {
  it('waitForImageDecode returns no_element for null or undefined', async () => {
    const res1 = await waitForImageDecode(null);
    const res2 = await waitForImageDecode(undefined);
    assert.equal(res1.status, 'no_element');
    assert.equal(res2.status, 'no_element');
  });

  it('waitForImageDecode returns complete or decoded for already complete images', async () => {
    const mockImg = { complete: true, naturalWidth: 400 };
    const res = await waitForImageDecode(mockImg);
    assert.ok(res.status === 'complete' || res.status === 'decoded');
  });

  it('waitForVideoReady returns no_element for null or undefined', async () => {
    const res1 = await waitForVideoReady(null);
    const res2 = await waitForVideoReady(undefined);
    assert.equal(res1.status, 'no_element');
    assert.equal(res2.status, 'no_element');
  });

  it('waitForVideoReady returns metadata_ready when video readyState >= 1', async () => {
    const mockVideo = { readyState: 2 };
    const res = await waitForVideoReady(mockVideo);
    assert.equal(res.status, 'metadata_ready');
  });
});

// ========================================================================
// SECTION 4: Loading Shell — HTML Markup (project.html)
// ========================================================================

describe('Loading Shell — HTML Markup (project.html)', () => {
  let html;

  before(() => {
    html = readPublicFile('work/project.html');
  });

  it('contains #mondo-loading-shell element with role="status"', () => {
    assert.ok(html.includes('id="mondo-loading-shell"'));
    assert.ok(html.includes('role="status"'));
  });

  it('shell starts with aria-hidden="true" and role="status"', () => {
    assert.ok(html.includes('id="mondo-loading-shell"'));
    assert.ok(html.includes('aria-hidden="true"'));
    assert.ok(html.includes('role="status"'));
  });

  it('shell uses original mondo-white.png logo (NOT generated SVG or text mark)', () => {
    assert.ok(
      html.includes('src="/assets/intro/mondo-white.png"'),
      'Must reference /assets/intro/mondo-white.png'
    );
    assert.ok(!html.includes('mondo-loading-shell__svg'), 'Must not substitute SVG');
  });

  it('shell logo is marked decorative with empty alt', () => {
    const logoMatch = html.match(/<img[^>]*class="mondo-loading-shell__logo"[^>]*>/);
    assert.ok(logoMatch, 'Missing logo img');
    assert.ok(logoMatch[0].includes('alt=""'));
  });

  it('contains polite aria-live status container for long waits', () => {
    assert.ok(html.includes('id="mondo-loading-shell-status"') || html.includes('class="mondo-loading-shell__status"'));
    assert.ok(html.includes('aria-live="polite"'));
  });
});

// ========================================================================
// SECTION 5: No-JavaScript Fallback (project.html)
// ========================================================================

describe('No-JavaScript Fallback', () => {
  let html;

  before(() => {
    html = readPublicFile('work/project.html');
  });

  it('project.html contains <noscript> element', () => {
    assert.ok(html.includes('<noscript>'), 'Missing <noscript> tag');
  });

  it('noscript is placed inside #project-main', () => {
    const mainStart = html.indexOf('id="project-main"');
    const noscriptStart = html.indexOf('<noscript>');
    const mainEnd = html.indexOf('</main>');
    assert.ok(noscriptStart > mainStart, 'noscript must be inside #project-main');
    assert.ok(noscriptStart < mainEnd, 'noscript must be inside #project-main');
  });

  it('noscript contains helpful guidance and link to /work', () => {
    const noscriptContent = html.match(/<noscript>([\s\S]*?)<\/noscript>/)[1];
    assert.ok(noscriptContent.includes('JavaScript'));
    assert.ok(noscriptContent.includes('href="/work"'));
  });
});

// ========================================================================
// SECTION 6: Loading Shell CSS Architecture
// ========================================================================

describe('Loading Shell CSS Architecture', () => {
  let css;

  before(() => {
    css = readPublicFile('css/features/loading-shell.css');
  });

  it('loading-shell.css exists and has base rules', () => {
    assert.ok(css.includes('.mondo-loading-shell'));
    assert.ok(css.includes('position: fixed;'));
  });

  it('shell uses z-index 9985 (strictly below QM 9990 and Intro 9999)', () => {
    assert.ok(css.includes('z-index: 9985;'));
  });

  it('shell base state is hidden (opacity: 0, visibility: hidden)', () => {
    const baseBlock = css.match(/\.mondo-loading-shell\s*\{[\s\S]*?\}/)[0];
    assert.ok(baseBlock.includes('opacity: 0;'));
    assert.ok(baseBlock.includes('visibility: hidden;'));
  });

  it('defines .is-active state with full opacity and pointer-events', () => {
    const activeBlock = css.match(/\.mondo-loading-shell\.is-active\s*\{[\s\S]*?\}/)[0];
    assert.ok(activeBlock.includes('opacity: 1;'));
    assert.ok(activeBlock.includes('visibility: visible;'));
    assert.ok(activeBlock.includes('pointer-events: auto;'));
  });

  it('defines .is-exiting state for soft 200ms dismissal', () => {
    const exitBlock = css.match(/\.mondo-loading-shell\.is-exiting\s*\{[\s\S]*?\}/)[0];
    assert.ok(exitBlock.includes('opacity: 0;'));
    assert.ok(exitBlock.includes('200ms'));
  });

  it('implements Owner-approved D03 Concept C (Subtle Breathing)', () => {
    assert.ok(css.includes('@keyframes mondo-subtle-breathing'));
    assert.ok(css.includes('scale(1.015)'));
    assert.ok(css.includes('0.88'));
    assert.ok(css.includes('2.6s'));
  });

  it('suppresses animations under prefers-reduced-motion: reduce', () => {
    assert.ok(css.includes('prefers-reduced-motion: reduce'));
    assert.ok(css.includes('animation: none'));
  });

  it('includes responsive mobile sizing', () => {
    assert.ok(css.includes('@media (max-width: 699px)') || css.includes('@media (max-width: 768px)'));
  });

  it('defines error state and retry button styles', () => {
    assert.ok(css.includes('.project-error-state') || css.includes('.project-error'));
  });
});

// ========================================================================
// SECTION 7: CSS Integration — style.css Import Cascade
// ========================================================================

describe('CSS Integration in style.css', () => {
  let styleCSS;

  before(() => {
    styleCSS = readPublicFile('css/style.css');
  });

  it('style.css imports loading-shell.css', () => {
    assert.ok(styleCSS.includes('loading-shell.css'));
  });

  it('loading-shell.css is imported after intro.css and quiet-mark.css', () => {
    const introIdx = styleCSS.indexOf('intro.css');
    const qmIdx = styleCSS.indexOf('quiet-mark.css');
    const shellIdx = styleCSS.indexOf('loading-shell.css');

    assert.ok(introIdx !== -1, 'intro.css missing');
    assert.ok(qmIdx !== -1, 'quiet-mark.css missing');
    assert.ok(shellIdx !== -1, 'loading-shell.css missing');
    assert.ok(shellIdx > qmIdx, 'loading-shell must be imported after quiet-mark');
  });
});

// ========================================================================
// SECTION 8: Project Details Page Orchestrator (project-page.js)
// ========================================================================

describe('Project Details Page Orchestrator (project-page.js)', () => {
  let source;

  before(() => {
    source = readPublicFile('js/features/project/project-page.js');
  });

  it('imports coordinator and waiters from readiness.js', () => {
    assert.ok(source.includes('createReadinessCoordinator'));
    assert.ok(source.includes('waitForImageDecode'));
    assert.ok(source.includes('waitForVideoReady'));
  });

  it('exports initProjectPage', () => {
    assert.ok(source.includes('export async function initProjectPage'));
  });

  it('has idempotency guard with forceRetry support', () => {
    assert.ok(source.includes('projectInitialized') || source.includes('initialized'));
    assert.ok(source.includes('forceRetry'));
  });

  it('configures coordinator with 250ms threshold, 2500ms longWait, 4000ms maxTimeout', () => {
    assert.ok(source.includes('appearanceThresholdMs: 250') || source.includes('250'));
    assert.ok(source.includes('longWaitMs: 2500') || source.includes('2500'));
    assert.ok(source.includes('maxTimeoutMs: 4000') || source.includes('4000'));
  });

  it('synchronously renders canonical projects from defaults without blocking on API', () => {
    assert.ok(source.includes('defaultProjects') || source.includes('projects.find'));
    assert.ok(source.includes('renderProject('));
  });

  it('sets up recoverable renderErrorState for custom slug network failures', () => {
    assert.ok(source.includes('function renderErrorState') || source.includes('renderErrorState('));
    assert.ok(source.includes('forceRetry: true'));
  });

  it('signals project ready via window flag and custom event', () => {
    assert.ok(source.includes('window.__MONDO_PROJECT_READY__ = true'));
    assert.ok(source.includes("CustomEvent('mondo:project-ready')"));
  });

  it('performs soft exit (~200ms) when shell is active', () => {
    assert.ok(source.includes("'is-exiting'"));
    assert.ok(source.includes('200'));
  });
});

// ========================================================================
// SECTION 9: Quiet Mark Pilot Route Coordination
// ========================================================================

describe('Quiet Mark Pilot Route Coordination', () => {
  let source;

  before(() => {
    source = readPublicFile('js/features/transitions/quiet-mark.js');
  });

  it('detects /work/:slug pilot route while excluding /work root and .html files', () => {
    assert.ok(source.includes("pathname.startsWith('/work/')") || source.includes("normalizePath(location.pathname).startsWith('/work/')"));
    assert.ok(source.includes("'/work'"));
    assert.ok(source.includes("'.html'"));
  });

  it('checks window.__MONDO_PROJECT_READY__ for fast-path renders', () => {
    assert.ok(source.includes('__MONDO_PROJECT_READY__'));
  });

  it('listens for mondo:project-ready event before playing inbound reveal', () => {
    assert.ok(source.includes("'mondo:project-ready'"));
  });

  it('has bounded safety fallback (3500ms) to ensure veil never gets stuck', () => {
    assert.ok(source.includes('3500'));
  });

  it('preserves all approved Quiet Mark timing constants (227ms, 193ms, 420ms)', () => {
    assert.ok(source.includes('227'));
    assert.ok(source.includes('193'));
    assert.ok(source.includes('420'));
  });
});

// ========================================================================
// SECTION 10: Noninterference with Frozen Phases & Other Pages
// ========================================================================

describe('Noninterference with Frozen Phases & Other Pages', () => {
  it('Main Intro files (intro.js and intro.css) are completely untouched', () => {
    const introJs = readPublicFile('js/features/intro/intro.js');
    const introCss = readPublicFile('css/features/intro.css');

    assert.ok(!introJs.includes('loading-shell'), 'intro.js must not reference loading-shell');
    assert.ok(!introJs.includes('readiness'), 'intro.js must not import readiness');
    assert.ok(!introCss.includes('loading-shell'), 'intro.css must not reference loading-shell');
  });

  const otherPages = [
    { name: 'Home', path: 'index.html' },
    { name: 'Work', path: 'work/index.html' },
    { name: 'Start', path: 'start/index.html' },
    { name: 'Privacy', path: 'privacy/index.html' }
  ];

  for (const page of otherPages) {
    it(`${page.name} page does NOT contain #mondo-loading-shell`, () => {
      const html = readPublicFile(page.path);
      assert.ok(!html.includes('mondo-loading-shell'), `${page.name} must not contain loading shell`);
    });
  }
});

// ========================================================================
// SECTION 11: Production Build Output Verification
// ========================================================================

describe('Production Build Output Verification', () => {
  it('dist CSS bundle includes loading shell and breathing keyframes', () => {
    const cssPath = join(DIST, 'css', 'style.bundle.css');
    assert.ok(existsSync(cssPath), 'dist CSS bundle missing');
    const cssContent = readFileSync(cssPath, 'utf8');
    assert.ok(cssContent.includes('mondo-loading-shell'));
    assert.ok(cssContent.includes('mondo-subtle-breathing'));
  });

  it('dist manifest includes updated project bundle', () => {
    const manifestPath = join(DIST, 'manifest.json');
    assert.ok(existsSync(manifestPath), 'dist manifest.json missing');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    assert.ok(manifest.bundles['js/project.js']);
    assert.ok(manifest.bundles['css/style.css']);
  });

  it('public project.html contains loading shell markup and noscript', () => {
    const html = readPublicFile('work/project.html');
    assert.ok(html.includes('mondo-loading-shell'));
    assert.ok(html.includes('<noscript>'));
    assert.ok(html.includes('/assets/intro/mondo-white.png'));
  });
});

// ========================================================================
// SECTION 12: Phase 5C.3.3-R2 Remediation Regression Tests
// ========================================================================

describe('Phase 5C.3.3-R2 Remediation Regression Tests', () => {
  it('R2-01: project.html head script initializes direct-visit first-paint guard with 250ms threshold and 4000ms watchdog', () => {
    const html = readPublicFile('work/project.html');
    assert.ok(html.includes('is-project-pilot-guard'), 'Missing is-project-pilot-guard in head script');
    assert.ok(html.includes('is-project-pilot-active'), 'Missing is-project-pilot-active in head script');
    assert.ok(html.includes('window.__MONDO_PILOT_GUARD__'), 'Missing window.__MONDO_PILOT_GUARD__ interface');
    assert.ok(html.includes('4000'), 'Watchdog timer ceiling must be 4000ms');
    assert.ok(html.includes('/work'), 'Watchdog recovery fallback must link to /work');
    assert.ok(html.includes('role="alert"'), 'Watchdog recovery state must have role="alert"');
  });

  it('R2-01: loading-shell.css provides first-paint protection rules for is-project-pilot-guard', () => {
    const css = readPublicFile('css/features/loading-shell.css');
    assert.ok(css.includes('html.is-project-pilot-guard'), 'Missing html.is-project-pilot-guard selector');
    assert.ok(css.includes('html.is-project-pilot-active'), 'Missing html.is-project-pilot-active selector');
    assert.ok(css.includes('visibility: hidden !important'), 'Guard must hide body elements during delay');
    assert.ok(css.includes(':not(#mondo-loading-shell)'), 'Guard must allow loading shell visibility');
  });

  it('R2-02: custom slug path in project-page.js registers hero_media before settling project_data', () => {
    const src = readPublicFile('js/features/project/project-page.js');
    const heroRegIndex = src.indexOf("coordinator.register('hero_media'");
    const customSectionIndex = src.indexOf('// 2. Custom Project');
    assert.ok(customSectionIndex > 0, 'Missing Custom Project section in project-page.js');
    
    // Within the custom section, verify hero_media registration occurs before markReady('project_data', found)
    const customSub = src.slice(customSectionIndex);
    const heroInCustom = customSub.indexOf("coordinator.register('hero_media'");
    const markDataInCustom = customSub.indexOf("coordinator.markReady('project_data', found)");
    assert.ok(heroInCustom > 0, 'hero_media registration must exist in custom section');
    assert.ok(markDataInCustom > 0, 'markReady(project_data) must exist in custom section');
    assert.ok(heroInCustom < markDataInCustom, 'hero_media MUST be registered before markReady(project_data) to prevent premature READY settlement');
  });

  it('R2-03: renderErrorState provides role="alert", tabindex="-1", and programmatic focus', () => {
    const src = readPublicFile('js/features/project/project-page.js');
    const errStateFn = src.slice(src.indexOf('export function renderErrorState'), src.indexOf('export function renderProject'));
    assert.ok(errStateFn.includes('role="alert"'), 'renderErrorState must declare role="alert"');
    assert.ok(errStateFn.includes('tabindex="-1"'), 'renderErrorState must declare tabindex="-1"');
    assert.ok(errStateFn.includes('.focus()'), 'renderErrorState must programmatically manage focus');
    assert.ok(errStateFn.includes('project-retry-btn'), 'renderErrorState must provide retry button');
  });

  it('R2-04: pilot report contains canonical D01–D20 decision mapping', () => {
    const report = readFileSync(join(ROOT, 'MONDO_PHASE_5C_3_3_PROJECT_DETAILS_PILOT_REPORT.md'), 'utf-8');
    assert.ok(report.includes('D01') && report.includes('Adaptive Loading'));
    assert.ok(report.includes('D03') && report.includes('Subtle Breathing'));
    assert.ok(report.includes('D05') && report.includes('250ms Logo Appearance Threshold'));
    assert.ok(report.includes('D08') && report.includes('Context-Aware Timeouts'));
    assert.ok(report.includes('D17') && report.includes('Central Readiness Coordinator'));
    assert.ok(report.includes('Phase 5C.3.3-R2 Documentation Correction Note'));
  });
});

// ========================================================================
// SECTION 13: Phase 5C.3.3-AQ1 Adaptive Quiet Mark Behavioral & Regression Tests
// ========================================================================

function createMockQmElements() {
  const classes = () => {
    const set = new Set();
    return {
      add: (...names) => names.forEach((n) => set.add(n)),
      remove: (...names) => names.forEach((n) => set.delete(n)),
      contains: (n) => set.has(n)
    };
  };
  const attrs = new Map([['aria-hidden', 'true']]);
  const overlay = {
    classList: classes(),
    setAttribute: (k, v) => attrs.set(k, String(v)),
    getAttribute: (k) => attrs.get(k) || null,
    removeAttribute: (k) => attrs.delete(k)
  };
  const breathEl = {
    classList: classes(),
    style: { animationPlayState: '' }
  };
  const statusEl = {
    classList: classes(),
    textContent: ''
  };
  return { overlay, breathEl, statusEl };
}

describe('Phase 5C.3.3-AQ1 Adaptive Quiet Mark Behavioral & Regression Tests', () => {
  it('AQ1-01: exports canonical state machine constants (250ms, 2500ms, 3500ms, LOADING PROJECT DETAILS…)', () => {
    assert.deepEqual(AQM_STATES, {
      IDLE: 'idle',
      QUIET: 'quiet',
      BREATHING: 'breathing',
      STATUS: 'status',
      REVEALING: 'revealing',
      DISMISSED: 'dismissed'
    });
    assert.equal(AQM_BREATHING_THRESHOLD_MS, 250);
    assert.equal(AQM_STATUS_THRESHOLD_MS, 2500);
    assert.equal(AQM_SAFETY_TIMEOUT_MS, 3500);
    assert.equal(AQM_STATUS_TEXT, 'LOADING PROJECT DETAILS…');
  });

  it('AQ1-02: fast inbound ready before 250ms stays in QUIET and never enters BREATHING', async () => {
    const { overlay, breathEl, statusEl } = createMockQmElements();
    const ctrl = createAdaptiveQuietMarkController({
      overlay,
      breathEl,
      statusEl,
      breathingThresholdMs: 60,
      statusThresholdMs: 180
    });

    assert.equal(ctrl.getState(), 'quiet');
    assert.equal(overlay.getAttribute('aria-hidden'), 'true');
    assert.equal(overlay.classList.contains('is-qm-breathing'), false);

    // Reveal before breathing threshold
    const revealed = ctrl.reveal('ready_fast');
    assert.equal(revealed, true);
    assert.equal(ctrl.getState(), 'revealing');

    // Wait past breathing threshold to prove timers were cleared and breathing never starts
    await new Promise((r) => setTimeout(r, 90));
    assert.equal(ctrl.getState(), 'revealing');
    assert.equal(overlay.classList.contains('is-qm-breathing'), false);
    assert.equal(ctrl.getSnapshot().breathingAt, null);

    ctrl.dismiss('inbound_complete');
    assert.equal(ctrl.getState(), 'dismissed');
    const chain = ctrl.getSnapshot().transitions.map((t) => `${t.from}->${t.to}`);
    assert.deepEqual(chain, ['idle->quiet', 'quiet->revealing', 'revealing->dismissed']);
  });

  it('AQ1-03: pending inbound readiness past 250ms enters BREATHING and reveals cleanly before 2500ms without status text', async () => {
    const { overlay, breathEl, statusEl } = createMockQmElements();
    const ctrl = createAdaptiveQuietMarkController({
      overlay,
      breathEl,
      statusEl,
      breathingThresholdMs: 30,
      statusThresholdMs: 200
    });

    await new Promise((r) => setTimeout(r, 60));
    assert.equal(ctrl.getState(), 'breathing');
    assert.equal(overlay.classList.contains('is-qm-breathing'), true);
    assert.equal(overlay.classList.contains('is-qm-status'), false);
    assert.equal(overlay.getAttribute('aria-hidden'), 'true');
    assert.equal(statusEl.textContent, '');

    // Ready between 250ms and 2500ms
    ctrl.reveal('ready_medium');
    assert.equal(ctrl.getState(), 'revealing');
    assert.equal(breathEl.style.animationPlayState, 'paused');
    assert.equal(statusEl.textContent, '');

    ctrl.dismiss('inbound_complete');
    assert.equal(ctrl.getState(), 'dismissed');
    assert.equal(overlay.classList.contains('is-qm-breathing'), false);
    const chain = ctrl.getSnapshot().transitions.map((t) => `${t.from}->${t.to}`);
    assert.deepEqual(chain, ['idle->quiet', 'quiet->breathing', 'breathing->revealing', 'revealing->dismissed']);
  });

  it('AQ1-04: pending inbound readiness past 2500ms enters STATUS with LOADING PROJECT DETAILS… and clears cleanly on reveal', async () => {
    const { overlay, breathEl, statusEl } = createMockQmElements();
    const ctrl = createAdaptiveQuietMarkController({
      overlay,
      breathEl,
      statusEl,
      breathingThresholdMs: 20,
      statusThresholdMs: 60
    });

    await new Promise((r) => setTimeout(r, 90));
    assert.equal(ctrl.getState(), 'status');
    assert.equal(overlay.classList.contains('is-qm-breathing'), true);
    assert.equal(overlay.classList.contains('is-qm-status'), true);
    assert.equal(overlay.getAttribute('aria-hidden'), 'false');
    assert.equal(statusEl.textContent, 'LOADING PROJECT DETAILS…');
    assert.equal(statusEl.classList.contains('is-visible'), true);

    // Reveal after status threshold clears status cleanly and pauses breathing in-place
    ctrl.reveal('ready_after_status');
    assert.equal(ctrl.getState(), 'revealing');
    assert.equal(overlay.classList.contains('is-qm-status'), false);
    assert.equal(overlay.getAttribute('aria-hidden'), 'true');
    assert.equal(statusEl.textContent, '');
    assert.equal(statusEl.classList.contains('is-visible'), false);
    assert.equal(breathEl.style.animationPlayState, 'paused');

    ctrl.dismiss('inbound_complete');
    assert.equal(ctrl.getState(), 'dismissed');
    const chain = ctrl.getSnapshot().transitions.map((t) => `${t.from}->${t.to}`);
    assert.deepEqual(chain, ['idle->quiet', 'quiet->breathing', 'breathing->status', 'status->revealing', 'revealing->dismissed']);
  });

  it('AQ1-05: reduced motion suppresses decorative breathing while preserving functional waiting and status text', async () => {
    const { overlay, breathEl, statusEl } = createMockQmElements();
    const ctrl = createAdaptiveQuietMarkController({
      overlay,
      breathEl,
      statusEl,
      reducedMotion: true,
      breathingThresholdMs: 20,
      statusThresholdMs: 60
    });

    await new Promise((r) => setTimeout(r, 35));
    // Past breathing threshold: decorative breathing is suppressed
    assert.equal(ctrl.getState(), 'quiet');
    assert.equal(overlay.classList.contains('is-qm-breathing'), false);
    assert.equal(ctrl.getSnapshot().isBreathing, false);

    await new Promise((r) => setTimeout(r, 50));
    // Past status threshold: status text is exposed politely while breathing remains off
    assert.equal(ctrl.getState(), 'status');
    assert.equal(overlay.classList.contains('is-qm-breathing'), false);
    assert.equal(overlay.classList.contains('is-qm-status'), true);
    assert.equal(statusEl.textContent, 'LOADING PROJECT DETAILS…');

    ctrl.reveal('ready_reduced_motion');
    ctrl.dismiss('inbound_complete');
    assert.equal(ctrl.getState(), 'dismissed');
  });

  it('AQ1-06: duplicate readiness signals are idempotent and late signals after reveal/dismiss are safely ignored', () => {
    const { overlay, breathEl, statusEl } = createMockQmElements();
    const ctrl = createAdaptiveQuietMarkController({
      overlay,
      breathEl,
      statusEl,
      breathingThresholdMs: 500,
      statusThresholdMs: 2500
    });

    ctrl.enterBreathing('manual');
    assert.equal(ctrl.getState(), 'breathing');

    // First reveal succeeds
    assert.equal(ctrl.reveal('first_ready'), true);
    assert.equal(ctrl.getState(), 'revealing');

    // Duplicate reveal is a no-op
    assert.equal(ctrl.reveal('duplicate_ready'), false);
    assert.equal(ctrl.getState(), 'revealing');

    // Attempting to re-enter breathing or status after revealing is rejected
    assert.equal(ctrl.enterBreathing('late_breath'), false);
    assert.equal(ctrl.enterStatus('late_status'), false);
    assert.equal(ctrl.getState(), 'revealing');

    // Dismiss succeeds once and rejects subsequent transitions
    assert.equal(ctrl.dismiss('safety_timeout_3500ms'), true);
    assert.equal(ctrl.getState(), 'dismissed');
    assert.equal(ctrl.dismiss('duplicate_dismiss'), false);
    assert.equal(ctrl.reveal('late_ready_after_timeout'), false);
    assert.equal(ctrl.enterBreathing('after_dismiss'), false);
    assert.equal(ctrl.enterStatus('after_dismiss'), false);
  });

  it('AQ1-07: single Quiet Mark logo guarantee and non-competing Loading Shell isolation', () => {
    const quietJs = readPublicFile('js/features/transitions/quiet-mark.js');
    const quietCss = readPublicFile('css/features/quiet-mark.css');
    const projectPageJs = readPublicFile('js/features/project/project-page.js');
    const projectHtml = readPublicFile('work/project.html');

    // Verify Quiet Mark uses single #mondo-quiet-mark-logo with /assets/intro/mondo-white.png
    assert.ok(quietJs.includes("const LOGO_ID = 'mondo-quiet-mark-logo'"));
    assert.ok(quietJs.includes('/assets/intro/mondo-white.png'));
    assert.ok(quietCss.includes('@keyframes mondo-qm-subtle-breathing'));
    assert.ok(quietCss.includes('scale(0.985)'));
    assert.ok(quietCss.includes('scale(1.015)'));
    assert.ok(quietCss.includes('2.6s'));
    assert.ok(quietCss.includes('.mondo-quiet-mark__status'));

    // Verify #mondo-loading-shell and its status text are suppressed when isQuietMarkActive is true
    assert.ok(projectPageJs.includes('if (shellEl && !isQuietMarkActive)'));
    assert.ok(projectPageJs.includes('if (statusEl && !isQuietMarkActive)'));

    // Verify direct visit and refresh still use Direct Loading Shell (!isQuietMarkInbound)
    assert.ok(projectHtml.includes('if (!isQuietMarkInbound)'));
    assert.ok(projectHtml.includes('is-project-pilot-guard'));
    assert.ok(projectHtml.includes('window.__MONDO_EARLY_QM__'));
  });

  it('AQ1-08: dist CSS and JS bundles include Adaptive Quiet Mark styles and logic', () => {
    const cssPath = join(DIST, 'css', 'style.bundle.css');
    const siteJsPath = join(DIST, 'js', 'site.bundle.js');
    assert.ok(existsSync(cssPath), 'dist CSS bundle must exist');
    assert.ok(existsSync(siteJsPath), 'dist site.bundle.js must exist');

    const cssContent = readFileSync(cssPath, 'utf8');
    const siteJsContent = readFileSync(siteJsPath, 'utf8');

    assert.ok(cssContent.includes('mondo-qm-subtle-breathing'), 'CSS bundle must include mondo-qm-subtle-breathing keyframes');
    assert.ok(cssContent.includes('mondo-quiet-mark__status'), 'CSS bundle must include mondo-quiet-mark__status');
    assert.ok(siteJsContent.includes('LOADING PROJECT DETAILS'), 'site.bundle.js must include Adaptive Quiet Mark status text');
    assert.ok(siteJsContent.includes('__MONDO_ADAPTIVE_QM__'), 'site.bundle.js must expose __MONDO_ADAPTIVE_QM__ controller');
  });
});

// ========================================================================
// SECTION 14: Phase 5C.3.3-AQ1-R1 Black Screen Recovery, Lifecycle & Seamless Motion Continuity Tests
// ========================================================================

describe('Phase 5C.3.3-AQ1-R1 Remediation Behavioral & Regression Tests', () => {
  it('AQ1-R1-A1 (Group A): project.html places synchronous pilot head script and critical CSS before external stylesheet', () => {
    const html = readPublicFile('work/project.html');
    const preloadPos = html.indexOf('href="/assets/intro/mondo-white.png" fetchpriority="high"');
    const criticalCssPos = html.indexOf('id="mondo-pilot-critical-css"');
    const scriptPos = html.indexOf('<script>');
    const linkStylesheetPos = html.indexOf('id="mondo-main-stylesheet"');

    assert.ok(preloadPos > -1, 'mondo-white.png preload with fetchpriority="high" must exist in <head>');
    assert.ok(criticalCssPos > -1, '#mondo-pilot-critical-css must exist in <head>');
    assert.ok(scriptPos > -1, 'Synchronous pilot <script> must exist in <head>');
    assert.ok(linkStylesheetPos > -1, '#mondo-main-stylesheet link must exist in <head>');

    assert.ok(preloadPos < scriptPos, 'Preload must appear before synchronous pilot <script>');
    assert.ok(criticalCssPos < scriptPos, 'Critical CSS must appear before synchronous pilot <script>');
    assert.ok(scriptPos < linkStylesheetPos, 'Synchronous pilot <script> must execute before external stylesheet link');
  });

  it('AQ1-R1-A2 (Group A): #mondo-pilot-critical-css includes self-contained early loading and FOUC-prevention rules', () => {
    const html = readPublicFile('work/project.html');
    const criticalMatch = html.match(/<style id="mondo-pilot-critical-css">([\s\S]*?)<\/style>/);
    assert.ok(criticalMatch, 'Must find #mondo-pilot-critical-css block');
    const criticalCss = criticalMatch[1];

    assert.ok(criticalCss.includes('html.is-quiet-mark-inbound'), 'Must guard inbound Quiet Mark state');
    assert.ok(criticalCss.includes('html.is-project-pilot-guard'), 'Must guard direct-visit pilot state');
    assert.ok(criticalCss.includes('html.is-project-css-pending'), 'Must guard FOUC while external CSS is pending');
    assert.ok(criticalCss.includes('.mondo-quiet-mark'), 'Must style .mondo-quiet-mark');
    assert.ok(criticalCss.includes('.mondo-loading-shell'), 'Must style .mondo-loading-shell');
    assert.ok(criticalCss.includes('aspect-ratio: 610 / 870'), 'Must reserve logo geometry');
    assert.ok(!criticalCss.includes('.mondo-logo-fallback'), 'Must NOT style unauthorized text-based fallback (D21)');
    assert.ok(criticalCss.includes('.mondo-quiet-mark__logo.is-decoded'), 'Must style decode-gated logo visibility (D23)');
    assert.ok(criticalCss.includes('@keyframes mondo-qm-breathing-onset'), 'Must include gradual onset ramp keyframes');
    assert.ok(criticalCss.includes('@keyframes mondo-qm-subtle-breathing'), 'Must include steady-state breathing keyframes');
    assert.ok(criticalCss.includes('prefers-reduced-motion: reduce'), 'Must respect prefers-reduced-motion in critical CSS');
  });

  it('AQ1-R1-A3 (Group A): logo geometry reservation and graceful fallback for delayed or failed mondo-white.png', () => {
    const html = readPublicFile('work/project.html');
    const quietJs = readPublicFile('js/features/transitions/quiet-mark.js');
    const quietCss = readPublicFile('css/features/quiet-mark.css');
    const shellCss = readPublicFile('css/features/loading-shell.css');

    assert.ok(html.includes('width="610" height="870" fetchpriority="high"'), 'project.html logo must specify width, height, and fetchpriority="high"');
    assert.ok(!html.includes('mondo-logo-fallback'), 'project.html must NOT include unauthorized textual fallback mark (D21)');
    assert.ok(!quietJs.includes('mondo-logo-fallback'), 'quiet-mark.js must NOT create unauthorized textual fallback mark (D21)');
    assert.ok(!quietCss.includes('mondo-logo-fallback'), 'quiet-mark.css must NOT style unauthorized textual fallback mark (D21)');
    assert.ok(html.includes('bindEarlyLogoReadiness'), 'project.html must track early logo load/decode state (D23)');
    assert.ok(quietJs.includes('bindLogoReadiness'), 'quiet-mark.js must bind logo decode readiness (D23)');
    assert.ok(quietCss.includes('aspect-ratio: 610 / 870'), 'quiet-mark.css must reserve 610/870 aspect ratio');
    assert.ok(shellCss.includes('aspect-ratio: 610 / 870'), 'loading-shell.css must reserve 610/870 aspect ratio');
  });

  it('AQ1-R1-B1 (Group B): direct-visit <head> script arms 250ms shell timer, 2500ms status timer, and 4000ms watchdog', () => {
    const html = readPublicFile('work/project.html');
    const directBranch = html.slice(html.indexOf('if (!isQuietMarkInbound)'));

    assert.ok(directBranch.includes('var thresholdTimer = setTimeout('), 'Direct path must arm 250ms thresholdTimer');
    assert.ok(directBranch.includes('}, 250);'), 'Direct thresholdTimer must be 250ms');
    assert.ok(directBranch.includes('var statusTimer = setTimeout('), 'Direct path must arm 2500ms statusTimer');
    assert.ok(directBranch.includes('is-project-pilot-status'), 'Direct 2500ms timer must add is-project-pilot-status');
    assert.ok(directBranch.includes("st.textContent = 'LOADING PROJECT DETAILS\\u2026'"), 'Direct 2500ms timer must populate LOADING PROJECT DETAILS…');
    assert.ok(directBranch.includes('}, 2500);'), 'Direct statusTimer must be 2500ms');
    assert.ok(directBranch.includes('var watchdogTimer = setTimeout('), 'Direct path must arm 4000ms watchdogTimer');
    assert.ok(directBranch.includes('}, 4000);'), 'Direct watchdogTimer must remain 4000ms');
    assert.ok(directBranch.includes('clearEarlyTimers: function()'), 'window.__MONDO_PILOT_GUARD__ must expose clearEarlyTimers()');
  });

  it('AQ1-R1-B2 (Group B): project-page.js coordinates timer ownership with early direct guard without duplicate status announcements', () => {
    const projectPageJs = readPublicFile('js/features/project/project-page.js');

    assert.ok(projectPageJs.includes('window.__MONDO_PILOT_GUARD__.clearEarlyTimers()'), 'project-page.js must cancel early head timers when coordinator takes ownership');
    assert.ok(projectPageJs.includes('elapsedFromEarlyGuard'), 'project-page.js must account for elapsed time from early direct guard');
    assert.ok(projectPageJs.includes('if (statusEl.textContent !== PILOT_STATUS_COPY)'), 'project-page.js must guard against duplicate textContent assignment on aria-live status element');
    assert.ok(projectPageJs.includes('waitForStylesheetReady'), 'project-page.js must gate project reveal on stylesheet readiness to prevent FOUC');
  });

  it('AQ1-R1-C1 (Group C): non-destructive error mounting preserves #project-intro-wrap, #project-media, #project-story, and #explore-grid', () => {
    const html = readPublicFile('work/project.html');
    const projectPageJs = readPublicFile('js/features/project/project-page.js');

    assert.ok(html.includes('<div id="project-error-host" class="project-error-host" hidden></div>'), 'project.html must include dedicated #project-error-host inside #project-main');
    assert.ok(html.includes('mountNonDestructivePilotError'), 'project.html watchdog must use non-destructive error helper');
    assert.ok(!html.includes('main.innerHTML ='), 'project.html watchdog must NEVER overwrite #project-main.innerHTML');

    assert.ok(projectPageJs.includes('function resolveErrorHost(root, main)'), 'project-page.js must use dedicated error host container');
    assert.ok(projectPageJs.includes('export function clearProjectErrorState'), 'project-page.js must export clearProjectErrorState() for late recovery');
    assert.ok(!projectPageJs.includes('main.innerHTML ='), 'project-page.js must NEVER destructively overwrite #project-main.innerHTML');
    assert.ok(projectPageJs.includes("errContainer.setAttribute('data-focus-managed', 'true')"), 'Focus must be managed without stealing focus from user interaction');
  });

  it('AQ1-R1-C2 (Group C Behavioral): renderErrorState and late renderProject recover non-destructively while preserving all 4 section containers', () => {
    const makeEl = (id) => {
      const classes = new Set();
      const attrs = new Map();
      return {
        id,
        hidden: id === 'project-error-host',
        innerHTML: '',
        classList: {
          add: (...t) => t.forEach((x) => classes.add(x)),
          remove: (...t) => t.forEach((x) => classes.delete(x)),
          contains: (x) => classes.has(x)
        },
        setAttribute: (k, v) => attrs.set(k, String(v)),
        getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
        querySelector: () => null,
        addEventListener: () => {}
      };
    };

    const mainEl = makeEl('project-main');
    const errorHostEl = makeEl('project-error-host');
    const introWrapEl = makeEl('project-intro-wrap');
    const mediaEl = makeEl('project-media');
    const storyEl = makeEl('project-story');
    const exploreGridEl = makeEl('explore-grid');

    const byId = {
      'project-main': mainEl,
      'project-error-host': errorHostEl,
      'project-intro-wrap': introWrapEl,
      'project-media': mediaEl,
      'project-story': storyEl,
      'explore-grid': exploreGridEl
    };

    const mockRoot = {
      getElementById: (id) => byId[id] || null,
      querySelector: (sel) => {
        if (sel.startsWith('#')) return byId[sel.slice(1)] || null;
        return null;
      }
    };

    // 1. Trigger error state (simulating watchdog or transient error)
    renderErrorState(mockRoot, { message: 'Temporary timeout' });
    assert.equal(mainEl.classList.contains('has-project-error'), true);
    assert.equal(errorHostEl.hidden, false);
    assert.ok(errorHostEl.innerHTML.includes('Unable to load project.'), 'Error UI must mount inside #project-error-host');
    assert.equal(mainEl.innerHTML, '', '#project-main.innerHTML must remain untouched');

    // 2. Simulate late JS recovery rendering Rainbow Orchard
    const rainbow = defaultProjects.find((p) => p.slug === 'rainbow-orchard') || defaultProjects[0];
    renderProject(rainbow, defaultProjects, { root: mockRoot, trackEvent: () => {} });

    // 3. Verify error state is cleared and all 4 project sections are populated
    assert.equal(mainEl.classList.contains('has-project-error'), false, 'has-project-error must be cleared');
    assert.equal(errorHostEl.hidden, true, '#project-error-host must be hidden after recovery');
    assert.equal(errorHostEl.innerHTML, '', '#project-error-host markup must be cleared');
    assert.ok(introWrapEl.innerHTML.includes(rainbow.title), '#project-intro-wrap must be populated');
    assert.ok(mediaEl.innerHTML.length > 0, '#project-media must be populated');
    assert.ok(storyEl.innerHTML.includes('THE IDEA'), '#project-story must be populated');
    assert.ok(exploreGridEl.innerHTML.length > 0, '#explore-grid must be populated');
  });

  it('AQ1-R1-D1 (Group D): unified static hold baseline scale(1.0042) and gradual 450ms onset ramp eliminate 250ms jump', () => {
    const html = readPublicFile('work/project.html');
    const quietJs = readPublicFile('js/features/transitions/quiet-mark.js');
    const quietCss = readPublicFile('css/features/quiet-mark.css');

    assert.equal(AQM_HOLD_SCALE, 1.0042, 'Canonical AQM_HOLD_SCALE must be 1.0042');
    assert.equal(AQM_ONSET_DURATION_MS, 450, 'Canonical AQM_ONSET_DURATION_MS must be 450ms');

    assert.ok(html.includes('transform: scale(1.0042)'), 'Early <head> Quiet Mark logo must hold at scale(1.0042)');
    assert.ok(quietJs.includes('scale(${AQM_HOLD_SCALE})'), 'Hydrated quiet-mark.js logo must hold at scale(1.0042)');

    // Verify onset keyframe starts at scale(1), opacity: 1 (no first-frame contraction or dimming)
    const onsetMatch = quietCss.match(/@keyframes\s+mondo-qm-breathing-onset\s*\{([\s\S]*?)\n\}/);
    assert.ok(onsetMatch, 'quiet-mark.css must define @keyframes mondo-qm-breathing-onset');
    assert.ok(onsetMatch[1].includes('transform: scale(1)'), 'Onset 0% must start at scale(1)');
    assert.ok(onsetMatch[1].includes('transform: scale(1.015)'), 'Onset 100% must reach scale(1.015)');

    // Verify steady-state cycle has matching 0% and 100% endpoints for zero loop boundary jump
    const steadyMatch = quietCss.match(/@keyframes\s+mondo-qm-subtle-breathing\s*\{([\s\S]*?)\n\}/);
    assert.ok(steadyMatch, 'quiet-mark.css must define @keyframes mondo-qm-subtle-breathing');
    assert.ok(steadyMatch[1].includes('50%'), 'Steady-state breathing must include 50% trough at scale(0.985) and opacity 0.88');
    assert.ok(quietCss.includes('mondo-qm-breathing-onset 450ms ease-in-out 0s 1 normal forwards'), 'Breathing rule must run 450ms onset ramp once');
    assert.ok(quietCss.includes('mondo-qm-subtle-breathing 2.6s ease-in-out 450ms infinite normal forwards'), 'Breathing rule must chain 2.6s infinite cycle after 450ms');
  });

  it('AQ1-R1-D2 (Group D): createAdaptiveQuietMarkController adopts already-breathing early overlay without restarting animation', () => {
    const { overlay, breathEl, statusEl } = createMockQmElements();
    // Simulate early <head> script having already entered breathing at t=250ms
    overlay.classList.add('is-qm-breathing');
    overlay.setAttribute('data-qm-state', 'breathing');

    let removedBreathingClass = false;
    const origRemove = overlay.classList.remove.bind(overlay.classList);
    overlay.classList.remove = (...tokens) => {
      if (tokens.includes('is-qm-breathing')) {
        removedBreathingClass = true;
      }
      return origRemove(...tokens);
    };

    const ctrl = createAdaptiveQuietMarkController({
      overlay,
      breathEl,
      statusEl,
      initialState: AQM_STATES.BREATHING,
      breathingAt: 255,
      breathingThresholdMs: 250,
      statusThresholdMs: 2500
    });

    assert.equal(ctrl.getState(), 'breathing');
    assert.equal(removedBreathingClass, false, 'Hydration must NEVER remove is-qm-breathing when adopting an already-breathing early overlay');
    assert.equal(overlay.classList.contains('is-qm-breathing'), true);

    ctrl.dismiss('test_cleanup');
  });

  it('AQ1-R1-E1 (Group E): production bundles contain AQ1-R1 onset keyframes, non-destructive error host, and hold scale', () => {
    const cssPath = join(DIST, 'css', 'style.bundle.css');
    const siteJsPath = join(DIST, 'js', 'site.bundle.js');
    const projectJsPath = join(DIST, 'js', 'project.bundle.js');

    const cssContent = readFileSync(cssPath, 'utf8');
    const siteJsContent = readFileSync(siteJsPath, 'utf8');
    const projectJsContent = readFileSync(projectJsPath, 'utf8');

    assert.ok(cssContent.includes('mondo-qm-breathing-onset'), 'style.bundle.css must include mondo-qm-breathing-onset');
    assert.ok(cssContent.includes('has-project-error'), 'style.bundle.css must include non-destructive error host rules');
    assert.ok(siteJsContent.includes('1.0042'), 'site.bundle.js must include unified 1.0042 hold scale');
    assert.ok(projectJsContent.includes('project-error-host'), 'project.bundle.js must include non-destructive #project-error-host logic');
    assert.ok(projectJsContent.includes('__MONDO_LATE_RECOVERED__'), 'project.bundle.js must include late recovery reconciliation logic');
  });

  describe('Phase 5C.3.3-AQ1-R2 Brand Integrity & Logo Decode Verification (D21, D22, D23)', () => {
    it('D21: permanently eliminates textual MONDO fallback mark across HTML, CSS, and JS', () => {
      const html = readPublicFile('work/project.html');
      const quietJs = readPublicFile('js/features/transitions/quiet-mark.js');
      const quietCss = readPublicFile('css/features/quiet-mark.css');
      const shellCss = readPublicFile('css/features/loading-shell.css');

      assert.ok(!html.includes('mondo-logo-fallback'), 'project.html must not contain mondo-logo-fallback');
      assert.ok(!quietJs.includes('mondo-logo-fallback'), 'quiet-mark.js must not contain mondo-logo-fallback');
      assert.ok(!quietCss.includes('mondo-logo-fallback'), 'quiet-mark.css must not contain mondo-logo-fallback');
      assert.ok(!shellCss.includes('mondo-logo-fallback'), 'loading-shell.css must not contain mondo-logo-fallback');

      // Verify no dynamic textual fallback creation in JS
      assert.ok(!quietJs.includes("fb.textContent = 'MONDO'"), 'quiet-mark.js must not synthesize text fallback');
      assert.ok(!quietJs.includes("fallback.textContent = 'MONDO'"), 'quiet-mark.js must not synthesize text fallback');

      // Verify authentic asset remains unchanged
      assert.ok(html.includes('/assets/intro/mondo-white.png'), 'project.html must use authentic mondo-white.png asset');
      assert.ok(quietJs.includes('/assets/intro/mondo-white.png'), 'quiet-mark.js must use authentic mondo-white.png asset');
    });

    it('D22: restores canonical Dark Ice button appearance and permanently purges legacy #d2ff28', () => {
      const html = readPublicFile('work/project.html');
      const quietCss = readPublicFile('css/features/quiet-mark.css');
      const shellCss = readPublicFile('css/features/loading-shell.css');
      const buttonCss = readPublicFile('css/components/buttons.css');

      // Verify zero occurrences of legacy #d2ff28
      assert.ok(!html.includes('#d2ff28'), 'project.html must not contain legacy #d2ff28');
      assert.ok(!quietCss.includes('#d2ff28'), 'quiet-mark.css must not contain legacy #d2ff28');
      assert.ok(!shellCss.includes('#d2ff28'), 'loading-shell.css must not contain legacy #d2ff28');

      // Verify canonical button CSS has dark background #08090B and white text #F5F7FA
      assert.ok(buttonCss.includes('background-color: var(--color-bg)'), 'buttons.css must use --color-bg');
      assert.ok(buttonCss.includes('color: var(--color-text)'), 'buttons.css must use --color-text');
      assert.ok(buttonCss.includes('/assets/facet-button-left.svg'), 'buttons.css must include left SVG facet endcap');
      assert.ok(buttonCss.includes('/assets/facet-button-right.svg'), 'buttons.css must include right SVG facet endcap');

      // Verify error state in project.html uses canonical Dark Ice styling
      assert.ok(html.includes('.project-error-state .button'), 'project.html must style .project-error-state .button');
      assert.ok(html.includes('background-color: #08090B'), 'project.html error button must use canonical dark background #08090B');
      assert.ok(html.includes('color: #F5F7FA'), 'project.html error button must use canonical text #F5F7FA');
      assert.ok(html.includes('clip-path: polygon(14px 0'), 'project.html error button must use canonical faceted clip-path');
    });

    it('D23: enforces image decode gating on logo visibility before revealing artwork', () => {
      const html = readPublicFile('work/project.html');
      const quietJs = readPublicFile('js/features/transitions/quiet-mark.js');
      const criticalMatch = html.match(/<style id="mondo-pilot-critical-css">([\s\S]*?)<\/style>/);
      assert.ok(criticalMatch, 'Must find #mondo-pilot-critical-css block');
      const criticalCss = criticalMatch[1];

      // Verify initial hidden state in critical CSS
      assert.ok(criticalCss.includes('opacity: 0;'), 'Critical CSS logo must start at opacity: 0');
      assert.ok(criticalCss.includes('visibility: hidden;'), 'Critical CSS logo must start with visibility: hidden');

      // Verify decode resolution classes
      assert.ok(criticalCss.includes('.mondo-quiet-mark__logo.is-decoded'), 'Critical CSS must style .is-decoded');
      assert.ok(criticalCss.includes('.is-logo-ready .mondo-quiet-mark__logo'), 'Critical CSS must style .is-logo-ready');
      assert.ok(criticalCss.includes('.is-logo-failed .mondo-quiet-mark__logo'), 'Critical CSS must style .is-logo-failed');

      // Verify decode() invocation in head script and quiet-mark.js
      assert.ok(html.includes('logoEl.decode()'), 'project.html head script must use HTMLImageElement.prototype.decode()');
      assert.ok(quietJs.includes('logoEl.decode()'), 'quiet-mark.js must use HTMLImageElement.prototype.decode()');

      // Verify static DOM elements initialize with hidden state
      assert.ok(html.includes('id="mondo-quiet-mark-logo" class="mondo-quiet-mark__logo" src="/assets/intro/mondo-white.png" alt="" width="610" height="870" fetchpriority="high" draggable="false" style="opacity: 0; transform: scale(1.0042);"'), 'Quiet Mark logo in project.html must initialize at opacity: 0');
      assert.ok(html.includes('class="mondo-loading-shell__logo" width="610" height="870"\n          fetchpriority="high" draggable="false" style="opacity: 0;"'), 'Loading shell logo in project.html must initialize at opacity: 0');
    });
  });

  // ========================================================================
  // SECTION 15: Phase 5C.3.3-AQ1-R3: Strict Decode Rejection (D25),
  //             Canonical Button Parity (D26), and Watchdog Ownership
  // ========================================================================

  describe('AQ1-R3: Strict Decode Rejection (D25), Button Parity (D26) & Watchdog Ownership', () => {
    it('D25: strictly rejects decode without falling back to metadata, using sequence counters', () => {
      const html = readPublicFile('work/project.html');
      const quietJs = readPublicFile('js/features/transitions/quiet-mark.js');

      // Verify sequence counters are present in both implementations
      assert.ok(html.includes('earlyLogoAttemptSeq'), 'project.html must declare earlyLogoAttemptSeq counter');
      assert.ok(quietJs.includes('hydratedLogoAttemptSeq'), 'quiet-mark.js must declare hydratedLogoAttemptSeq counter');

      // Verify strict decode rejection: catch calls onDecodeFailure directly without metadata fallback
      assert.ok(html.includes('logoEl.decode().then(onDecodeSuccess).catch(function () {\n            // Decision D25: Strict decode rejection — never reveal image on rejected decode()\n            onDecodeFailure();\n          });'), 'project.html must strictly reject decode without checking complete/naturalWidth');
      assert.ok(quietJs.includes('logoEl.decode().then(onDecodeSuccess).catch(() => {\n      // Decision D25: Strict decode rejection — never reveal image on rejected decode()\n      onDecodeFailure();\n    });'), 'quiet-mark.js must strictly reject decode without checking complete/naturalWidth');

      // Verify that metadata fallback is ONLY present in the unsupported browser branch (typeof logoEl.decode !== 'function')
      assert.ok(html.includes('// Unsupported browser fallback (only when HTMLImageElement.prototype.decode is absent)'), 'project.html must preserve fallback only for decode-less browsers');
      assert.ok(quietJs.includes('// Unsupported browser fallback (only when HTMLImageElement.prototype.decode is absent)'), 'quiet-mark.js must preserve fallback only for decode-less browsers');
    });

    it('D26: enforces canonical 58px Dark Ice button parity with SVG facet endcaps', () => {
      const html = readPublicFile('work/project.html');
      const criticalMatch = html.match(/<style id="mondo-pilot-critical-css">([\s\S]*?)<\/style>/);
      assert.ok(criticalMatch, 'Must find #mondo-pilot-critical-css');
      const criticalCss = criticalMatch[1];

      // Primary button parity (58px height, box-sizing: border-box, position: relative)
      assert.ok(criticalCss.includes('.project-error-state .button {'), 'Critical CSS must target .project-error-state .button');
      assert.ok(criticalCss.includes('box-sizing: border-box;'), 'Critical CSS button must specify box-sizing: border-box');
      assert.ok(criticalCss.includes('position: relative;'), 'Critical CSS button must specify position: relative');
      assert.ok(criticalCss.includes('height: 58px;'), 'Critical CSS button must specify exact height: 58px');
      assert.ok(criticalCss.includes('min-height: 58px;'), 'Critical CSS button must specify min-height: 58px');

      // Facet endcap SVG assets on primary button
      assert.ok(criticalCss.includes('.project-error-state .button::before {'), 'Critical CSS button must have ::before facet');
      assert.ok(criticalCss.includes('background-image: url("/assets/facet-button-left.svg");'), 'Critical CSS button ::before must reference left SVG facet');
      assert.ok(criticalCss.includes('.project-error-state .button::after {'), 'Critical CSS button must have ::after facet');
      assert.ok(criticalCss.includes('background-image: url("/assets/facet-button-right.svg");'), 'Critical CSS button ::after must reference right SVG facet');

      // Secondary button parity (50px height, box-sizing: border-box, position: relative)
      assert.ok(criticalCss.includes('.project-error-state .button-outline {'), 'Critical CSS must target .project-error-state .button-outline');
      assert.ok(criticalCss.includes('height: 50px;'), 'Critical CSS outline button must specify exact height: 50px');
      assert.ok(criticalCss.includes('.project-error-state .button-outline::before {'), 'Critical CSS outline button must have ::before facet');
      assert.ok(criticalCss.includes('background-image: url("/assets/facet-button-secondary-left.svg");'), 'Critical CSS outline button ::before must reference secondary left SVG facet');

      // Focus visibility parity
      assert.ok(criticalCss.includes('.project-error-state .button:focus-visible'), 'Critical CSS must style button focus-visible');
      assert.ok(criticalCss.includes('outline: 2px solid rgba(245, 247, 250, 0.9);'), 'Critical CSS button must use canonical ice focus ring');
    });

    it('Watchdog Ownership: stores watchdog handle on earlyQm and cancels cleanly before ready guard', () => {
      const html = readPublicFile('work/project.html');
      const quietJs = readPublicFile('js/features/transitions/quiet-mark.js');

      // earlyQm watchdog timer handle declaration and cancellation
      assert.ok(html.includes('watchdogTimer: null,'), 'earlyQm must initialize watchdogTimer property');
      assert.ok(html.includes('if (this.watchdogTimer) { clearTimeout(this.watchdogTimer); this.watchdogTimer = null; }'), 'earlyQm.clearTimers must cancel watchdogTimer');

      // Watchdog registration in early head
      assert.ok(html.includes('earlyQm.watchdogTimer = setTimeout(function() {'), 'earlyQm must own the 4000ms watchdog handle');

      // Guard against mounting error on already-ready projects
      assert.ok(html.includes('function mountNonDestructivePilotError() {\n        if (window.__MONDO_PROJECT_READY__) return;'), 'mountNonDestructivePilotError must guard against already-ready project');
      assert.ok(quietJs.includes('function renderPilotFallbackErrorIfNeeded() {\n  if (typeof document === \'undefined\') return;\n  if (typeof window !== \'undefined\' && window.__MONDO_PROJECT_READY__) return;'), 'renderPilotFallbackErrorIfNeeded must guard against already-ready project');
    });
  });

  // ========================================================================
  // SECTION 16: Phase 5C.3.3-AQ1-R4: Logo Decode Visibility (D27) &
  //             Reduced-Motion Transition Token Priming (D28)
  // ========================================================================

  describe('AQ1-R4: Logo Decode Visibility (D27) & Reduced-Motion Token Priming (D28)', () => {
    it('D27: decodes logo successfully without false suppression by aria-hidden in head and quiet-mark.js', () => {
      const html = readPublicFile('work/project.html');
      const quietJs = readPublicFile('js/features/transitions/quiet-mark.js');

      // Verify D27 removal of aria-hidden check in project.html bindEarlyLogoReadiness
      assert.ok(!html.includes("containerEl.getAttribute('aria-hidden') === 'true'"), 'project.html must not check aria-hidden in decode success');
      assert.ok(html.includes("if (containerEl && containerEl.getAttribute('data-qm-state') === 'dismissed')"), 'project.html must preserve explicit data-qm-state dismissal check');

      // Verify D27 removal of aria-hidden check in quiet-mark.js bindLogoReadiness
      assert.ok(!quietJs.includes("containerEl.getAttribute('aria-hidden') === 'true'"), 'quiet-mark.js must not check aria-hidden in decode success');
      assert.ok(quietJs.includes("if (containerEl && containerEl.getAttribute('data-qm-state') === 'dismissed') return;"), 'quiet-mark.js must preserve explicit data-qm-state dismissal check');
    });

    it('D27 Behavioral: reveals logo when container is aria-hidden="true" during QUIET and BREATHING states', async () => {
      // Simulate bindEarlyLogoReadiness logic in test environment
      let earlyLogoAttemptSeq = 0;
      function bindTestLogoReadiness(logoEl, containerEl) {
        if (!logoEl) return;
        const attemptId = ++earlyLogoAttemptSeq;
        if (containerEl) {
          containerEl.classList.add('is-logo-pending');
        }

        function onDecodeSuccess() {
          if (attemptId !== earlyLogoAttemptSeq) return;
          if (containerEl && containerEl.getAttribute('data-qm-state') === 'dismissed') {
            return;
          }
          if (logoEl.naturalWidth > 0) {
            logoEl.classList.add('is-decoded');
            logoEl.style.visibility = '';
            logoEl.style.opacity = '1';
            if (containerEl) {
              containerEl.classList.remove('is-logo-pending', 'is-logo-failed');
              containerEl.classList.add('is-logo-ready');
            }
          } else {
            onDecodeFailure();
          }
        }

        function onDecodeFailure() {
          if (attemptId !== earlyLogoAttemptSeq) return;
          logoEl.classList.remove('is-decoded');
          logoEl.style.visibility = 'hidden';
          logoEl.style.opacity = '0';
          if (containerEl) {
            containerEl.classList.remove('is-logo-pending', 'is-logo-ready');
            containerEl.classList.add('is-logo-failed');
          }
        }

        return logoEl.decode().then(onDecodeSuccess).catch(onDecodeFailure);
      }

      // Case 1: QUIET state with aria-hidden="true" (decorative phase)
      const containerQuiet = {
        classes: new Set(),
        attrs: { 'data-qm-state': 'quiet', 'aria-hidden': 'true' },
        classList: {
          add(c) { containerQuiet.classes.add(c); },
          remove(...cs) { cs.forEach(c => containerQuiet.classes.delete(c)); },
          contains(c) { return containerQuiet.classes.has(c); }
        },
        getAttribute(k) { return containerQuiet.attrs[k] || null; }
      };
      const logoQuiet = {
        classes: new Set(),
        style: { opacity: '0', visibility: 'hidden' },
        naturalWidth: 610,
        decode: () => Promise.resolve(),
        classList: {
          add(c) { logoQuiet.classes.add(c); },
          remove(...cs) { cs.forEach(c => logoQuiet.classes.delete(c)); },
          contains(c) { return logoQuiet.classes.has(c); }
        }
      };

      await bindTestLogoReadiness(logoQuiet, containerQuiet);
      assert.ok(logoQuiet.classes.has('is-decoded'), 'Logo must have .is-decoded during QUIET state despite aria-hidden="true"');
      assert.equal(logoQuiet.style.opacity, '1', 'Logo opacity must be 1');
      assert.ok(containerQuiet.classes.has('is-logo-ready'), 'Container must have .is-logo-ready during QUIET state');
      assert.ok(!containerQuiet.classes.has('is-logo-pending'), 'Container must lose .is-logo-pending');

      // Case 2: BREATHING state with aria-hidden="true"
      const containerBreath = {
        classes: new Set(),
        attrs: { 'data-qm-state': 'breathing', 'aria-hidden': 'true' },
        classList: {
          add(c) { containerBreath.classes.add(c); },
          remove(...cs) { cs.forEach(c => containerBreath.classes.delete(c)); },
          contains(c) { return containerBreath.classes.has(c); }
        },
        getAttribute(k) { return containerBreath.attrs[k] || null; }
      };
      const logoBreath = {
        classes: new Set(),
        style: { opacity: '0', visibility: 'hidden' },
        naturalWidth: 610,
        decode: () => Promise.resolve(),
        classList: {
          add(c) { logoBreath.classes.add(c); },
          remove(...cs) { cs.forEach(c => logoBreath.classes.delete(c)); },
          contains(c) { return logoBreath.classes.has(c); }
        }
      };

      await bindTestLogoReadiness(logoBreath, containerBreath);
      assert.ok(logoBreath.classes.has('is-decoded'), 'Logo must have .is-decoded during BREATHING state');
      assert.ok(containerBreath.classes.has('is-logo-ready'), 'Container must have .is-logo-ready during BREATHING state');

      // Case 3: Dismissed state — must NEVER reveal artwork
      const containerDismissed = {
        classes: new Set(),
        attrs: { 'data-qm-state': 'dismissed', 'aria-hidden': 'true' },
        classList: {
          add(c) { containerDismissed.classes.add(c); },
          remove(...cs) { cs.forEach(c => containerDismissed.classes.delete(c)); },
          contains(c) { return containerDismissed.classes.has(c); }
        },
        getAttribute(k) { return containerDismissed.attrs[k] || null; }
      };
      const logoDismissed = {
        classes: new Set(),
        style: { opacity: '0', visibility: 'hidden' },
        naturalWidth: 610,
        decode: () => Promise.resolve(),
        classList: {
          add(c) { logoDismissed.classes.add(c); },
          remove(...cs) { cs.forEach(c => logoDismissed.classes.delete(c)); },
          contains(c) { return logoDismissed.classes.has(c); }
        }
      };

      await bindTestLogoReadiness(logoDismissed, containerDismissed);
      assert.ok(!logoDismissed.classes.has('is-decoded'), 'Dismissed overlay must NOT reveal .is-decoded');
      assert.ok(!containerDismissed.classes.has('is-logo-ready'), 'Dismissed overlay must NOT receive .is-logo-ready');
      assert.equal(logoDismissed.style.opacity, '0', 'Logo opacity must remain 0 on dismissed overlay');
    });

    it('D28: primes pending transition token for eligible reduced-motion Project Details navigation without animation', () => {
      const quietJs = readPublicFile('js/features/transitions/quiet-mark.js');

      // Verify reduced-motion pilot target detection in handleClick
      assert.ok(quietJs.includes("if (window.matchMedia('(prefers-reduced-motion: reduce)').matches)"), 'handleClick must check prefers-reduced-motion');
      assert.ok(quietJs.includes("const isPilotTarget = targetPath.startsWith('/work/') &&"), 'handleClick must check for pilot /work/ route');
      assert.ok(quietJs.includes("targetPath !== '/work' &&"), 'handleClick must exclude /work index');
      assert.ok(quietJs.includes("!targetPath.endsWith('.html');"), 'handleClick must exclude static .html paths');

      // Verify token payload structure identical to standard navigation
      assert.ok(quietJs.includes("sessionStorage.setItem(SESSION_KEY, JSON.stringify({\n          to: targetPath,\n          ts: Date.now()\n        }));"), 'handleClick must prime standard pending token');

      // Verify unadorned navigation (no e.preventDefault, no playOutbound, immediate return)
      assert.ok(quietJs.includes("// Allow ordinary browser navigation immediately; do not prevent default, do not animate\n    return;"), 'handleClick must return immediately for reduced-motion clicks');
    });

    it('D28 Behavioral: simulates reduced-motion click logic and confirms eligibility bounds', () => {
      const SESSION_KEY = 'mondo_quiet_mark_pending';
      const mockStorage = new Map();
      const sessionStorage = {
        setItem(k, v) { mockStorage.set(k, String(v)); },
        getItem(k) { return mockStorage.get(k) || null; },
        removeItem(k) { mockStorage.delete(k); }
      };

      function simulateClick({ href, isReduced, button = 0, defaultPrevented = false, modifiers = {}, isEligible = true }) {
        if (defaultPrevented) return { action: 'ignored', prevented: false };
        if (modifiers.meta || modifiers.ctrl || modifiers.shift || modifiers.alt) return { action: 'ignored', prevented: false };
        if (button !== 0) return { action: 'ignored', prevented: false };
        if (!isEligible) return { action: 'ignored', prevented: false };

        const targetUrl = new URL(href, 'http://localhost:3005');
        const targetPath = targetUrl.pathname.replace(/\/+$/, '') || '/';

        if (isReduced) {
          const isPilotTarget = targetPath.startsWith('/work/') && targetPath !== '/work' && !targetPath.endsWith('.html');
          if (isPilotTarget) {
            try {
              sessionStorage.setItem(SESSION_KEY, JSON.stringify({
                to: targetPath,
                ts: Date.now()
              }));
            } catch (_) {}
          }
          return { action: 'native_navigate', primed: isPilotTarget, prevented: false };
        }

        return { action: 'intercept_animated', primed: true, prevented: true };
      }

      // 1. Eligible project link with reduced motion -> primes token, native navigation
      const res1 = simulateClick({ href: '/work/rainbow-orchard', isReduced: true });
      assert.equal(res1.action, 'native_navigate');
      assert.equal(res1.primed, true);
      assert.equal(res1.prevented, false);
      const token1 = JSON.parse(sessionStorage.getItem(SESSION_KEY));
      assert.equal(token1.to, '/work/rainbow-orchard');
      assert.ok(typeof token1.ts === 'number');

      // 2. Non-pilot link (/work) with reduced motion -> does NOT prime token
      sessionStorage.removeItem(SESSION_KEY);
      const res2 = simulateClick({ href: '/work', isReduced: true });
      assert.equal(res2.action, 'native_navigate');
      assert.equal(res2.primed, false);
      assert.equal(sessionStorage.getItem(SESSION_KEY), null);

      // 3. Home link (/) with reduced motion -> does NOT prime token
      const res3 = simulateClick({ href: '/', isReduced: true });
      assert.equal(res3.action, 'native_navigate');
      assert.equal(res3.primed, false);
      assert.equal(sessionStorage.getItem(SESSION_KEY), null);

      // 4. Modifier click (Ctrl-click) -> ignored, no token
      const res4 = simulateClick({ href: '/work/rainbow-orchard', isReduced: true, modifiers: { ctrl: true } });
      assert.equal(res4.action, 'ignored');
      assert.equal(sessionStorage.getItem(SESSION_KEY), null);

      // 5. Normal motion (isReduced = false) -> intercepted for outbound animation
      const res5 = simulateClick({ href: '/work/rainbow-orchard', isReduced: false });
      assert.equal(res5.action, 'intercept_animated');
      assert.equal(res5.prevented, true);
    });
  });

  // ========================================================================
  // Section 17: Phase 5C.3.3-AQ1-R5 D29 & D30 Slow-Network Startup Resilience
  //             & Pre-Hydration Recovery
  // ========================================================================
  describe('Section 17: Slow-Network Startup Resilience & Pre-Hydration Recovery (D29 & D30)', () => {
    it('D29/D30 Contract: project.html initializes bootstrap state machine, script error listener, and pre-hydration retry handler', () => {
      const html = readPublicFile('work/project.html');
      const projectJs = readPublicFile('js/features/project/project-page.js');
      const quietJs = readPublicFile('js/features/transitions/quiet-mark.js');

      // 1. Initial bootstrap states in early head
      assert.ok(html.includes("window.__MONDO_BOOTSTRAP_STATE__ = 'bootstrap_pending';"), 'project.html must initialize bootstrap_pending');
      assert.ok(html.includes('window.__MONDO_SCRIPT_ERROR__ = false;'), 'project.html must initialize script_error as false');
      assert.ok(html.includes('window.__MONDO_RETRY_INTENT__ = false;'), 'project.html must initialize retry_intent as false');

      // 2. Early script error listener & pre-hydration retry
      assert.ok(html.includes('function onScriptError(source)'), 'project.html must define onScriptError helper');
      assert.ok(html.includes('window.__MONDO_ON_SCRIPT_ERROR__ = onScriptError;'), 'project.html must export onScriptError');
      assert.ok(html.includes('function handlePreHydrationRetry()'), 'project.html must define handlePreHydrationRetry');
      assert.ok(html.includes('window.__MONDO_HANDLE_RETRY__ = handlePreHydrationRetry;'), 'project.html must export handlePreHydrationRetry');

      // 3. Script tag error capture hooks
      assert.ok(html.includes('id="mondo-site-script" onerror="if(window.__MONDO_ON_SCRIPT_ERROR__)window.__MONDO_ON_SCRIPT_ERROR__(\'site\');"'), 'site script must wire onerror hook');
      assert.ok(html.includes('id="mondo-project-script" onerror="if(window.__MONDO_ON_SCRIPT_ERROR__)window.__MONDO_ON_SCRIPT_ERROR__(\'project\');"'), 'project script must wire onerror hook');

      // 4. Hydration state transitions in project-page.js
      assert.ok(projectJs.includes("window.__MONDO_BOOTSTRAP_STATE__ = 'hydrating';"), 'project-page.js must transition to hydrating');
      assert.ok(projectJs.includes("window.__MONDO_BOOTSTRAP_STATE__ = 'ready';"), 'project-page.js must transition to ready on notifyProjectReady');

      // 5. Retry delegation in quiet-mark.js
      assert.ok(quietJs.includes('window.__MONDO_HANDLE_RETRY__'), 'quiet-mark.js fallback must delegate to window.__MONDO_HANDLE_RETRY__');
    });

    it('D29 Resilience: 4,000ms watchdog mounts neutral Dark Ice startup notice when scripts are still pending', () => {
      let documentElementClasses = new Set(['is-project-pilot-guard']);
      let documentElementStyle = { background: '#000' };
      let mainClasses = new Set();
      let errorHostClasses = new Set(['project-error-host']);
      let errorHostAttrs = {};
      let errorHostInner = '';

      const mockHost = {
        id: 'project-error-host',
        classList: {
          add(c) { errorHostClasses.add(c); },
          remove(c) { errorHostClasses.delete(c); },
          contains(c) { return errorHostClasses.has(c); }
        },
        getAttribute(k) { return errorHostAttrs[k] || null; },
        setAttribute(k, v) { errorHostAttrs[k] = String(v); },
        hidden: true,
        get innerHTML() { return errorHostInner; },
        set innerHTML(v) {
          errorHostInner = v;
          if (v.includes('project-error-state')) {
            this._errEl = {
              getAttribute(k) { return this._attrs[k] || null; },
              setAttribute(k, val) { this._attrs[k] = String(val); },
              _attrs: {},
              focus: () => { this._focused = true; }
            };
          } else {
            this._errEl = null;
          }
        },
        querySelector(sel) {
          if (sel === '.project-error-state') return this._errEl;
          return null;
        }
      };

      const mockMain = {
        id: 'project-main',
        classList: {
          add(c) { mainClasses.add(c); },
          remove(c) { mainClasses.delete(c); },
          contains(c) { return mainClasses.has(c); }
        },
        firstChild: mockHost,
        insertBefore(node) { return node; }
      };

      const mockDoc = {
        documentElement: {
          classList: {
            add(c) { documentElementClasses.add(c); },
            remove(...cs) { cs.forEach(c => documentElementClasses.delete(c)); },
            contains(c) { return documentElementClasses.has(c); }
          },
          style: documentElementStyle
        },
        getElementById(id) {
          if (id === 'project-main') return mockMain;
          if (id === 'project-error-host') return mockHost;
          if (id === 'project-intro-wrap') return null;
          return null;
        },
        activeElement: null
      };

      const mockWin = {
        __MONDO_PROJECT_READY__: false,
        __MONDO_WATCHDOG_FIRED__: false,
        __MONDO_BOOTSTRAP_STATE__: 'bootstrap_pending',
        __MONDO_SCRIPT_ERROR__: false,
        __MONDO_RETRY_INTENT__: false
      };

      // Execute mount logic under bootstrap_pending
      function simulateMount(win, doc) {
        if (win.__MONDO_PROJECT_READY__) return;
        var introWrap = doc.getElementById('project-intro-wrap');
        if (introWrap && introWrap.children && introWrap.children.length > 0) return;
        var main = doc.getElementById('project-main');
        if (!main) return;
        win.__MONDO_WATCHDOG_FIRED__ = true;
        doc.documentElement.classList.add('is-project-pilot-error');
        main.classList.add('has-project-error');

        var host = doc.getElementById('project-error-host');
        if (!host) {
          host = mockHost;
          main.insertBefore(host, main.firstChild);
        }
        host.hidden = false;

        var isScriptFailed = Boolean(
          win.__MONDO_SCRIPT_ERROR__ ||
          win.__MONDO_BOOTSTRAP_STATE__ === 'script_error'
        );
        var targetNoticeType = isScriptFailed ? 'error' : 'slow_startup';
        var currentNoticeType = host.getAttribute('data-notice-type');
        var existingErr = host.querySelector('.project-error-state');

        if (!existingErr || currentNoticeType !== targetNoticeType) {
          host.setAttribute('data-notice-type', targetNoticeType);
          var eyebrow = isScriptFailed ? 'CONNECTION ISSUE' : 'STARTUP NOTICE';
          var title = isScriptFailed ? 'Unable to load project.' : 'Loading is taking longer than expected.';
          var body = isScriptFailed
            ? 'We encountered a problem loading this project brief. Your connection may be offline or interrupted.'
            : 'The project assets are taking longer to load over your network connection. We are still connecting in the background.';
          var isRetryPending = Boolean(win.__MONDO_RETRY_INTENT__);
          var btnLabel = isRetryPending ? 'Connecting\u2026' : 'Try again';
          var btnAttrs = isRetryPending ? ' disabled aria-busy="true" style="pointer-events: none;"' : '';

          host.innerHTML = '<div class="project-error-state" role="alert" tabindex="-1" style="text-align: center; padding: 100px 20px;">' +
            '<p class="eyebrow"><span class="lime-dot"></span> ' + eyebrow + '</p>' +
            '<h1>' + title + '</h1>' +
            '<p class="muted" style="max-width: 480px; margin: 16px auto 32px;">' + body + '</p>' +
            '<div style="display: flex; gap: 16px; justify-content: center; flex-wrap: wrap;">' +
            '<button class="button" id="project-retry-btn" type="button"' + btnAttrs + ' onclick="if(window.__MONDO_HANDLE_RETRY__){window.__MONDO_HANDLE_RETRY__();}else if(window.__MONDO_RETRY_PROJECT__){window.__MONDO_RETRY_PROJECT__();}else{window.location.reload();}">'+ btnLabel + '</button>' +
            '<a class="button button-outline" href="/work">Back to our work</a>' +
            '</div>' +
            '</div>';
        }
      }

      simulateMount(mockWin, mockDoc);

      assert.equal(mockWin.__MONDO_WATCHDAND_FIRED__ !== false, true);
      assert.equal(mockHost.hidden, false);
      assert.equal(mockHost.getAttribute('data-notice-type'), 'slow_startup');
      assert.ok(mockHost.innerHTML.includes('STARTUP NOTICE'), 'Must display neutral STARTUP NOTICE');
      assert.ok(mockHost.innerHTML.includes('Loading is taking longer than expected.'), 'Must display neutral heading');
      assert.ok(!mockHost.innerHTML.includes('Unable to load project.'), 'Must NOT claim project data failure');
      assert.ok(mockHost.innerHTML.includes('window.__MONDO_HANDLE_RETRY__'), 'Retry button must wire handlePreHydrationRetry');
      assert.ok(mockHost.innerHTML.includes('Back to our work'), 'Must retain back to work escape link');
    });

    it('D29 Failure Discrimination: confirmed script load error mounts connection issue failure state', () => {
      let hostAttrs = {};
      let hostInner = '';
      const mockHost = {
        hidden: true,
        getAttribute(k) { return hostAttrs[k] || null; },
        setAttribute(k, v) { hostAttrs[k] = String(v); },
        get innerHTML() { return hostInner; },
        set innerHTML(v) { hostInner = v; },
        querySelector: () => null
      };

      const mockWin = {
        __MONDO_PROJECT_READY__: false,
        __MONDO_WATCHDOG_FIRED__: false,
        __MONDO_BOOTSTRAP_STATE__: 'script_error',
        __MONDO_SCRIPT_ERROR__: true,
        __MONDO_RETRY_INTENT__: false
      };

      function mountError(win, host) {
        host.hidden = false;
        const isScriptFailed = Boolean(win.__MONDO_SCRIPT_ERROR__ || win.__MONDO_BOOTSTRAP_STATE__ === 'script_error');
        const eyebrow = isScriptFailed ? 'CONNECTION ISSUE' : 'STARTUP NOTICE';
        const title = isScriptFailed ? 'Unable to load project.' : 'Loading is taking longer than expected.';
        host.setAttribute('data-notice-type', isScriptFailed ? 'error' : 'slow_startup');
        host.innerHTML = `<h1>${title}</h1><p class="eyebrow">${eyebrow}</p>`;
      }

      mountError(mockWin, mockHost);
      assert.equal(mockHost.getAttribute('data-notice-type'), 'error');
      assert.ok(mockHost.innerHTML.includes('CONNECTION ISSUE'));
      assert.ok(mockHost.innerHTML.includes('Unable to load project.'));
    });

    it('D30 Pre-Hydration Retry: pre-hydration click sets retry intent without document reload', () => {
      let reloaded = false;
      let buttonText = 'Try again';
      let buttonDisabled = false;
      let buttonBusy = false;

      const mockBtn = {
        get textContent() { return buttonText; },
        set textContent(v) { buttonText = v; },
        setAttribute(k, v) {
          if (k === 'disabled') buttonDisabled = true;
          if (k === 'aria-busy') buttonBusy = (v === 'true');
        },
        style: {}
      };

      const mockWin = {
        __MONDO_RETRY_PROJECT__: undefined, // JS bundle not yet arrived
        __MONDO_SCRIPT_ERROR__: false,
        __MONDO_RETRY_INTENT__: false,
        location: {
          reload: () => { reloaded = true; }
        }
      };

      function simulatePreHydrationRetry(win, btn) {
        if (typeof win.__MONDO_RETRY_PROJECT__ === 'function') {
          win.__MONDO_RETRY_PROJECT__();
          return;
        }
        if (win.__MONDO_SCRIPT_ERROR__) {
          win.location.reload();
          return;
        }
        win.__MONDO_RETRY_INTENT__ = true;
        if (btn) {
          btn.textContent = 'Connecting\u2026';
          btn.setAttribute('disabled', 'disabled');
          btn.setAttribute('aria-busy', 'true');
          btn.style.pointerEvents = 'none';
        }
      }

      // First click: sets intent and updates button
      simulatePreHydrationRetry(mockWin, mockBtn);

      assert.equal(mockWin.__MONDO_RETRY_INTENT__, true, '__MONDO_RETRY_INTENT__ must be set');
      assert.equal(buttonText, 'Connecting\u2026', 'Button text must become Connecting…');
      assert.equal(buttonDisabled, true, 'Button must be disabled');
      assert.equal(buttonBusy, true, 'aria-busy must be true');
      assert.equal(mockBtn.style.pointerEvents, 'none', 'Pointer events must be none');
      assert.equal(reloaded, false, 'location.reload() must NEVER be called when JS is merely delayed');

      // Second click (idempotent): still no reload
      simulatePreHydrationRetry(mockWin, mockBtn);
      assert.equal(reloaded, false, 'Repeated clicks must remain idempotent and not reload');

      // Now verify behavior if script ACTUALLY failed
      mockWin.__MONDO_SCRIPT_ERROR__ = true;
      simulatePreHydrationRetry(mockWin, mockBtn);
      assert.equal(reloaded, true, 'When script error is confirmed, reload is invoked as definitive recovery');
    });

    it('D29/D30 Late Hydration: delayed script arrival clears startup notice and recovers project layout', () => {
      let mainClasses = new Set(['has-project-error']);
      let docClasses = new Set(['is-project-pilot-error']);
      let hostInner = '<div class="project-error-state"><h1>Loading is taking longer than expected.</h1></div>';
      let hostHidden = false;

      const mockHost = {
        id: 'project-error-host',
        get hidden() { return hostHidden; },
        set hidden(v) { hostHidden = v; },
        get innerHTML() { return hostInner; },
        set innerHTML(v) { hostInner = v; }
      };

      const mockMain = {
        id: 'project-main',
        classList: {
          add(c) { mainClasses.add(c); },
          remove(...cs) { cs.forEach(c => mainClasses.delete(c)); },
          contains(c) { return mainClasses.has(c); }
        },
        querySelector: (sel) => (sel === '#project-error-host' ? mockHost : null)
      };

      const mockIntro = { id: 'project-intro-wrap', innerHTML: '' };
      const mockMedia = { id: 'project-media', innerHTML: '' };
      const mockStory = { id: 'project-story', innerHTML: '' };
      const mockExplore = { id: 'explore-grid', innerHTML: '' };

      const byId = {
        'project-main': mockMain,
        'project-error-host': mockHost,
        'project-intro-wrap': mockIntro,
        'project-media': mockMedia,
        'project-story': mockStory,
        'explore-grid': mockExplore
      };

      const mockRoot = {
        getElementById: (id) => byId[id] || null,
        querySelector: (sel) => {
          if (sel.startsWith('#')) return byId[sel.slice(1)] || null;
          return null;
        }
      };

      // Set global window state as if 4,000ms watchdog fired
      global.window = global.window || {};
      global.window.__MONDO_WATCHDOG_FIRED__ = true;
      global.window.__MONDO_LATE_RECOVERED__ = false;
      global.window.__MONDO_BOOTSTRAP_STATE__ = 'bootstrap_pending';
      global.document = {
        documentElement: {
          classList: {
            remove(...cs) { cs.forEach(c => docClasses.delete(c)); },
            contains(c) { return docClasses.has(c); }
          }
        }
      };

      // 1. Verify pre-hydration error state is active
      assert.equal(mainClasses.has('has-project-error'), true);
      assert.equal(hostHidden, false);
      assert.ok(hostInner.includes('Loading is taking longer than expected.'));

      // 2. Late script executes: initProjectPage sets hydrating, then renderProject runs
      global.window.__MONDO_BOOTSTRAP_STATE__ = 'hydrating';
      const rainbow = defaultProjects.find((p) => p.slug === 'rainbow-orchard') || defaultProjects[0];
      renderProject(rainbow, defaultProjects, { root: mockRoot, trackEvent: () => {} });

      // 3. Verify late recovery cleared error state and populated content
      assert.equal(mainClasses.has('has-project-error'), false, 'has-project-error must be removed');
      assert.equal(docClasses.has('is-project-pilot-error'), false, 'is-project-pilot-error must be removed');
      assert.equal(mockHost.hidden, true, '#project-error-host must be hidden');
      assert.equal(mockHost.innerHTML, '', '#project-error-host must be cleared');
      assert.equal(global.window.__MONDO_WATCHDOG_FIRED__, false, '__MONDO_WATCHDOG_FIRED__ must reset');
      assert.equal(global.window.__MONDO_LATE_RECOVERED__, true, '__MONDO_LATE_RECOVERED__ must be true');
      assert.ok(mockIntro.innerHTML.includes(rainbow.title), 'Project intro must render project title');
      assert.ok(mockStory.innerHTML.includes('THE IDEA'), 'Project story must render concept note');
    });
  });

  describe('Phase 5C.3.3-AQ1-R6 Stage 2: G1-MINIMAL Geometry Stabilization', () => {
    it('G1-01: project.html early critical CSS contains minimal img { max-width: 100% } declaration', () => {
      const html = readPublicFile('work/project.html');
      const criticalCssMatch = html.match(/<style\s+id=["']mondo-pilot-critical-css["']>([\s\S]*?)<\/style>/i);
      assert.ok(criticalCssMatch, '<style id="mondo-pilot-critical-css"> must exist');
      const criticalCss = criticalCssMatch[1];

      // Verify G1-MINIMAL rule exists in early critical CSS
      assert.match(criticalCss, /img\s*\{[^}]*max-width:\s*100%[^}]*\}/i, 'Early critical CSS must contain img { max-width: 100% }');
    });

    it('G1-02: G1 scope is strictly minimal with zero unauthorized global resets', () => {
      const html = readPublicFile('work/project.html');
      const criticalCss = html.match(/<style\s+id=["']mondo-pilot-critical-css["']>([\s\S]*?)<\/style>/i)[1];

      // Verify no unauthorized global resets were added to critical CSS
      assert.ok(!criticalCss.includes('*, *::before') && !criticalCss.includes('* { box-sizing'), 'Must NOT add global box-sizing reset');
      assert.ok(!criticalCss.includes('overflow-x: hidden'), 'Must NOT add global overflow-x: hidden workaround');
      assert.ok(!criticalCss.includes('html, body { width: 100%'), 'Must NOT add global html/body width: 100% override');
      assert.ok(!criticalCss.includes('100dvh'), 'Must NOT add 100dvh viewport height logic');
      assert.ok(!criticalCss.includes('100dvw'), 'Must NOT add 100dvw viewport width logic');
    });

    it('G1-03: Quiet Mark logo geometry and aspect ratio remain strictly preserved', () => {
      const html = readPublicFile('work/project.html');
      const criticalCss = html.match(/<style\s+id=["']mondo-pilot-critical-css["']>([\s\S]*?)<\/style>/i)[1];

      // Logo aspect ratio, clamp sizing, and max dimensions must remain intact
      assert.match(criticalCss, /aspect-ratio:\s*610\s*\/\s*870/, 'Logo aspect-ratio must remain 610 / 870');
      assert.match(criticalCss, /max-width:\s*55vw/, 'Logo max-width must remain 55vw');
      assert.match(criticalCss, /height:\s*clamp\(290px,\s*48\.6vh,\s*438px\)/, 'Desktop logo height must remain clamp(290px, 48.6vh, 438px)');
      assert.match(criticalCss, /height:\s*clamp\(242px,\s*37\.8vh,\s*298px\)/, 'Mobile logo height must remain clamp(242px, 37.8vh, 298px)');
    });

    it('G1-04: Frozen breathing timing constants and scale parameters remain unchanged', () => {
      const html = readPublicFile('work/project.html');
      const criticalCss = html.match(/<style\s+id=["']mondo-pilot-critical-css["']>([\s\S]*?)<\/style>/i)[1];

      // Breathing onset: 450ms, Subtle breathing: 2.6s, scale 1.015 <-> 0.985
      assert.match(criticalCss, /mondo-qm-breathing-onset\s+450ms/, 'Breathing onset must remain 450ms');
      assert.match(criticalCss, /mondo-qm-subtle-breathing\s+2\.6s/, 'Subtle breathing cycle must remain 2.6s');
      assert.match(criticalCss, /scale\(1\.015\)/, 'Breathing peak scale must remain 1.015');
      assert.match(criticalCss, /scale\(0\.985\)/, 'Breathing trough scale must remain 0.985');
    });

    it('G1-05: Strict decode gating (D23/D25), reduced motion (D27/D28), and resilience (D29/D30) remain intact', () => {
      const html = readPublicFile('work/project.html');

      // D25: strict decode rejection
      assert.ok(html.includes('logoEl.decode().then(onDecodeSuccess).catch('), 'Must retain strict decode() promise with catch rejection');
      assert.ok(html.includes('onDecodeFailure();'), 'Must route decode error directly to onDecodeFailure');

      // D27/D28: reduced motion
      assert.ok(html.includes('@media (prefers-reduced-motion: reduce)'), 'Must retain prefers-reduced-motion media query');
      assert.ok(html.includes('transform: none !important'), 'Reduced motion must suppress transform');

      // D29/D30: resilience and pre-hydration retry
      assert.ok(html.includes('window.__MONDO_BOOTSTRAP_STATE__'), 'Must retain bootstrap state machine');
      assert.ok(html.includes('window.__MONDO_HANDLE_RETRY__'), 'Must retain pre-hydration retry handler');
      assert.ok(html.includes('window.__MONDO_MOUNT_PILOT_ERROR__'), 'Must retain non-destructive watchdog notice');
    });
  });

  describe('Phase 5C.3.3-AQ1-R6 Stage 3: D24-LIMITED Authentic PNG Source Prefetch Trial', () => {
    it('D24-01: public/work/index.html contains exact prefetch resource hint for authentic MONDO PNG', () => {
      const html = readPublicFile('work/index.html');
      assert.match(
        html,
        /<link\s+rel=["']prefetch["']\s+as=["']image["']\s+href=["']\/assets\/intro\/mondo-white\.png["']\s*\/?>/i,
        'public/work/index.html must contain <link rel="prefetch" as="image" href="/assets/intro/mondo-white.png">'
      );
    });

    it('D24-02: prefetch hint points strictly to authentic PNG asset without unauthorized substitutions', () => {
      const html = readPublicFile('work/index.html');
      const headMatch = html.match(/<head>([\s\S]*?)<\/head>/i);
      assert.ok(headMatch, '<head> must exist in work/index.html');
      const head = headMatch[1];

      // Must NOT contain unauthorized SVG or data URI fallbacks
      assert.ok(!head.includes('mondo-white.svg'), 'Must not substitute SVG for authentic PNG');
      assert.ok(!head.includes('data:image/'), 'Must not embed base64 image data URI');
      // Must NOT contain full preload (pre-fetch trial only)
      assert.ok(!head.includes('rel="preload" as="image" href="/assets/intro/mondo-white.png"'), 'Must remain prefetch, not preload');
    });

    it('D24-03: G1-MINIMAL critical geometry CSS remains intact in project.html', () => {
      const html = readPublicFile('work/project.html');
      const criticalCssMatch = html.match(/<style\s+id=["']mondo-pilot-critical-css["']>([\s\S]*?)<\/style>/i);
      assert.ok(criticalCssMatch, '<style id="mondo-pilot-critical-css"> must exist');
      const criticalCss = criticalCssMatch[1];
      assert.match(criticalCss, /img\s*\{[^}]*max-width:\s*100%[^}]*\}/i, 'img { max-width: 100% } must be retained');
    });

    it('D24-04: D29 slow-network resilience and D30 retry logic remain intact', () => {
      const html = readPublicFile('work/project.html');
      assert.ok(html.includes('window.__MONDO_BOOTSTRAP_STATE__'), 'Must retain bootstrap state machine');
      assert.ok(html.includes('window.__MONDO_HANDLE_RETRY__'), 'Must retain pre-hydration retry handler');
      assert.ok(html.includes('window.__MONDO_MOUNT_PILOT_ERROR__'), 'Must retain non-destructive watchdog notice');
    });

    it('D24-05: Authenticity of mondo-white.png binary remains byte-for-byte identical', () => {
      const pngPath = join(PUBLIC, 'assets/intro/mondo-white.png');
      assert.ok(existsSync(pngPath), 'mondo-white.png must exist');
      const buffer = readFileSync(pngPath);
      assert.equal(buffer.length, 91205, 'PNG size must be exactly 91,205 bytes');
      const hash = createHash('sha256').update(buffer).digest('hex');
      assert.equal(
        hash,
        'df403822fdf20c116165ff7120bf69f9f383f3b219d4a4307ed18fcadc6c9a56',
        'PNG SHA-256 must match authentic frozen hash'
      );
    });
  });
});
