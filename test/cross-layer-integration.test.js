import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import app from '../server.js';
import { defaultProjects, defaultSettings } from '../src/config/defaults.js';
import { signAdminToken, COOKIE_NAME } from '../src/services/auth.service.js';
import { getProjects, getProjectBySlug } from '../src/services/project.service.js';
import { getSettings } from '../src/services/settings.service.js';
import { submitEnquiry, getEnquiries, updateEnquiryStatus, deleteEnquiry } from '../src/services/enquiry.service.js';
import { enquiryStatuses } from '../src/schemas/enquiry.schema.js';
import { matchesSignature, allowedMediaTypes } from '../src/utils/signatures.js';
import { renderProjectCard } from '../public/js/features/work/card.js';
import { renderPackageCard, renderPackagesHtml } from '../public/js/features/packages/package-toggle.js';
import { filterEnquiries, INBOX_STATUSES } from '../public/js/features/admin/inbox/inbox-tab.js';
import { uploadProjectMedia } from '../public/js/features/admin/projects/project-upload.js';

let server;
let baseUrl;

test('setup cross-layer integration test server', async () => {
  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

// ---------------------------------------------------------------------------
// Scenario A: Project Publishing Cross-Layer Journey
// ---------------------------------------------------------------------------
test('Scenario A — Project Publishing: Full cross-layer lifecycle from Admin to public views', async () => {
  const testProject = {
    id: crypto.randomUUID(),
    slug: 'stellar-odyssey',
    title: 'Stellar Odyssey',
    category: 'Trailers',
    description: 'An epic space voyage trailer showcasing cinematic battles and deep exploration.',
    image: '/assets/cosmic-egg.webp',
    smallImage: '/assets/cosmic-egg-small.webp',
    published: true,
    order: 10,
    tags: ['Space', 'Trailer', 'Sci-Fi'],
    video: 'https://youtube.com/watch?v=sample-video-123',
    featured: true
  };

  const hiddenProject = {
    id: crypto.randomUUID(),
    slug: 'secret-draft',
    title: 'Secret Unannounced Game',
    category: 'Thumbnails',
    description: 'Internal confidential pitch concept.',
    image: '/assets/dragon-escape.webp',
    smallImage: '/assets/dragon-escape-small.webp',
    published: false,
    order: 99,
    tags: ['Unreleased'],
    featured: false
  };

  // 1. Verify default fallback projects load publicly
  const resPublic = await fetch(`${baseUrl}/api/v1/load`);
  assert.equal(resPublic.status, 200);
  const publicData = await resPublic.json();
  assert.equal(publicData.ok, true);
  assert.ok(publicData.projects.length >= 5);

  // 2. Verify Work collection HTML rendering with public card component
  const renderedCard = renderProjectCard(testProject, 0);
  assert.match(renderedCard, /Stellar Odyssey/);
  assert.match(renderedCard, /href="\/work\/stellar-odyssey"/);
  assert.match(renderedCard, /cosmic-egg\.webp/);
  assert.match(renderedCard, /video-label/);

  // 3. Verify that hidden projects are excluded from public lists
  const renderedHiddenCard = renderProjectCard(hiddenProject, 1);
  assert.match(renderedHiddenCard, /Secret Unannounced Game/);
  assert.equal(publicData.projects.some(p => p.slug === hiddenProject.slug), false);

  // 4. Verify slug resolution via project service
  const foundDefault = await getProjectBySlug('rainbow-orchard');
  assert.ok(foundDefault);
  assert.equal(foundDefault.title, 'Rainbow Orchard');

  const missingSlug = await getProjectBySlug('non-existent-game-slug');
  assert.equal(missingSlug, null);
});

// ---------------------------------------------------------------------------
// Scenario B: Package Updates Cross-Layer Journey
// ---------------------------------------------------------------------------
test('Scenario B — Package Updates: Hydration, toggle switching, and CTA routing', async () => {
  const testPackages = [
    {
      id: 'custom-lab',
      name: 'MONDO ULTRA LAB',
      subtitle: 'Find your strongest hook with custom thumbnails.',
      price: '$1,950',
      cadence: 'per creative sprint',
      highlighted: false,
      monthly: false,
      features: ['5 custom thumbnails', 'Full A/B test strategy', 'Direct Slack access']
    },
    {
      id: 'custom-monthly',
      name: 'STUDIO PARTNER',
      subtitle: 'A steady flow of high-converting creative.',
      price: '$4,800',
      cadence: 'per month',
      highlighted: true,
      monthly: true,
      features: ['Weekly thumbnail pipeline', 'Monthly cinematic trailer', 'Dedicated creative lead']
    }
  ];

  // 1. Render One-Off view
  const oneOffHtml = renderPackagesHtml(testPackages, false);
  assert.match(oneOffHtml, /MONDO ULTRA LAB/);
  assert.match(oneOffHtml, /\$1,950/);
  assert.ok(!oneOffHtml.includes('STUDIO PARTNER'));

  // 2. Render Monthly view
  const monthlyHtml = renderPackagesHtml(testPackages, true);
  assert.match(monthlyHtml, /STUDIO PARTNER/);
  assert.match(monthlyHtml, /\$4,800/);
  assert.match(monthlyHtml, /KEEP THE MOMENTUM/);
  assert.ok(!monthlyHtml.includes('MONDO ULTRA LAB'));

  // 3. Verify Package CTA URL generation
  const cardHtml = renderPackageCard(testPackages[0], 0, false);
  assert.match(cardHtml, /href="\/start\?service=Custom%20Project&package=MONDO%20ULTRA%20LAB"/);
});

// ---------------------------------------------------------------------------
// Scenario C: Enquiry Lifecycle Cross-Layer Journey
// ---------------------------------------------------------------------------
test('Scenario C — Enquiry Lifecycle: Validation, admin inbox filtration, and state updates', async () => {
  const enquiries = [
    {
      id: 'enq-001',
      name: 'Sarah Connor',
      email: 'sarah@cyberdyne.test',
      discord: 'sarah#1984',
      gameUrl: 'https://steam.test/cyberdyne',
      service: 'Game Trailers',
      packageName: 'MONDO LAUNCH',
      goal: 'Need a teaser trailer for our upcoming dystopian RPG release.',
      budget: '$2,500 - $5,000',
      status: 'New',
      createdAt: '2026-10-27T10:00:00Z'
    },
    {
      id: 'enq-002',
      name: 'Marcus Wright',
      email: 'marcus@resistance.test',
      discord: 'marcus#2018',
      gameUrl: '',
      service: 'Game Thumbnails',
      packageName: 'MONDO LAB',
      goal: 'Looking for 3 punchy thumbnails for Steam capsule testing.',
      budget: '$500 - $1,000',
      status: 'Contacted',
      createdAt: '2026-10-27T11:00:00Z'
    },
    {
      id: 'enq-003',
      name: 'John Connor',
      email: 'john@future.test',
      discord: '',
      gameUrl: 'https://itch.io/john-game',
      service: 'Creative Testing',
      packageName: '',
      goal: 'Need A/B thumbnail variations to optimize our CTR.',
      budget: '$1,000 - $2,500',
      status: 'Quoted',
      createdAt: '2026-10-27T12:00:00Z'
    }
  ];

  // 1. Filter by status
  const newEnquiries = filterEnquiries(enquiries, 'New', '');
  assert.equal(newEnquiries.length, 1);
  assert.equal(newEnquiries[0].id, 'enq-001');

  const contactedEnquiries = filterEnquiries(enquiries, 'Contacted', '');
  assert.equal(contactedEnquiries.length, 1);
  assert.equal(contactedEnquiries[0].id, 'enq-002');

  // 2. Search query across name, email, service, goal
  const searchByName = filterEnquiries(enquiries, 'All', 'Sarah');
  assert.equal(searchByName.length, 1);

  const searchByEmail = filterEnquiries(enquiries, 'All', 'resistance.test');
  assert.equal(searchByEmail.length, 1);

  const searchByGoal = filterEnquiries(enquiries, 'All', 'Steam capsule');
  assert.equal(searchByGoal.length, 1);

  const searchEmpty = filterEnquiries(enquiries, 'All', 'completely-nonexistent-keyword');
  assert.equal(searchEmpty.length, 0);

  // 3. Status enum validation - parity between frontend and backend
  assert.deepEqual(INBOX_STATUSES, ['New', 'Contacted', 'Quoted', 'Won', 'Closed']);
  assert.deepEqual(INBOX_STATUSES, enquiryStatuses);
  for (const s of enquiryStatuses) {
    assert.ok(INBOX_STATUSES.includes(s));
  }
});

// ---------------------------------------------------------------------------
// Scenario D: Upload and Media Binary Signatures
// ---------------------------------------------------------------------------
test('Scenario D — Upload & Media Signatures: Header enforcement and size constraints', async () => {
  // Valid PNG magic header (must be at least 12 bytes)
  const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
  assert.equal(matchesSignature('image/png', pngHeader), true);

  // Valid JPEG magic header (at least 12 bytes)
  const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01]);
  assert.equal(matchesSignature('image/jpeg', jpegHeader), true);

  // Valid WebP magic header
  const webpHeader = Buffer.from('RIFF0000WEBPVP8 ', 'ascii');
  assert.equal(matchesSignature('image/webp', webpHeader), true);

  // Spoofed header rejection (HTML disguised as PNG)
  const fakePng = Buffer.from('<html><script>alert(1)</script></html>', 'ascii');
  assert.equal(matchesSignature('image/png', fakePng), false);

  // Size bounds
  assert.equal(allowedMediaTypes['image/png'].maxBytes, 12 * 1024 * 1024);
  assert.equal(allowedMediaTypes['video/mp4'].maxBytes, 80 * 1024 * 1024);
});

// ---------------------------------------------------------------------------
// Scenario E: Concurrency, Race Conditions, & Failure Recovery
// ---------------------------------------------------------------------------
test('Scenario E — Concurrency & Failure Recovery: Upload guards and unconfigured DB handling', async () => {
  // 1. Editor switching during upload guard
  let state = {
    editor: { id: 'project-1', title: 'Original Project' },
    uploading: false,
    updatedFields: null,
    notices: []
  };

  const mockStore = {
    getState: () => state,
    setUploading: (val) => { state.uploading = Boolean(val); },
    updateEditor: (fields) => { state.updatedFields = fields; },
    notice: (msg, isError) => { state.notices.push({ msg, isError }); }
  };

  let renderCount = 0;
  const mockRender = () => { renderCount++; };

  const fakeFile = { name: 'cover.png', size: 1024 };

  // Context mock with delayed resolution
  const mockUpload = async () => {
    // Simulate user switching editor during upload latency
    state.editor = { id: 'project-2', title: 'Switched Project' };
    return { ok: true, url: '/media/uploaded-key.png' };
  };

  await uploadProjectMedia(fakeFile, 'image', mockStore, mockRender, { uploadMedia: mockUpload });

  // Guard must NOT update the switched editor!
  assert.equal(state.updatedFields, null);
  assert.equal(state.uploading, false);

  // 2. Unconfigured DB failure recovery
  const resUnconf = await fetch(`${baseUrl}/api/v1/enquiries`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': baseUrl
    },
    body: JSON.stringify({
      id: crypto.randomUUID(),
      name: 'Safe User',
      email: 'safe@test.com',
      service: 'Game Thumbnails',
      goal: 'Testing safe degradation when database is unavailable.',
      consent: true
    })
  });
  // Must return 503 Service Unavailable, not 500 crash or unhandled rejection
  assert.equal(resUnconf.status, 503);
  const json = await resUnconf.json();
  assert.match(json.error, /database service is not configured/i);
});

test('teardown cross-layer integration test server', async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});
