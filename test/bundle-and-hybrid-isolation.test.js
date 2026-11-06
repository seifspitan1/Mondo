import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as siteModule from '../public/js/site.js';
import {
  DEFAULT_HYBRID_PILOT_ENABLED,
  GATE_1_ACTIVATION_LOCK,
  isAllowedLocalPilotHost,
  isHybridPilotEnabled
} from '../public/js/features/navigation/pilot-gate.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'public', 'dist');

describe('MONDO Phase 5D-C.2A: Global JavaScript Bundle Optimization & Hybrid Runtime Isolation', () => {

  describe('1. Global Import Graph & Manifest Verification', () => {
    it('DEFAULT_HYBRID_PILOT_ENABLED remains strictly false in source code', () => {
      assert.equal(DEFAULT_HYBRID_PILOT_ENABLED, false);
      assert.equal(siteModule.DEFAULT_HYBRID_PILOT_ENABLED, false);
    });

    it('manifest.json reflects optimized site.bundle.js size under 35 KB (reduced from ~135.9 KB)', () => {
      const manifestPath = path.join(distDir, 'manifest.json');
      assert.ok(fs.existsSync(manifestPath), 'manifest.json must exist');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      const siteBundle = manifest.bundles['js/site.js'];
      assert.ok(siteBundle, 'js/site.js must be present in manifest');
      assert.ok(siteBundle.size < 35000, `site.bundle.js (${siteBundle.size} B) must be under 35,000 bytes`);
      assert.ok(siteBundle.size > 20000, `site.bundle.js (${siteBundle.size} B) must contain required shared modules`);
    });

    it('site.bundle.js excludes dormant Hybrid coordinator and lifecycle adapters', () => {
      const siteBundlePath = path.join(distDir, 'js', 'site.bundle.js');
      assert.ok(fs.existsSync(siteBundlePath), 'site.bundle.js must exist');
      const code = fs.readFileSync(siteBundlePath, 'utf8');

      // Hybrid Navigation Coordinator internal markers must NOT be in default bundle
      assert.equal(code.includes('createNavigationCoordinator'), false);
      assert.equal(code.includes('createRouteLifecycleAdapter'), false);
      assert.equal(code.includes('createDomAdapter'), false);
      assert.equal(code.includes('createHistoryManager'), false);
      assert.equal(code.includes('awaitWorkFirstViewReady'), false);
      assert.equal(code.includes('awaitProjectFirstViewReady'), false);
      assert.equal(code.includes('createReadinessCoordinator'), false);
    });

    it('site.bundle.js eliminates duplicated Work and Project page runtimes', () => {
      const siteBundlePath = path.join(distDir, 'js', 'site.bundle.js');
      const code = fs.readFileSync(siteBundlePath, 'utf8');

      // Page controllers must NOT be in the global site bundle
      assert.equal(code.includes('renderWorkGrid'), false);
      assert.equal(code.includes('setupWorkFilters'), false);
      assert.equal(code.includes('formatProjectCount'), false);
      assert.equal(code.includes('renderFilteredProjectsGrid'), false);
      assert.equal(code.includes('areProjectsEquivalent'), false);
      assert.equal(code.includes('getSlugFromPath'), false);
      assert.equal(code.includes('mountProject'), false);
      assert.equal(code.includes('unmountProject'), false);
      assert.equal(code.includes('trackProjectView'), false);
    });

    it('site.js re-exports all required symbols for public consumers and characterization tests', () => {
      assert.equal(typeof siteModule.escapeHtml, 'function');
      assert.equal(typeof siteModule.initNavigation, 'function');
      assert.equal(typeof siteModule.renderProjectCard, 'function');
      assert.equal(typeof siteModule.icons, 'object');
      assert.equal(typeof siteModule.track, 'function');
      assert.equal(typeof siteModule.initQuietMark, 'function');
      assert.equal(typeof siteModule.initOfflinePreparation, 'function');
      assert.equal(typeof siteModule.initHybridNavigationPilot, 'function');
      assert.equal(typeof siteModule.disableHybridNavigationPilot, 'function');
      assert.equal(typeof siteModule.isHybridPilotEnabled, 'function');
    });
  });

  describe('2. Hybrid Runtime Isolation & Pilot Governance', () => {
    it('initHybridNavigationPilot() immediately returns disabled without loading modules in default runtime', () => {
      const result = siteModule.initHybridNavigationPilot();
      assert.equal(result.active, false);
      assert.equal(result.status, 'disabled');
      assert.ok(result.reason === 'feature_flag_disabled' || result.reason === 'non_local_host_prohibited');
    });

    it('prohibits activation on production origins even if ?hybrid=1 query parameter is passed', () => {
      const mockProdWin = {
        location: {
          hostname: 'mondo.creative',
          origin: 'https://mondo.creative',
          search: '?hybrid=1',
          pathname: '/work'
        },
        sessionStorage: {
          getItem: () => null,
          setItem: () => {}
        }
      };

      assert.equal(isAllowedLocalPilotHost(mockProdWin), false);
      assert.equal(isHybridPilotEnabled({ window: mockProdWin }), false);

      const result = siteModule.initHybridNavigationPilot({ window: mockProdWin });
      assert.equal(result.active, false);
      assert.equal(result.status, 'disabled');
      assert.equal(result.reason, 'non_local_host_prohibited');
    });

    it('allows controlled local pilot opt-in on localhost with ?hybrid=1', async () => {
      const mockLocalWin = {
        location: {
          hostname: 'localhost',
          origin: 'http://localhost:3000',
          search: '?hybrid=1',
          pathname: '/work'
        },
        sessionStorage: {
          getItem: () => null,
          setItem: () => {}
        }
      };

      assert.equal(isAllowedLocalPilotHost(mockLocalWin), true);
      assert.equal(isHybridPilotEnabled({ window: mockLocalWin }), true);

      // When enabled on local host, dynamic import loads coordinator-binding
      const pilotPromise = siteModule.initHybridNavigationPilot({
        window: mockLocalWin,
        document: {
          querySelector: () => null,
          addEventListener: () => {},
          removeEventListener: () => {}
        }
      });

      assert.ok(pilotPromise instanceof Promise, 'Must return a Promise for dynamic import when authorized');
      const controller = await pilotPromise;
      assert.ok(controller, 'Dynamic import must resolve');
    });

    it('disableHybridNavigationPilot() cleanly disables and sets kill-switch', () => {
      const mockWin = {
        location: { hostname: 'localhost' },
        __MONDO_HYBRID_PILOT__: {
          disable: (reason) => ({ active: false, status: 'disabled', reason })
        }
      };

      const result = siteModule.disableHybridNavigationPilot({ window: mockWin, reason: 'test_disable' });
      assert.equal(mockWin.__MONDO_HYBRID_NAV_DISABLED__, true);
      assert.equal(result.status, 'disabled');
      assert.equal(result.reason, 'test_disable');
    });
  });

  describe('3. Build Output Integrity & Cache Safety', () => {
    it('dist directory contains exactly 1 CSS canonical + 1 CSS hashed, 7 JS canonical + 7 JS hashed', () => {
      const cssFiles = fs.readdirSync(path.join(distDir, 'css'));
      const jsFiles = fs.readdirSync(path.join(distDir, 'js'));

      assert.equal(cssFiles.length, 2, 'Must have exactly 2 CSS files (canonical + hashed)');
      assert.equal(jsFiles.length, 14, 'Must have exactly 14 JS files (7 canonical + 7 hashed)');

      const expectedCanonicalJs = ['home', 'site', 'intro', 'work', 'project', 'start', 'admin'];
      for (const entry of expectedCanonicalJs) {
        assert.ok(jsFiles.includes(`${entry}.bundle.js`), `${entry}.bundle.js must exist`);
      }
    });

    it('all generated bundles in manifest match their on-disk byte size', () => {
      const manifest = JSON.parse(fs.readFileSync(path.join(distDir, 'manifest.json'), 'utf8'));

      for (const [name, info] of Object.entries(manifest.bundles)) {
        const canonicalOnDisk = path.join(rootDir, 'public', info.canonical.replace(/^\//, ''));
        const hashedOnDisk = path.join(rootDir, 'public', info.hashed.replace(/^\//, ''));

        assert.ok(fs.existsSync(canonicalOnDisk), `${info.canonical} must exist on disk`);
        assert.ok(fs.existsSync(hashedOnDisk), `${info.hashed} must exist on disk`);

        const diskSizeCanonical = fs.statSync(canonicalOnDisk).size;
        const diskSizeHashed = fs.statSync(hashedOnDisk).size;

        assert.equal(diskSizeCanonical, info.size, `${name} canonical size mismatch`);
        assert.equal(diskSizeHashed, info.size, `${name} hashed size mismatch`);
      }
    });
  });
});
