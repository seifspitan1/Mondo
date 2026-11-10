import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderProjectCard } from '../public/js/features/work/card.js';
import { renderFilteredProjectsGrid } from '../public/js/features/work/filter.js';
import { defaultProjects } from '../public/js/shared/defaults.js';
import { DEFAULT_HYBRID_PILOT_ENABLED } from '../public/js/features/navigation/coordinator-binding.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

describe('MONDO Phase 5D-C.2D: Below-the-Fold Lazy Loading & Initial Image Reduction', () => {

  describe('1. Critical Above-the-Fold Image Protection', () => {
    it('Homepage hero contains no project showcase thumbnails or .hero-art stack', () => {
      const homeHtml = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
      const heroMatch = homeHtml.match(/<section class="hero">([\s\S]*?)<\/section>/);
      assert.ok(heroMatch, 'Must find .hero container');
      const heroHtml = heroMatch[1];
      assert.equal(heroHtml.includes('hero-art'), false, 'Hero must not contain .hero-art container');
      assert.equal(heroHtml.includes('hero-frame'), false, 'Hero must not contain .hero-frame elements');
      assert.equal(heroHtml.includes('rainbow-orchard.webp'), false, 'Hero must not contain rainbow-orchard thumbnail');
      assert.equal(heroHtml.includes('cat-battle.webp'), false, 'Hero must not contain cat-battle thumbnail');
      assert.equal(heroHtml.includes('cosmic-egg.webp'), false, 'Hero must not contain cosmic-egg thumbnail');
    });

    it('Project detail hero image (#project-media img) never has loading="lazy"', () => {
      const projectPagePath = path.join(publicDir, 'js', 'features', 'project', 'project-page.js');
      const content = fs.readFileSync(projectPagePath, 'utf8');
      const mediaBlock = content.slice(
        content.indexOf('// 2. Large Media Section'),
        content.indexOf('// 3. Project Story & Facts')
      );
      assert.equal(
        mediaBlock.includes('loading="lazy"'),
        false,
        'Project hero media template must never include loading="lazy"'
      );
      assert.ok(
        mediaBlock.includes('fetchpriority="high"'),
        'Project hero media template must retain fetchpriority="high"'
      );
    });

    it('Main header brand mark in all public entrypoints is not lazily loaded', () => {
      const entrypoints = [
        'index.html',
        'work/index.html',
        'work/project.html',
        'start/index.html',
        'privacy/index.html'
      ];
      for (const entry of entrypoints) {
        const html = fs.readFileSync(path.join(publicDir, entry), 'utf8');
        const headerMatch = html.match(/<header[^>]*>([\s\S]*?)<\/header>/);
        assert.ok(headerMatch, `Header must exist in ${entry}`);
        const brandMarkMatch = headerMatch[1].match(/<img[^>]+class="[^"]*brand-mark[^"]*"[^>]*>/);
        assert.ok(brandMarkMatch, `Header brand-mark must exist in ${entry}`);
        assert.equal(
          brandMarkMatch[0].includes('loading="lazy"'),
          false,
          `Header brand-mark in ${entry} must not have loading="lazy"`
        );
      }
    });
  });

  describe('2. Below-the-Fold Lazy Loading Application', () => {
    it('Homepage #selected-work-grid cards declare loading="lazy"', () => {
      const homeHtml = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
      const gridMatch = homeHtml.match(/<div class="work-grid" id="selected-work-grid">([\s\S]*?)<\/div>\s*<\/section>/);
      assert.ok(gridMatch, 'Must find #selected-work-grid');
      const cardImgs = gridMatch[1].match(/<img[^>]+>/g) || [];
      assert.equal(cardImgs.length, 3, 'Must have 3 cards in #selected-work-grid');
      for (const tag of cardImgs) {
        assert.ok(tag.includes('loading="lazy"'), `Card in #selected-work-grid must be loading="lazy": ${tag}`);
      }
    });

    it('Work listing page declares Row 1 eager and Row 2 lazy', () => {
      const workHtml = fs.readFileSync(path.join(publicDir, 'work', 'index.html'), 'utf8');
      const gridMatch = workHtml.match(/<div class="work-grid" id="work-grid">([\s\S]*?)<\/div>\s*<\/section>/);
      assert.ok(gridMatch, 'Must find #work-grid');
      const cardImgs = gridMatch[1].match(/<img[^>]+>/g) || [];
      assert.equal(cardImgs.length, 5, 'Must have 5 cards in #work-grid');

      // Row 1 (cards 0, 1, 2)
      for (let i = 0; i < 3; i++) {
        assert.ok(cardImgs[i].includes('loading="eager"'), `Row 1 card ${i} must be loading="eager"`);
      }
      // Row 2 (cards 3, 4)
      for (let i = 3; i < 5; i++) {
        assert.ok(cardImgs[i].includes('loading="lazy"'), `Row 2 card ${i} must be loading="lazy"`);
      }
    });

    it('Project detail #explore-grid renders related cards with loading="lazy"', () => {
      const projectPagePath = path.join(publicDir, 'js', 'features', 'project', 'project-page.js');
      const content = fs.readFileSync(projectPagePath, 'utf8');
      const exploreBlock = content.slice(content.indexOf('// 4. Keep Exploring Section'));
      assert.ok(
        exploreBlock.includes('eager: false'),
        'project-page.js must pass { eager: false } when rendering #explore-grid cards'
      );
    });

    it('CTA decorative artwork across entrypoints declares loading="lazy"', () => {
      const entrypoints = ['index.html', 'work/index.html', 'work/project.html'];
      for (const entry of entrypoints) {
        const html = fs.readFileSync(path.join(publicDir, entry), 'utf8');
        const ctaMatch = html.match(/<div class="cta-art"[^>]*>([\s\S]*?)<\/div>/);
        if (ctaMatch) {
          const imgMatch = ctaMatch[1].match(/<img[^>]+>/);
          assert.ok(imgMatch, `Must find img in .cta-art of ${entry}`);
          assert.ok(imgMatch[0].includes('loading="lazy"'), `.cta-art img in ${entry} must be loading="lazy"`);
        }
      }
    });

    it('Footer background logo across all entrypoints declares loading="lazy"', () => {
      const entrypoints = [
        'index.html',
        'work/index.html',
        'work/project.html',
        'start/index.html',
        'privacy/index.html'
      ];
      for (const entry of entrypoints) {
        const html = fs.readFileSync(path.join(publicDir, entry), 'utf8');
        const footerMarkMatch = html.match(/<img[^>]+class="[^"]*footer-bg-logo[^"]*"[^>]*>/);
        assert.ok(footerMarkMatch, `footer-bg-logo must exist in ${entry}`);
        assert.ok(
          footerMarkMatch[0].includes('loading="lazy"'),
          `footer-bg-logo in ${entry} must declare loading="lazy"`
        );
      }
    });
  });

  describe('3. Dynamic Card Rendering API Flexibility', () => {
    it('renderProjectCard respects explicit { eager: false }', () => {
      const p = defaultProjects[0];
      const html = renderProjectCard(p, 0, { eager: false });
      assert.ok(html.includes('loading="lazy"'), 'Must render loading="lazy" when eager: false');
    });

    it('renderProjectCard respects explicit { eager: true } even for high index', () => {
      const p = defaultProjects[0];
      const html = renderProjectCard(p, 4, { eager: true });
      assert.ok(html.includes('loading="eager"'), 'Must render loading="eager" when eager: true');
    });

    it('renderProjectCard defaults to index < 3 when options omitted', () => {
      const p = defaultProjects[0];
      const html0 = renderProjectCard(p, 0);
      assert.ok(html0.includes('loading="eager"'), 'Index 0 default must be eager');

      const html3 = renderProjectCard(p, 3);
      assert.ok(html3.includes('loading="lazy"'), 'Index 3 default must be lazy');
    });

    it('renderFilteredProjectsGrid enforces loading="lazy" on #selected-work-grid', () => {
      const mockGrid = { id: 'selected-work-grid', innerHTML: '' };
      renderFilteredProjectsGrid(mockGrid, defaultProjects, 'All', 3);
      assert.ok(mockGrid.innerHTML.includes('loading="lazy"'), 'Grid must contain lazy cards');
      assert.equal(mockGrid.innerHTML.includes('loading="eager"'), false, 'Grid must not contain eager cards');
    });
  });

  describe('4. Architecture & Navigation Safety Invariants', () => {
    it('DEFAULT_HYBRID_PILOT_ENABLED strictly false', () => {
      assert.equal(DEFAULT_HYBRID_PILOT_ENABLED, false);
    });
  });

});

