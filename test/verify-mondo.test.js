import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultProjects, defaultSettings } from '../lib/defaults.js';
import {
  projectSchema,
  settingsSchema,
  enquirySchema,
  eventSchema,
  matchesSignature,
  allowedMediaTypes,
  sameOrigin
} from '../lib/validation.js';
import {
  verifyAdminCredentials,
  signAdminToken,
  verifyAdminToken,
  isAuthThrottled,
  recordFailedLogin,
  resetLoginAttempts,
  areAdminCredentialsConfigured
} from '../lib/auth.js';
import { getProjects, getSettings } from '../lib/content.js';
import loadHandler from '../api/v1/load.js';
import eventsHandler from '../api/v1/events.js';

function mockBrief(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    name: 'MONDO QA Studio',
    email: 'qa@example.test',
    discord: '',
    gameUrl: 'https://www.roblox.com/games/123',
    service: 'Game Thumbnails',
    packageName: '',
    goal: 'A launch thumbnail for a playful new game.',
    budget: '',
    deadline: '',
    consent: true,
    website: '',
    ...overrides
  };
}

// 1. Creative records and package quantities
test('default creative records and editable package data validate', async () => {
  assert.equal(defaultProjects.length, 5);
  for (const p of defaultProjects) {
    const res = projectSchema.safeParse(p);
    assert.equal(res.success, true, `Project ${p.id} failed validation`);
  }

  const sRes = settingsSchema.safeParse(defaultSettings);
  assert.equal(sRes.success, true, 'Default settings failed validation');

  const monthlyPacks = defaultSettings.packages.filter((p) => p.monthly);
  assert.equal(monthlyPacks.length, 3);
  assert.deepEqual(
    monthlyPacks.map((p) => p.features.slice(0, 2)),
    [
      ['2 thumbnails every week', '1 game trailer every month'],
      ['4 thumbnails every week', '2 game trailers every month'],
      ['7 thumbnails every week', '4 game trailers every month']
    ]
  );

  // Check no published trailers lack video
  assert.equal(defaultProjects.some((p) => p.category === 'Trailers' && p.published && !p.video), false);
});

// 2. Enquiry validation, consent, honeypot, Unicode support
test('required consent, readable briefs, and safe links are enforced', () => {
  const invalidCases = [
    { consent: false },
    { email: 'broken' },
    { goal: 'short' },
    { website: 'bot.example' },
    { gameUrl: 'javascript:alert(1)' },
    { gameUrl: 'https://' },
    { gameUrl: 'https://user:pass@example.test' }
  ];

  for (const change of invalidCases) {
    const res = enquirySchema.safeParse(mockBrief(change));
    assert.equal(res.success, false, `Expected failure for ${JSON.stringify(change)}`);
  }

  // Unicode and Arabic brief validation
  const arabicBrief = mockBrief({
    gameUrl: '',
    name: 'سيف',
    goal: 'محتاج ثمنيل للعبة روبلوكس الجديدة'
  });
  const res = enquirySchema.safeParse(arabicBrief);
  assert.equal(res.success, true, 'Arabic text should validate cleanly');
});

// 3. Same-origin check
test('same-origin CSRF verification behaves correctly', () => {
  const matchingReq = {
    headers: {
      origin: 'https://mondo.test',
      host: 'mondo.test'
    }
  };
  assert.equal(sameOrigin(matchingReq), true);

  const crossOriginReq = {
    headers: {
      origin: 'https://evil.test',
      host: 'mondo.test'
    }
  };
  assert.equal(sameOrigin(crossOriginReq), false);
});

// 4. Admin authentication and JWT token verification
test('admin login requires configured credentials and produces valid JWT', () => {
  // Test with no credentials set
  const origPass = process.env.ADMIN_PASSWORD;
  const origSecret = process.env.JWT_SECRET;

  delete process.env.ADMIN_PASSWORD;
  delete process.env.JWT_SECRET;
  assert.equal(areAdminCredentialsConfigured(), false);
  assert.equal(verifyAdminCredentials('admin', 'anything').ok, false);

  // Configure test credentials
  process.env.ADMIN_USERNAME = 'mondo-admin';
  process.env.ADMIN_PASSWORD = 'super-secret-password-123';
  process.env.JWT_SECRET = 'a-very-long-and-secure-jwt-secret-key-32chars';

  assert.equal(areAdminCredentialsConfigured(), true);

  // Wrong password
  const failRes = verifyAdminCredentials('mondo-admin', 'wrong');
  assert.equal(failRes.ok, false);

  // Correct credentials
  const successRes = verifyAdminCredentials('mondo-admin', 'super-secret-password-123');
  assert.equal(successRes.ok, true);
  assert.equal(successRes.username, 'mondo-admin');

  // Sign token
  const token = signAdminToken('mondo-admin');
  assert.equal(typeof token, 'string');

  // Verify token
  const decoded = verifyAdminToken(token);
  assert.equal(decoded.sub, 'mondo-admin');
  assert.equal(decoded.role, 'admin');

  // Invalid token
  assert.equal(verifyAdminToken('invalid.jwt.token'), null);

  // Cleanup env
  if (origPass) process.env.ADMIN_PASSWORD = origPass;
  else delete process.env.ADMIN_PASSWORD;
  if (origSecret) process.env.JWT_SECRET = origSecret;
  else delete process.env.JWT_SECRET;
});

// 5. Auth throttling
test('login throttling blocks IP after 5 failed attempts', () => {
  const testIp = '198.51.100.42';
  resetLoginAttempts(testIp);
  assert.equal(isAuthThrottled(testIp), false);

  for (let i = 0; i < 5; i++) {
    recordFailedLogin(testIp);
  }
  assert.equal(isAuthThrottled(testIp), true);

  resetLoginAttempts(testIp);
  assert.equal(isAuthThrottled(testIp), false);
});

// 6. Public vs admin data separation
test('public content endpoint never exposes hidden projects or enquiries', async () => {
  let status = 0;
  let jsonResult = null;
  const mockReq = { method: 'GET', headers: {} };
  const mockRes = {
    setHeader: () => {},
    status: (s) => {
      status = s;
      return {
        json: (data) => {
          jsonResult = data;
        }
      };
    }
  };

  await loadHandler(mockReq, mockRes);
  assert.equal(status, 200);
  assert.equal(jsonResult.ok, true);
  assert.equal(Array.isArray(jsonResult.projects), true);
  assert.equal(jsonResult.projects.every((p) => p.published), true);
  assert.equal(jsonResult.enquiries, undefined);
  assert.equal(jsonResult.credentials, undefined);
});

// 7. File signature validation
test('file signature validation accurately matches PNG, JPEG, WebP, MP4, WebM', () => {
  // Valid PNG signature
  const validPng = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
  assert.equal(matchesSignature('image/png', validPng), true);

  // Disguised file (text/html labeled as PNG)
  const fakePng = new Uint8Array([60, 104, 116, 109, 108, 62, 0, 0, 0, 0, 0, 0]);
  assert.equal(matchesSignature('image/png', fakePng), false);

  // Valid JPEG signature
  const validJpeg = new Uint8Array([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1]);
  assert.equal(matchesSignature('image/jpeg', validJpeg), true);

  // Valid WebP signature: RIFF....WEBP
  const validWebp = new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80]);
  assert.equal(matchesSignature('image/webp', validWebp), true);

  // Valid MP4 signature: ....ftyp
  const validMp4 = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109]);
  assert.equal(matchesSignature('video/mp4', validMp4), true);

  // Valid WebM signature: 0x1A 0x45 0xDF 0xA3
  const validWebm = new Uint8Array([26, 69, 223, 163, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(matchesSignature('video/webm', validWebm), true);
});

// 8. Event tracking validation
test('analytics events validate types and reject manufactured enquiry_submitted', async () => {
  assert.equal(eventSchema.safeParse({ type: 'project_open', slug: 'cat-battle' }).success, true);
  assert.equal(eventSchema.safeParse({ type: 'trailer_play', slug: '' }).success, true);
  assert.equal(eventSchema.safeParse({ type: 'form_start', slug: '' }).success, true);

  // Cannot manufacture enquiry_submitted
  assert.equal(eventSchema.safeParse({ type: 'enquiry_submitted', slug: '' }).success, false);
});
