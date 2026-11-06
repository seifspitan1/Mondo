import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

test('Phase 5B.3A Removal: Legacy transition engine files are completely absent', () => {
  const legacyFiles = [
    path.join(rootDir, 'public', 'js', 'features', 'transitions', 'effects.js'),
    path.join(rootDir, 'public', 'js', 'features', 'transitions', 'transition-engine.js'),
    path.join(rootDir, 'public', 'js', 'features', 'transitions', 'navigation-interceptor.js'),
    path.join(rootDir, 'public', 'css', 'features', 'transitions.css')
  ];

  for (const filePath of legacyFiles) {
    assert.equal(
      fs.existsSync(filePath),
      false,
      `Legacy transition file must not exist: ${path.relative(rootDir, filePath)}`
    );
  }
});

test('Phase 5B.3A Removal: CSS styles have zero transition engine imports or rules', () => {
  const styleCssPath = path.join(rootDir, 'public', 'css', 'style.css');
  assert.ok(fs.existsSync(styleCssPath), 'style.css must exist');
  const styleCss = fs.readFileSync(styleCssPath, 'utf8');

  assert.equal(
    styleCss.includes('transitions.css'),
    false,
    'style.css must not import transitions.css'
  );
  assert.equal(
    styleCss.includes('has-transition'),
    false,
    'style.css must not reference has-transition class'
  );
  assert.equal(
    styleCss.includes('mondo-transition'),
    false,
    'style.css must not reference mondo-transition overlay classes'
  );
});

test('Phase 5B.3A Removal: site.js is clean native navigation with no transition engine code', async () => {
  const siteJsPath = path.join(rootDir, 'public', 'js', 'site.js');
  assert.ok(fs.existsSync(siteJsPath), 'site.js must exist');
  const siteJs = fs.readFileSync(siteJsPath, 'utf8');

  // Verify no legacy transition imports
  assert.equal(siteJs.includes('transition-engine'), false, 'site.js must not import transition-engine');
  assert.equal(siteJs.includes('navigation-interceptor'), false, 'site.js must not import navigation-interceptor');
  assert.equal(siteJs.includes('effects.js'), false, 'site.js must not import effects.js');

  // Verify no window.__mondoTransitions bridge
  assert.equal(siteJs.includes('__mondoTransitions'), false, 'site.js must not expose __mondoTransitions');

  // Verify clean exports
  const siteModule = await import('../public/js/site.js');
  assert.equal(typeof siteModule.initNavigation, 'function', 'initNavigation must be exported');
  assert.equal(typeof siteModule.escapeHtml, 'function', 'escapeHtml must be exported');
  assert.equal(typeof siteModule.renderProjectCard, 'function', 'renderProjectCard must be exported');
  assert.equal(typeof siteModule.icons, 'object', 'icons must be exported');
  assert.equal(typeof siteModule.track, 'function', 'track must be exported');
  assert.equal(typeof siteModule.initQuietMark, 'function', 'initQuietMark must be exported');

  // Verify legacy transition exports are completely gone
  assert.equal(siteModule.initTransitionEngine, undefined, 'initTransitionEngine must not be exported');
  assert.equal(siteModule.startOutbound, undefined, 'startOutbound must not be exported');
  assert.equal(siteModule.cleanupTransition, undefined, 'cleanupTransition must not be exported');
  assert.equal(siteModule.selectRandomEffect, undefined, 'selectRandomEffect must not be exported');
  assert.equal(siteModule.getLastEffectId, undefined, 'getLastEffectId must not be exported');
  assert.equal(siteModule.saveLastEffectId, undefined, 'saveLastEffectId must not be exported');
  assert.equal(siteModule.initNavigationInterceptor, undefined, 'initNavigationInterceptor must not be exported');
  assert.equal(siteModule.isEligibleNavigation, undefined, 'isEligibleNavigation must not be exported');
  assert.equal(siteModule.EFFECT_CONFIGS, undefined, 'EFFECT_CONFIGS must not be exported');
  assert.equal(siteModule.APPROVED_EFFECT_IDS, undefined, 'APPROVED_EFFECT_IDS must not be exported');
});

test('Phase 5B.3A Removal: HTML pages contain zero transition hooks or session keys', () => {
  const htmlPages = [
    path.join(rootDir, 'public', 'index.html'),
    path.join(rootDir, 'public', 'work', 'index.html'),
    path.join(rootDir, 'public', 'work', 'project.html'),
    path.join(rootDir, 'public', 'start', 'index.html'),
    path.join(rootDir, 'public', 'privacy', 'index.html')
  ];

  for (const pagePath of htmlPages) {
    const content = fs.readFileSync(pagePath, 'utf8');
    const rel = path.relative(rootDir, pagePath);

    assert.equal(
      content.includes('mondo_transition_pending'),
      false,
      `${rel} must not check mondo_transition_pending`
    );
    assert.equal(
      content.includes('mondo_last_transition_effect'),
      false,
      `${rel} must not reference mondo_last_transition_effect`
    );
    assert.equal(
      content.includes('has-transition'),
      false,
      `${rel} must not contain has-transition class`
    );
    assert.equal(
      content.includes('mondo-transition-overlay'),
      false,
      `${rel} must not contain mondo-transition-overlay`
    );

    // Dark metadata should be preserved
    assert.ok(
      content.includes('meta name="color-scheme" content="dark"'),
      `${rel} must preserve dark color-scheme metadata`
    );
    assert.ok(
      content.includes('meta name="theme-color" content="#08090b"'),
      `${rel} must preserve dark theme-color metadata`
    );
  }
});

test('Phase 5B.3A Preservation: Approved Phase 5A.1 Main Intro remains 100% intact', () => {
  // 1. Verify index.html still has intro elements
  const indexHtml = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf8');
  assert.ok(indexHtml.includes('id="mondo-intro"'), 'index.html must contain #mondo-intro element');
  assert.ok(indexHtml.includes('id="mondo-intro-stage"'), 'index.html must contain #mondo-intro-stage canvas');
  assert.ok(indexHtml.includes("sessionStorage.getItem('mondo_intro_shown')"), 'index.html must check mondo_intro_shown');
  assert.ok(indexHtml.includes("document.documentElement.classList.add('has-intro')"), 'index.html must set has-intro');

  // 2. Verify all 5 intro image preloads on index.html
  assert.ok(indexHtml.includes('/assets/intro/mondo-white.png'), 'Must preload mondo-white.png');
  assert.ok(indexHtml.includes('/assets/intro/mondo-black.png'), 'Must preload mondo-black.png');
  assert.ok(indexHtml.includes('/assets/intro/mondo-metal.png'), 'Must preload mondo-metal.png');
  assert.ok(indexHtml.includes('/assets/intro/mondo-rim.png'), 'Must preload mondo-rim.png');
  assert.ok(indexHtml.includes('/assets/intro/mondo-depth.png'), 'Must preload mondo-depth.png');

  // 3. Verify intro assets exist on disk
  const assets = ['mondo-white.png', 'mondo-black.png', 'mondo-metal.png', 'mondo-rim.png', 'mondo-depth.png'];
  for (const asset of assets) {
    const assetPath = path.join(rootDir, 'public', 'assets', 'intro', asset);
    assert.ok(fs.existsSync(assetPath), `Intro asset ${asset} must exist`);
  }

  // 4. Verify intro CSS & JS files exist
  assert.ok(fs.existsSync(path.join(rootDir, 'public', 'css', 'features', 'intro.css')), 'intro.css must exist');
  assert.ok(fs.existsSync(path.join(rootDir, 'public', 'js', 'features', 'intro', 'intro.js')), 'intro.js must exist');
  assert.ok(fs.existsSync(path.join(rootDir, 'public', 'js', 'intro.js')), 'public/js/intro.js must exist');
});

test('Phase 5B.3B Integration: Quiet Mark minimal transition is properly integrated', () => {
  // 1. Verify Quiet Mark files exist
  const quietMarkJs = path.join(rootDir, 'public', 'js', 'features', 'transitions', 'quiet-mark.js');
  const quietMarkCss = path.join(rootDir, 'public', 'css', 'features', 'quiet-mark.css');
  assert.ok(fs.existsSync(quietMarkJs), 'quiet-mark.js must exist');
  assert.ok(fs.existsSync(quietMarkCss), 'quiet-mark.css must exist');

  // 2. Verify style.css imports quiet-mark.css
  const styleCss = fs.readFileSync(path.join(rootDir, 'public', 'css', 'style.css'), 'utf8');
  assert.ok(styleCss.includes('./features/quiet-mark.css'), 'style.css must import quiet-mark.css');

  // 3. Verify quiet-mark.css specifies pure black background and centered logo
  const quietCss = fs.readFileSync(quietMarkCss, 'utf8');
  assert.ok(quietCss.includes('#000000'), 'quiet-mark.css must specify pure black #000000 background');
  assert.ok(quietCss.includes('.mondo-quiet-mark'), 'quiet-mark.css must style .mondo-quiet-mark overlay');
  assert.ok(quietCss.includes('.mondo-quiet-mark__logo'), 'quiet-mark.css must style .mondo-quiet-mark__logo');
  assert.ok(quietCss.includes('prefers-reduced-motion: reduce'), 'quiet-mark.css must respect reduced motion');

  // 4. Verify quiet-mark.js uses authentic white logo and session key
  const quietJs = fs.readFileSync(quietMarkJs, 'utf8');
  assert.ok(quietJs.includes('mondo_quiet_mark_pending'), 'quiet-mark.js must use mondo_quiet_mark_pending session key');
  assert.ok(quietJs.includes('/assets/intro/mondo-white.png'), 'quiet-mark.js must use authentic white logo');
  assert.ok(quietJs.includes('ANIMATION_DURATION = 420'), 'quiet-mark.js must use 420ms duration');

  // 5. Verify all HTML pages have synchronous dark priming script for quiet mark
  const htmlPages = [
    path.join(rootDir, 'public', 'index.html'),
    path.join(rootDir, 'public', 'work', 'index.html'),
    path.join(rootDir, 'public', 'work', 'project.html'),
    path.join(rootDir, 'public', 'start', 'index.html'),
    path.join(rootDir, 'public', 'privacy', 'index.html')
  ];
  for (const pagePath of htmlPages) {
    const content = fs.readFileSync(pagePath, 'utf8');
    const rel = path.relative(rootDir, pagePath);
    assert.ok(
      content.includes('mondo_quiet_mark_pending'),
      `${rel} must check mondo_quiet_mark_pending for dark priming`
    );
  }
});

test('Phase 5C.2A Resilience: P1 slow-network state preservation and P2 post-intro listener registration', () => {
  const quietMarkJsPath = path.join(rootDir, 'public', 'js', 'features', 'transitions', 'quiet-mark.js');
  const quietJs = fs.readFileSync(quietMarkJsPath, 'utf8');

  // Verify dangerous 2000ms stale state timer on page load is completely removed
  assert.equal(
    quietJs.includes('setTimeout(clearStaleState, 2000)'),
    false,
    'quiet-mark.js must NOT schedule clearStaleState on a 2000ms timer'
  );

  // Verify resilient transition age and stall timeout constants
  assert.ok(quietJs.includes('MAX_TRANSITION_AGE'), 'Must define MAX_TRANSITION_AGE');
  assert.ok(quietJs.includes('STALL_TIMEOUT'), 'Must define STALL_TIMEOUT');

  // Verify destination path association
  assert.ok(quietJs.includes('readPendingTransition'), 'Must implement readPendingTransition');
  assert.ok(quietJs.includes('normalizePath'), 'Must implement normalizePath');

  // Verify dynamic has-intro check in handleClick (P2 fix)
  assert.ok(
    quietJs.includes("if (document.documentElement.classList.contains('has-intro')) return;"),
    'handleClick must evaluate has-intro dynamically at click time'
  );

  // Verify listenersBound idempotency guard
  assert.ok(quietJs.includes('listenersBound'), 'Must guard listener registration against duplicate execution');
});

test('Phase 5C.2A.2 Navigation Cancellation: Explicit cancelPendingNavigation pathway with window.stop()', () => {
  const quietMarkJsPath = path.join(rootDir, 'public', 'js', 'features', 'transitions', 'quiet-mark.js');
  const quietJs = fs.readFileSync(quietMarkJsPath, 'utf8');

  // Verify cancelPendingNavigation function is defined
  assert.ok(
    quietJs.includes('function cancelPendingNavigation(reason)'),
    'quiet-mark.js must define dedicated cancelPendingNavigation(reason) function'
  );

  // Verify window.stop() is invoked inside cancelPendingNavigation
  assert.ok(
    quietJs.includes('window.stop()'),
    'cancelPendingNavigation must invoke window.stop() to halt native browser navigation'
  );

  // Verify generic dismissOverlay does NOT blindly call window.stop()
  const dismissOverlayMatch = quietJs.match(/function dismissOverlay\(\) \{([\s\S]*?)\}/);
  assert.ok(dismissOverlayMatch, 'dismissOverlay must be defined');
  assert.equal(
    dismissOverlayMatch[1].includes('window.stop()'),
    false,
    'dismissOverlay must NOT call window.stop() so bfcache and visual cleanup remain unaffected'
  );

  // Verify stall timeout calls cancelPendingNavigation('timeout')
  assert.ok(
    quietJs.includes("cancelPendingNavigation('timeout')"),
    'stall timeout must invoke cancelPendingNavigation with timeout reason'
  );

  // Verify escape key calls cancelPendingNavigation('escape') when navigating
  assert.ok(
    quietJs.includes("cancelPendingNavigation('escape')"),
    'Escape key listener must invoke cancelPendingNavigation with escape reason when isNavigating is true'
  );

  // Verify outbound resolution abort guard if canceled during animation
  assert.ok(
    quietJs.includes('if (!isNavigating) return;'),
    'playOutbound resolution must check isNavigating before proceeding with navigation'
  );
});


test('Phase 5C.2B.1 Guard: CSS contains inbound visibility guard rules', () => {
  const quietCss = fs.readFileSync(
    path.join(rootDir, 'public', 'css', 'features', 'quiet-mark.css'),
    'utf8'
  );

  // Guard class on html element
  assert.ok(
    quietCss.includes('html.is-quiet-mark-inbound'),
    'quiet-mark.css must define html.is-quiet-mark-inbound rules'
  );

  // Pure black background on html and body during guard
  assert.ok(
    quietCss.includes('html.is-quiet-mark-inbound body'),
    'quiet-mark.css must set body background during guard'
  );

  // Visibility: visible on overlay itself to prevent inheritance hiding
  assert.ok(
    quietCss.includes('visibility: visible'),
    'quiet-mark.css must set visibility: visible on .mondo-quiet-mark to prevent inheritance hiding'
  );
});

test('Phase 5C.2B.1 Guard: CSS hides body children (not body itself) and excludes overlay and intro', () => {
  const quietCss = fs.readFileSync(
    path.join(rootDir, 'public', 'css', 'features', 'quiet-mark.css'),
    'utf8'
  );

  // Must use body > *:not() pattern, NOT bare body { visibility: hidden }
  assert.ok(
    quietCss.includes('body > *:not(#mondo-quiet-mark)'),
    'Guard must target body > *:not(#mondo-quiet-mark) to hide siblings, not body itself'
  );
  assert.ok(
    quietCss.includes(':not(#mondo-intro)'),
    'Guard must exclude #mondo-intro from visibility hiding'
  );
  assert.ok(
    quietCss.includes('visibility: hidden !important'),
    'Guard must use visibility: hidden !important on body children'
  );
});

test('Phase 5C.2B.1 Guard: quiet-mark.js removes is-quiet-mark-inbound class in all code paths', () => {
  const quietJs = fs.readFileSync(
    path.join(rootDir, 'public', 'js', 'features', 'transitions', 'quiet-mark.js'),
    'utf8'
  );

  // Must remove guard class in initQuietMark — explicit removal after overlay mount
  const guardRemovalCount = (quietJs.match(/classList\.remove\('is-quiet-mark-inbound'\)/g) || []).length;
  assert.ok(
    guardRemovalCount >= 2,
    `quiet-mark.js must remove is-quiet-mark-inbound in multiple code paths (found ${guardRemovalCount})`
  );

  // clearStaleState must also remove the guard class
  const clearStaleBlock = quietJs.match(/function clearStaleState[\s\S]*?\n\}/);
  assert.ok(clearStaleBlock, 'clearStaleState must be defined');
  assert.ok(
    clearStaleBlock[0].includes('is-quiet-mark-inbound'),
    'clearStaleState must remove is-quiet-mark-inbound class'
  );
});

test('Phase 5C.2B.1 Guard: All 5 HTML head scripts add is-quiet-mark-inbound class', () => {
  const htmlPages = [
    path.join(rootDir, 'public', 'index.html'),
    path.join(rootDir, 'public', 'work', 'index.html'),
    path.join(rootDir, 'public', 'work', 'project.html'),
    path.join(rootDir, 'public', 'start', 'index.html'),
    path.join(rootDir, 'public', 'privacy', 'index.html')
  ];

  for (const pagePath of htmlPages) {
    const content = fs.readFileSync(pagePath, 'utf8');
    const rel = path.relative(rootDir, pagePath);

    assert.ok(
      content.includes("classList.add('is-quiet-mark-inbound')"),
      `${rel} head script must add is-quiet-mark-inbound class`
    );
  }
});

test('Phase 5C.2B.1 Guard: All 5 HTML head scripts include watchdog setTimeout for fail-open recovery', () => {
  const htmlPages = [
    path.join(rootDir, 'public', 'index.html'),
    path.join(rootDir, 'public', 'work', 'index.html'),
    path.join(rootDir, 'public', 'work', 'project.html'),
    path.join(rootDir, 'public', 'start', 'index.html'),
    path.join(rootDir, 'public', 'privacy', 'index.html')
  ];

  for (const pagePath of htmlPages) {
    const content = fs.readFileSync(pagePath, 'utf8');
    const rel = path.relative(rootDir, pagePath);

    // Must have setTimeout watchdog
    assert.ok(
      content.includes("classList.remove('is-quiet-mark-inbound')"),
      `${rel} head script must include watchdog that removes is-quiet-mark-inbound`
    );
    assert.ok(
      /setTimeout\s*\(\s*function\s*\(\s*\)/.test(content),
      `${rel} head script must include setTimeout watchdog for fail-open recovery`
    );
    assert.ok(
      content.includes('4000'),
      `${rel} head script watchdog must use 4000ms timeout`
    );
  }
});

test('Phase 5C.2B.1 Guard: Homepage does NOT add is-quiet-mark-inbound when has-intro is active', () => {
  const indexHtml = fs.readFileSync(path.join(rootDir, 'public', 'index.html'), 'utf8');

  // The head script structure: if (has-intro check) { ... } else if (quiet mark check) { add class }
  // Guard must only be in the else if branch, never in the has-intro branch
  const headScriptMatch = indexHtml.match(/<script>[\s\S]*?<\/script>/);
  assert.ok(headScriptMatch, 'Homepage must have inline head script');

  const headScript = headScriptMatch[0];

  // has-intro branch must NOT contain is-quiet-mark-inbound
  const hasIntroBlockMatch = headScript.match(/classList\.add\('has-intro'\)/);
  assert.ok(hasIntroBlockMatch, 'Homepage head script must add has-intro class');

  // The guard class must appear after "else if" and "quiet_mark_pending"
  const guardIndex = headScript.indexOf("classList.add('is-quiet-mark-inbound')");
  const elseIfIndex = headScript.indexOf('else if');
  const hasIntroIndex = headScript.indexOf("classList.add('has-intro')");

  assert.ok(guardIndex > 0, 'Homepage must contain is-quiet-mark-inbound addition');
  assert.ok(elseIfIndex > 0, 'Homepage must use else if structure');
  assert.ok(
    guardIndex > elseIfIndex,
    'is-quiet-mark-inbound must appear after else if (not in has-intro branch)'
  );
  assert.ok(
    guardIndex > hasIntroIndex,
    'is-quiet-mark-inbound must appear after has-intro addition'
  );
});


test('Phase 5C.2B.3 Guard Sync: Head scripts validate token structure, route, and freshness before activating guard', () => {
  const htmlPages = [
    path.join(rootDir, 'public', 'index.html'),
    path.join(rootDir, 'public', 'work', 'index.html'),
    path.join(rootDir, 'public', 'work', 'project.html'),
    path.join(rootDir, 'public', 'start', 'index.html'),
    path.join(rootDir, 'public', 'privacy', 'index.html')
  ];

  for (const pagePath of htmlPages) {
    const content = fs.readFileSync(pagePath, 'utf8');
    const rel = path.relative(rootDir, pagePath);

    // JSON.parse check
    assert.ok(content.includes('JSON.parse(raw)'), `${rel} head script must parse token via JSON.parse`);

    // Route matching check
    assert.ok(content.includes('targetPath === currentPath'), `${rel} head script must check route matching`);

    // Freshness check (15000ms and nonnegative)
    assert.ok(content.includes('age >= 0 && age <= 15000'), `${rel} head script must validate 0-15s freshness window`);

    // Token-owned watchdog removal
    assert.ok(content.includes('currentRaw === expectedRaw'), `${rel} head script must compare current token to owned token before removal`);
  }
});

test('Phase 5C.2B.3 Guard Sync: quiet-mark.js suppresses late overlay if guard is already dismissed', () => {
  const quietJsPath = path.join(rootDir, 'public', 'js', 'features', 'transitions', 'quiet-mark.js');
  const quietJs = fs.readFileSync(quietJsPath, 'utf8');

  // Must check is-quiet-mark-inbound active state before validating inbound transition
  assert.ok(
    quietJs.includes("classList.contains('is-quiet-mark-inbound')"),
    'quiet-mark.js must verify is-quiet-mark-inbound is active before allowing inbound overlay'
  );

  // Must check finite timestamp and nonnegative age in readPendingTransition
  assert.ok(
    quietJs.includes('isFinite(data.ts)'),
    'quiet-mark.js readPendingTransition must verify finite timestamp'
  );
  assert.ok(
    quietJs.includes('age >= 0 && age <= MAX_TRANSITION_AGE'),
    'quiet-mark.js readPendingTransition must verify nonnegative age within limit'
  );
});




