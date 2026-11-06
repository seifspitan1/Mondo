import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderProjectCard, LOCAL_PROJECTS } from '../public/js/features/work/card.js';
import { defaultProjects } from '../public/js/shared/defaults.js';
import { waitForImageDecode } from '../public/js/shared/readiness.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const assetsDir = path.join(publicDir, 'assets');

// Helper to parse image dimensions from WebP RIFF
function getWebpDimensions(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') {
    return null;
  }
  const chunkType = buffer.toString('ascii', 12, 16);
  if (chunkType === 'VP8 ') {
    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    return { width, height };
  } else if (chunkType === 'VP8L') {
    const b0 = buffer[21];
    const b1 = buffer[22];
    const b2 = buffer[23];
    const b3 = buffer[24];
    const width = 1 + (((b1 & 0x3f) << 8) | b0);
    const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
    return { width, height };
  }
  return null;
}

describe('MONDO Phase 5D-C.2C: Image Optimization & Viewport Delivery', () => {

  describe('1. Responsive Derivative Integrity on Disk', () => {
    const EXPECTED_DERIVATIVES = [
      { base: 'rainbow-orchard', expectedWidth: 800, expectedHeight: 450 },
      { base: 'cat-battle', expectedWidth: 800, expectedHeight: 450 },
      { base: 'cosmic-egg', expectedWidth: 800, expectedHeight: 450 },
      { base: 'dragon-escape', expectedWidth: 800, expectedHeight: 483 },
      { base: 'orchard-upgrade', expectedWidth: 800, expectedHeight: 450 }
    ];

    it('all 5 responsive -small.webp derivative files exist in public/assets', () => {
      for (const item of EXPECTED_DERIVATIVES) {
        const fullPath = path.join(assetsDir, `${item.base}-small.webp`);
        assert.ok(fs.existsSync(fullPath), `${item.base}-small.webp must exist on disk`);
      }
    });

    it('all responsive derivatives match targeted 800px width and correct aspect ratio', () => {
      for (const item of EXPECTED_DERIVATIVES) {
        const fullPath = path.join(assetsDir, `${item.base}-small.webp`);
        const buf = fs.readFileSync(fullPath);
        const dims = getWebpDimensions(buf);
        assert.ok(dims, `Could not parse WebP dimensions for ${item.base}-small.webp`);
        assert.equal(dims.width, item.expectedWidth, `${item.base}-small.webp width must match ${item.expectedWidth}`);
        assert.equal(dims.height, item.expectedHeight, `${item.base}-small.webp height must match ${item.expectedHeight}`);
      }
    });

    it('each -small.webp variant provides >60% byte size reduction compared to 1600w original', () => {
      for (const item of EXPECTED_DERIVATIVES) {
        const origPath = path.join(assetsDir, `${item.base}.webp`);
        const smallPath = path.join(assetsDir, `${item.base}-small.webp`);
        const origSize = fs.statSync(origPath).size;
        const smallSize = fs.statSync(smallPath).size;
        const savingsPct = ((origSize - smallSize) / origSize) * 100;
        assert.ok(savingsPct > 60, `${item.base}-small.webp must provide >60% savings (was ${savingsPct.toFixed(1)}%)`);
      }
    });
  });

  describe('2. Project Detail Hero Responsive Rendering', () => {
    it('LOCAL_PROJECTS list is exported from card.js and contains all 5 default project assets', () => {
      assert.ok(Array.isArray(LOCAL_PROJECTS), 'LOCAL_PROJECTS must be an array');
      assert.equal(LOCAL_PROJECTS.length, 5, 'Must contain 5 local project asset basenames');
      assert.ok(LOCAL_PROJECTS.includes('rainbow-orchard'));
      assert.ok(LOCAL_PROJECTS.includes('cat-battle'));
      assert.ok(LOCAL_PROJECTS.includes('cosmic-egg'));
      assert.ok(LOCAL_PROJECTS.includes('dragon-escape'));
      assert.ok(LOCAL_PROJECTS.includes('orchard-upgrade'));
    });

    it('project-page.js source includes responsive srcset and sizes for local project hero images', () => {
      const projectPagePath = path.join(publicDir, 'js', 'features', 'project', 'project-page.js');
      const content = fs.readFileSync(projectPagePath, 'utf8');

      // Check for srcset generation
      assert.ok(content.includes('LOCAL_PROJECTS.some'), 'Must check LOCAL_PROJECTS in project-page.js');
      assert.ok(content.includes('-small.webp'), 'Must reference -small.webp in project-page.js');
      assert.ok(content.includes('800w'), 'Must declare 800w descriptor in project-page.js');
      assert.ok(content.includes('1600w'), 'Must declare 1600w descriptor in project-page.js');
      assert.ok(content.includes('(max-width: 800px) 100vw, 1600px'), 'Must declare sizes attribute');
      assert.ok(content.includes('decoding="async"'), 'Must include decoding="async"');
      assert.ok(content.includes('fetchpriority="high"'), 'Must preserve fetchpriority="high" on critical hero');
    });

    it('project.bundle.js contains compiled responsive srcset logic', () => {
      const bundlePath = path.join(publicDir, 'dist', 'js', 'project.bundle.js');
      assert.ok(fs.existsSync(bundlePath), 'project.bundle.js must exist');
      const bundleContent = fs.readFileSync(bundlePath, 'utf8');
      assert.ok(bundleContent.includes('-small.webp'), 'project.bundle.js must contain -small.webp');
      assert.ok(bundleContent.includes('800w'), 'project.bundle.js must contain 800w descriptor');
      assert.ok(bundleContent.includes('1600w'), 'project.bundle.js must contain 1600w descriptor');
    });
  });

  describe('3. Critical Hero Priority & Anti-Pattern Prevention', () => {
    it('hero image does NOT have loading="lazy"', () => {
      const projectPagePath = path.join(publicDir, 'js', 'features', 'project', 'project-page.js');
      const content = fs.readFileSync(projectPagePath, 'utf8');
      // Look at the mediaEl rendering block
      const mediaBlock = content.slice(content.indexOf('// 2. Large Media Section'), content.indexOf('// 3. Project Story & Facts'));
      assert.equal(
        mediaBlock.includes('loading="lazy"'),
        false,
        'Critical project hero image must NEVER have loading="lazy"'
      );
    });

    it('all static project cards in public/work/index.html have valid srcset and dimensions', () => {
      const workHtml = fs.readFileSync(path.join(publicDir, 'work', 'index.html'), 'utf8');
      const matches = [...workHtml.matchAll(/<img[^>]+class="[^"]*project-cover[^"]*"|class="project-cover"[^>]*>[\s\S]*?<img([^>]+)>/g)];
      assert.ok(matches.length >= 5, 'Must contain at least 5 project card images');
      for (const m of matches) {
        const imgTag = m[0];
        assert.ok(imgTag.includes('srcset='), 'Card image must have srcset');
        assert.ok(imgTag.includes('sizes='), 'Card image must have sizes');
        assert.ok(imgTag.includes('width="1600"'), 'Card image must declare width 1600');
        assert.ok(imgTag.includes('height="900"'), 'Card image must declare height 900');
        assert.ok(imgTag.includes('decoding="async"'), 'Card image must have decoding="async"');
      }
    });

    it('renderProjectCard generator applies responsive srcset and dimensions', () => {
      const project = defaultProjects[0];
      const html = renderProjectCard(project, 0);
      assert.ok(html.includes('srcset="/assets/rainbow-orchard-small.webp 800w, /assets/rainbow-orchard.webp 1600w"'));
      assert.ok(html.includes('sizes="(max-width: 650px) 100vw, (max-width: 950px) 50vw, 33vw"'));
      assert.ok(html.includes('width="1600" height="900"'));
      assert.ok(html.includes('decoding="async"'));
      assert.ok(html.includes('loading="eager"'), 'First card must be eager');

      const lazyHtml = renderProjectCard(project, 4);
      assert.ok(lazyHtml.includes('loading="lazy"'), '5th card must be lazy');
    });
  });

  describe('4. Readiness Coordinator Compatibility with Responsive Images', () => {
    it('waitForImageDecode correctly resolves when given an element with srcset', async () => {
      const mockImg = {
        complete: true,
        naturalWidth: 800,
        naturalHeight: 450,
        currentSrc: '/assets/rainbow-orchard-small.webp',
        src: '/assets/rainbow-orchard.webp',
        srcset: '/assets/rainbow-orchard-small.webp 800w, /assets/rainbow-orchard.webp 1600w',
        decode: async () => {}
      };

      const result = await waitForImageDecode(mockImg, 1000);
      assert.equal(result.status, 'decoded', 'waitForImageDecode must resolve with status decoded');
    });
  });

  describe('5. HTML Entrypoint Image Intrinsic Dimensions & Decoding', () => {
    const entrypoints = [
      'index.html',
      'work/index.html',
      'work/project.html',
      'start/index.html',
      'privacy/index.html'
    ];

    it('all public HTML entrypoint images declare explicit width and height', () => {
      for (const file of entrypoints) {
        const filePath = path.join(publicDir, file);
        const html = fs.readFileSync(filePath, 'utf8');
        const imgTags = html.match(/<img[^>]+>/g) || [];
        for (const tag of imgTags) {
          assert.ok(
            tag.includes('width=') && tag.includes('height='),
            `Image in ${file} must declare width and height: ${tag}`
          );
        }
      }
    });

    it('footer background mark declares decoding="async" across public HTML entrypoints', () => {
      for (const file of entrypoints) {
        const filePath = path.join(publicDir, file);
        const html = fs.readFileSync(filePath, 'utf8');
        const footerMarkMatch = html.match(/<img[^>]+class="[^"]*footer-bg-logo[^"]*"[^>]*>/);
        if (footerMarkMatch) {
          assert.ok(
            footerMarkMatch[0].includes('decoding="async"'),
            `footer-bg-logo in ${file} must have decoding="async"`
          );
        }
      }
    });
  });

});

