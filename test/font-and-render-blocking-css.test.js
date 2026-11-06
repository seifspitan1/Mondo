import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const distDir = path.join(publicDir, 'dist');

const EXPECTED_FONT_URL = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Orbitron:wght@700;800;900&display=swap';

const HTML_ENTRYPOINTS = [
  'index.html',
  'work/index.html',
  'work/project.html',
  'start/index.html',
  'privacy/index.html',
  'admin/index.html'
];

describe('MONDO Phase 5D-C.2B & C.2F: Font Loading & Render-Blocking CSS Optimization', () => {

  describe('1. Elimination of Render-Blocking CSS @import', () => {
    it('public/css/style.css does NOT contain external @import for Google Fonts', () => {
      const stylePath = path.join(publicDir, 'css', 'style.css');
      assert.ok(fs.existsSync(stylePath), 'style.css must exist');
      const content = fs.readFileSync(stylePath, 'utf8');

      assert.equal(
        content.includes('fonts.googleapis.com'),
        false,
        'style.css must not contain fonts.googleapis.com @import'
      );
      assert.equal(
        content.includes('@import url('),
        false,
        'style.css must not contain @import url(...) for external resources'
      );
    });

    it('public/dist/css/style.bundle.css does NOT contain external @import', () => {
      const bundlePath = path.join(distDir, 'css', 'style.bundle.css');
      assert.ok(fs.existsSync(bundlePath), 'style.bundle.css must exist');
      const content = fs.readFileSync(bundlePath, 'utf8');

      assert.equal(
        content.includes('fonts.googleapis.com'),
        false,
        'style.bundle.css must not contain fonts.googleapis.com @import'
      );
      assert.equal(
        content.startsWith('@import url('),
        false,
        'style.bundle.css must not start with external @import url rule'
      );
    });
  });

  describe('2. Elimination of External Google Fonts & Local Self-Hosted Font Delivery', () => {
    it('local WOFF2 font files exist on disk and have valid binary size', () => {
      const fonts = [
        'fonts/inter-latin.woff2',
        'fonts/inter-latin-ext.woff2',
        'fonts/orbitron-latin.woff2',
        'fonts/OFL.txt'
      ];
      for (const rel of fonts) {
        const fullPath = path.join(publicDir, rel);
        assert.ok(fs.existsSync(fullPath), `${rel} must exist on disk`);
        const stats = fs.statSync(fullPath);
        assert.ok(stats.size > 0, `${rel} must not be empty`);
      }
    });

    it('public/css/tokens/fonts.css defines self-hosted @font-face rules with font-display: swap', () => {
      const fontsCssPath = path.join(publicDir, 'css', 'tokens', 'fonts.css');
      assert.ok(fs.existsSync(fontsCssPath), 'fonts.css must exist');
      const content = fs.readFileSync(fontsCssPath, 'utf8');

      assert.ok(content.includes("font-family: 'Inter'"), "fonts.css must define Inter");
      assert.ok(content.includes("font-family: 'Orbitron'"), "fonts.css must define Orbitron");
      assert.ok(content.includes("font-display: swap"), "fonts.css must use font-display: swap");
      assert.ok(content.includes("/fonts/inter-latin.woff2"), "fonts.css must reference local inter-latin.woff2");
      assert.ok(content.includes("/fonts/orbitron-latin.woff2"), "fonts.css must reference local orbitron-latin.woff2");
    });

    for (const file of HTML_ENTRYPOINTS) {
      it(`${file} has zero external Google Fonts links and preloads local WOFF2 fonts in head`, () => {
        const filePath = path.join(publicDir, file);
        assert.ok(fs.existsSync(filePath), `${file} must exist`);
        const html = fs.readFileSync(filePath, 'utf8');

        // Confirm zero external Google Fonts references
        assert.equal(
          html.includes('fonts.googleapis.com'),
          false,
          `${file} must NOT contain fonts.googleapis.com`
        );
        assert.equal(
          html.includes('fonts.gstatic.com'),
          false,
          `${file} must NOT contain fonts.gstatic.com`
        );

        // Verify local font preload tags
        assert.ok(
          html.includes('rel="preload" as="font" type="font/woff2" href="/fonts/inter-latin.woff2" crossorigin'),
          `${file} must preload /fonts/inter-latin.woff2 with crossorigin`
        );
        assert.ok(
          html.includes('rel="preload" as="font" type="font/woff2" href="/fonts/orbitron-latin.woff2" crossorigin'),
          `${file} must preload /fonts/orbitron-latin.woff2 with crossorigin`
        );

        // Verify preloads are in <head>
        const headMatch = html.match(/<head>([\s\S]*?)<\/head>/i);
        assert.ok(headMatch, `${file} must contain <head>`);
        assert.ok(
          headMatch[1].includes('/fonts/inter-latin.woff2'),
          `${file} Inter preload must be inside <head>`
        );
        assert.ok(
          headMatch[1].includes('/fonts/orbitron-latin.woff2'),
          `${file} Orbitron preload must be inside <head>`
        );
      });
    }
  });

  describe('3. Elimination of Redundant Stylesheet Fetch in Project Page', () => {
    it('public/work/project.html does NOT execute window.fetch for /css/style.css', () => {
      const projectPath = path.join(publicDir, 'work', 'project.html');
      const html = fs.readFileSync(projectPath, 'utf8');

      // The redundant fetch block must be eliminated
      assert.equal(
        html.includes("window.fetch('/css/style.css'"),
        false,
        'project.html must NOT fetch /css/style.css via JavaScript'
      );
      assert.equal(
        html.includes('id="mondo-local-css-fallback"'),
        false,
        'project.html must NOT inject mondo-local-css-fallback style element'
      );
      assert.equal(
        html.includes('id="mondo-async-fonts"'),
        false,
        'project.html must NOT inject mondo-async-fonts link element'
      );
    });

    it('public/work/project.html preserves critical CSS, FOUC guard, and main stylesheet onload contract', () => {
      const projectPath = path.join(publicDir, 'work', 'project.html');
      const html = fs.readFileSync(projectPath, 'utf8');

      // Critical CSS and FOUC guards must remain intact
      assert.ok(html.includes('id="mondo-pilot-critical-css"'), 'Must preserve #mondo-pilot-critical-css');
      assert.ok(html.includes('html.is-project-css-pending'), 'Must preserve html.is-project-css-pending in critical CSS');
      assert.ok(html.includes('window.__MONDO_MARK_CSS_READY__'), 'Must preserve __MONDO_MARK_CSS_READY__ function');
      assert.ok(html.includes('id="mondo-main-stylesheet"'), 'Must preserve #mondo-main-stylesheet link');
      assert.ok(html.includes('onload="this.media=\'all\';'), 'Must preserve stylesheet onload activation');
    });
  });

  describe('4. Typography Tokens and Visual Rules Integrity', () => {
    it('CSS tokens define Orbitron as display font and Inter as body font', () => {
      const tokensPath = path.join(publicDir, 'css', 'tokens', 'typography.css');
      const tokens = fs.readFileSync(tokensPath, 'utf8');

      assert.ok(tokens.includes("--font-display: 'Orbitron'"), 'Must define Orbitron as --font-display');
      assert.ok(tokens.includes("--font-body: 'Inter'"), 'Must define Inter as --font-body');
    });

    it('base typography assigns font families and weights matching design system', () => {
      const baseTypoPath = path.join(publicDir, 'css', 'base', 'typography.css');
      const baseTypo = fs.readFileSync(baseTypoPath, 'utf8');

      assert.ok(baseTypo.includes('font-family: var(--font-body);'), 'Headings default to body font');
      assert.ok(baseTypo.includes('font-family: var(--font-display);'), 'Display headings use --font-display');
      assert.ok(baseTypo.includes('font-weight: 900;'), 'Display headings use weight 900');
    });
  });

  describe('5. Production Build & Distribution Integrity', () => {
    it('dist directory contains exactly 1 CSS canonical + 1 CSS hashed, 7 JS canonical + 7 JS hashed', () => {
      const cssFiles = fs.readdirSync(path.join(distDir, 'css'));
      const jsFiles = fs.readdirSync(path.join(distDir, 'js'));

      assert.equal(cssFiles.length, 2, 'Must have exactly 2 CSS files (canonical + hashed)');
      assert.equal(jsFiles.length, 14, 'Must have exactly 14 JS files (7 canonical + 7 hashed)');
    });

    it('manifest.json reflects valid style.bundle.css matching on-disk size', () => {
      const manifestPath = path.join(distDir, 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      const cssEntry = manifest.bundles['css/style.css'];
      assert.ok(cssEntry, 'manifest must map css/style.css');

      const canonicalPath = path.join(publicDir, cssEntry.canonical.replace(/^\//, ''));
      const hashedPath = path.join(publicDir, cssEntry.hashed.replace(/^\//, ''));

      assert.ok(fs.existsSync(canonicalPath), 'Canonical CSS must exist');
      assert.ok(fs.existsSync(hashedPath), 'Hashed CSS must exist');

      const canonicalSize = fs.statSync(canonicalPath).size;
      const hashedSize = fs.statSync(hashedPath).size;

      assert.equal(canonicalSize, cssEntry.size, 'Canonical size mismatch');
      assert.equal(hashedSize, cssEntry.size, 'Hashed size mismatch');
    });
  });
});

