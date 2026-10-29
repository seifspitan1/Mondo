import { test } from 'node:test';
import assert from 'node:assert/strict';

// Canonical backend defaults vs browser-safe client defaults
import { defaultProjects as serverProjects, defaultSettings as serverSettings } from '../lib/defaults.js';
import { defaultProjects as clientProjects, defaultSettings as clientSettings } from '../public/js/shared/defaults.js';

// Shared utilities
import { escapeHtml } from '../public/js/shared/dom.js';
import { icons } from '../public/js/shared/icons.js';
import { mondoMark, sectionSignature } from '../public/js/shared/brand.js';

// Feature modules
import { renderProjectCard } from '../public/js/features/work/card.js';
import { filterProjects, renderWorkEmptyState } from '../public/js/features/work/filter.js';
import { formatProjectCount } from '../public/js/features/work/work-page.js';
import { renderPackageCard, renderPackagesHtml } from '../public/js/features/packages/package-toggle.js';
import { getSlugFromPath } from '../public/js/features/project/project-page.js';
import {
  validateEnquiryPayload,
  isHoneypotTriggered,
  buildEnquiryPayload
} from '../public/js/features/enquiry/validation.js';
import { renderSuccessMarkup } from '../public/js/features/enquiry/enquiry-form.js';

// Re-exported root modules (backward compatibility check)
import * as siteEntry from '../public/js/site.js';
import * as iconsEntry from '../public/js/icons.js';
import * as brandEntry from '../public/js/brand.js';
import * as apiEntry from '../public/js/api.js';
import * as homeEntry from '../public/js/home.js';
import * as workEntry from '../public/js/work.js';
import * as projectEntry from '../public/js/project.js';
import * as startEntry from '../public/js/start.js';
import * as introEntry from '../public/js/intro.js';

// =============================================================================
// 1. DATA SYNCHRONIZATION & PARITY INTEGRITY
// =============================================================================

test('browser client defaults maintain 100% parity with canonical lib/defaults.js', () => {
  // Verifies that public/js/shared/defaults.js and lib/defaults.js never drift
  assert.equal(clientProjects.length, serverProjects.length, 'Project counts must match');
  assert.deepEqual(clientProjects, serverProjects, 'Project items must be structurally identical');

  assert.equal(clientSettings.packages.length, serverSettings.packages.length);
  assert.deepEqual(clientSettings.packages, serverSettings.packages, 'Packages must be identical');
  assert.deepEqual(clientSettings.services, serverSettings.services, 'Services must be identical');
  assert.deepEqual(clientSettings.faqs, serverSettings.faqs, 'FAQs must be identical');
  assert.equal(clientSettings.tagline, serverSettings.tagline);
});

// =============================================================================
// 2. ROOT BACKWARD COMPATIBILITY ENTRY POINTS
// =============================================================================

test('root entry points re-export all legacy symbols required by admin and consumers', () => {
  assert.equal(typeof siteEntry.escapeHtml, 'function');
  assert.equal(typeof siteEntry.renderProjectCard, 'function');
  assert.equal(typeof siteEntry.initNavigation, 'function');

  assert.equal(typeof iconsEntry.icons, 'object');
  assert.equal(typeof iconsEntry.icons.arrowUpRight, 'function');
  assert.equal(typeof iconsEntry.icons.spinner, 'function');

  assert.equal(typeof brandEntry.mondoMark, 'function');
  assert.equal(typeof brandEntry.sectionSignature, 'function');

  assert.equal(typeof apiEntry.loadPublicContent, 'function');
  assert.equal(typeof apiEntry.submitEnquiry, 'function');
  assert.equal(typeof apiEntry.track, 'function');
  assert.equal(typeof apiEntry.checkSession, 'function');

  assert.equal(typeof homeEntry.initHome, 'function');
  assert.equal(typeof workEntry.initWorkPage, 'function');
  assert.equal(typeof projectEntry.initProjectPage, 'function');
  assert.equal(typeof startEntry.initEnquiryPage, 'function');
  assert.equal(typeof introEntry.initIntro, 'function');
});

// =============================================================================
// 3. SHARED DOM UTILITIES & ICONS
// =============================================================================

test('escapeHtml handles all dangerous characters and edge cases cleanly', () => {
  assert.equal(escapeHtml('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  assert.equal(escapeHtml(`' or 1=1;--`), '&#039; or 1=1;--');
  assert.equal(escapeHtml('&amp; & < >'), '&amp;amp; &amp; &lt; &gt;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
  assert.equal(escapeHtml(''), '');
  assert.equal(escapeHtml(0), '0');
  assert.equal(escapeHtml(false), 'false');
});

test('icons object produces valid well-formed SVGs with correct dimensions and class attributes', () => {
  const iconNames = [
    'arrowUpRight', 'arrowDownRight', 'arrowLeft', 'menu', 'close',
    'check', 'play', 'image', 'clapperboard', 'chart', 'plus',
    'mail', 'folderOpen', 'inbox', 'layers', 'settings', 'trash',
    'chevronDown', 'upload', 'save', 'spinner'
  ];

  for (const name of iconNames) {
    assert.equal(typeof icons[name], 'function', `Icon ${name} should be a function`);
    const svg = icons[name](24, 'custom-test-cls');
    assert.match(svg, /^<svg/);
    assert.match(svg, /<\/svg>$/);
    assert.match(svg, /width="24"/);
    assert.match(svg, /custom-test-cls/);
  }
});

test('brand module produces authentic mark markup with expected classes and ARIA attributes', () => {
  const mark = mondoMark('compact');
  assert.match(mark, /class="mondo-mark mondo-mark--compact"/);
  assert.match(mark, /aria-hidden="true"/);
  assert.match(mark, /src="\/assets\/mondo-mark\.webp"/);

  const sig = sectionSignature();
  assert.match(sig, /class="section-signature"/);
  assert.match(sig, /mondo-mark--signature/);

  const persistent = mondoMark('persistent', { decorative: false });
  assert.match(persistent, /alt="MONDO"/);
});

// =============================================================================
// 4. WORK PORTFOLIO & CARD GENERATION
// =============================================================================

test('renderProjectCard generates eager/lazy loading, concept tags, and video badges', () => {
  const p1 = clientProjects[0]; // rainbow-orchard, concept, no video
  const card1 = renderProjectCard(p1, 0);
  assert.match(card1, /href="\/work\/rainbow-orchard"/);
  assert.match(card1, /loading="eager"/);
  assert.match(card1, /class="concept-label"/);
  assert.match(card1, /Game thumbnail/);
  assert.match(card1, /srcset="\/assets\/rainbow-orchard-small\.webp 800w, \/assets\/rainbow-orchard\.webp 1600w"/);

  // 4th card should be lazy
  const card4 = renderProjectCard(p1, 3);
  assert.match(card4, /loading="lazy"/);

  // Video card badge test
  const videoProject = {
    id: 'test-video',
    slug: 'trailer-project',
    title: 'Trailer Project',
    category: 'Trailers',
    image: 'https://example.com/cover.webp',
    video: 'https://example.com/trailer.mp4',
    concept: false
  };
  const videoCard = renderProjectCard(videoProject, 0);
  assert.match(videoCard, /class="video-label"/);
  assert.match(videoCard, /Watch trailer/);
  assert.match(videoCard, /Game trailer/);
  assert.doesNotMatch(videoCard, /class="concept-label"/);
});

test('filterProjects correctly filters by category and enforces slice limits', () => {
  const all = filterProjects(clientProjects, 'All');
  assert.equal(all.length, 5);

  const thumbnailsOnly = filterProjects(clientProjects, 'Thumbnails');
  assert.equal(thumbnailsOnly.length, 5);

  const trailersOnly = filterProjects(clientProjects, 'Trailers');
  assert.equal(trailersOnly.length, 0);

  const limited = filterProjects(clientProjects, 'All', 3);
  assert.equal(limited.length, 3);
  assert.equal(limited[0].slug, clientProjects[0].slug);

  const empty = filterProjects(null, 'All');
  assert.deepEqual(empty, []);
});

test('renderWorkEmptyState generates contextual copy for trailers vs generic', () => {
  const trailerEmpty = renderWorkEmptyState('Trailers');
  assert.match(trailerEmpty, /Something worth pressing play on\./);
  assert.match(trailerEmpty, /Trailer projects will appear here/);
  assert.match(trailerEmpty, /service=Game%20Trailers/);

  const genericEmpty = renderWorkEmptyState('Campaigns');
  assert.match(genericEmpty, /The next creative chapter\./);
  assert.match(genericEmpty, /New creative projects will appear here/);
});

test('formatProjectCount formats numbers with two-digit zero padding', () => {
  assert.equal(formatProjectCount(5), '05 creative projects');
  assert.equal(formatProjectCount(12), '12 creative projects');
  assert.equal(formatProjectCount(0), '00 creative projects');
  assert.equal(formatProjectCount(null), '00 creative projects');
});

// =============================================================================
// 5. PACKAGES & PRICING
// =============================================================================

test('renderPackageCard renders highlighted badges, custom query parameters, and cadence', () => {
  const launchPack = clientSettings.packages.find((p) => p.id === 'launch');
  assert.ok(launchPack);

  const html = renderPackageCard(launchPack, 1, false);
  assert.match(html, /class="package-card highlighted"/);
  assert.match(html, /02 \/ PROJECT/);
  assert.match(html, /READY TO LAUNCH/);
  assert.match(html, /service=Launch%20Pack/);
  assert.match(html, /package=MONDO%20LAUNCH/);
  assert.match(html, /Let’s talk LAUNCH/);

  const monthlyPack = clientSettings.packages.find((p) => p.id === 'loop');
  assert.ok(monthlyPack);
  const monthlyHtml = renderPackageCard(monthlyPack, 0, true);
  assert.match(monthlyHtml, /01 \/ ONGOING/);
  assert.match(monthlyHtml, /service=Monthly%20Creatives/);
});

test('renderPackagesHtml correctly filters monthly vs one-off packages', () => {
  const oneOffHtml = renderPackagesHtml(clientSettings.packages, false);
  assert.match(oneOffHtml, /MONDO LAB/);
  assert.match(oneOffHtml, /MONDO LAUNCH/);
  assert.match(oneOffHtml, /YOUR NEXT MOVE/);
  assert.doesNotMatch(oneOffHtml, /MONDO LOOP/);

  const monthlyHtml = renderPackagesHtml(clientSettings.packages, true);
  assert.match(monthlyHtml, /MONDO LOOP/);
  assert.match(monthlyHtml, /MONDO PLUS/);
  assert.match(monthlyHtml, /MONDO STUDIO/);
  assert.doesNotMatch(monthlyHtml, /MONDO LAB/);
});

// =============================================================================
// 6. PROJECT DETAIL SLUG RESOLUTION
// =============================================================================

test('getSlugFromPath extracts slug from URL pathname or query parameters', () => {
  assert.equal(getSlugFromPath('/work/rainbow-orchard', ''), 'rainbow-orchard');
  assert.equal(getSlugFromPath('/work/cat-battle/', ''), 'cat-battle');
  assert.equal(getSlugFromPath('/work', '?slug=cosmic-egg'), 'cosmic-egg');
  assert.equal(getSlugFromPath('/', '?slug=dragon-escape'), 'dragon-escape');
  assert.equal(getSlugFromPath('/work/project.html', '?slug=legendary-orchard'), 'legendary-orchard');
  assert.equal(getSlugFromPath('', ''), '');
});

// =============================================================================
// 7. ENQUIRY VALIDATION & IDEMPOTENCY
// =============================================================================

test('validateEnquiryPayload enforces consent, minimum name, email with @, and minimum goal length', () => {
  const valid = {
    name: 'Mondo Team',
    email: 'hello@mondo.test',
    goal: 'We need an exciting new launch trailer for our upcoming game release.',
    consent: true
  };
  assert.deepEqual(validateEnquiryPayload(valid), { valid: true });

  // Missing consent
  assert.deepEqual(validateEnquiryPayload({ ...valid, consent: false }), {
    valid: false,
    error: 'Please agree to the privacy notice.'
  });

  // Short name
  assert.deepEqual(validateEnquiryPayload({ ...valid, name: 'A' }), {
    valid: false,
    error: 'Please add your name or studio.'
  });

  // Invalid email
  assert.deepEqual(validateEnquiryPayload({ ...valid, email: 'notanemail' }), {
    valid: false,
    error: 'Please use a valid email.'
  });

  // Short goal
  assert.deepEqual(validateEnquiryPayload({ ...valid, goal: 'Need trailer' }), {
    valid: false,
    error: 'Tell us a little more about your game and goal.'
  });
});

test('isHoneypotTriggered detects bot injection into website field', () => {
  const normalMap = new Map([
    ['name', 'Real Studio'],
    ['email', 'real@example.test'],
    ['website', '']
  ]);
  const normalFormData = { get: (k) => normalMap.get(k) };
  assert.equal(isHoneypotTriggered(normalFormData), false);

  const spamMap = new Map([
    ['name', 'Spam Bot'],
    ['email', 'bot@spam.test'],
    ['website', 'http://spam-link.test']
  ]);
  const spamFormData = { get: (k) => spamMap.get(k) };
  assert.equal(isHoneypotTriggered(spamFormData), true);
});

test('buildEnquiryPayload maps form fields and preserves idempotency request ID', () => {
  const formMap = new Map([
    ['name', '  Studio Alpha  '],
    ['email', 'alpha@studio.test  '],
    ['discord', 'Alpha#1234'],
    ['gameUrl', 'https://roblox.com/games/123'],
    ['service', 'Game Thumbnails'],
    ['packageName', 'MONDO LAB'],
    ['goal', '  Build three clickable thumbnails for launch.  '],
    ['budget', '$1k-2k'],
    ['deadline', 'End of month'],
    ['consent', 'on']
  ]);
  const mockFormData = { get: (k) => formMap.get(k) };

  const payload = buildEnquiryPayload(mockFormData, 'req-uuid-test-123');
  assert.equal(payload.id, 'req-uuid-test-123');
  assert.equal(payload.name, 'Studio Alpha');
  assert.equal(payload.email, 'alpha@studio.test');
  assert.equal(payload.goal, 'Build three clickable thumbnails for launch.');
  assert.equal(payload.consent, true);
  assert.equal(payload.website, '');
});

test('renderSuccessMarkup formats the 8-character uppercase reference code', () => {
  const html = renderSuccessMarkup('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
  assert.match(html, /class="form-success"/);
  assert.match(html, /Your reference: A1B2C3D4/);
  assert.match(html, /You’re on<br \/>our radar\./);
  assert.match(html, /href="\/work"/);
});
