import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import app from '../server.js';
import { getSlugFromPath } from '../public/js/features/project/project-page.js';
import { defaultProjects } from '../public/js/shared/defaults.js';
import { DEFAULT_HYBRID_PILOT_ENABLED, isHybridPilotEnabled } from '../public/js/features/navigation/coordinator-binding.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const VALID_PROJECT_SLUGS = [
  'rainbow-orchard',
  'cat-battle',
  'cosmic-egg',
  'dragon-escape',
  'legendary-orchard'
];

test('P0 Project Routing Regression: vercel.json cleanUrls & rewrite contract', () => {
  const vercelJsonPath = path.join(rootDir, 'vercel.json');
  assert.ok(fs.existsSync(vercelJsonPath), 'vercel.json must exist');

  const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));
  assert.equal(vercelConfig.cleanUrls, true, 'cleanUrls must be true');
  assert.ok(Array.isArray(vercelConfig.rewrites), 'rewrites must be an array');

  // Verify that with cleanUrls: true, NO rewrite destination ends with .html
  for (const rule of vercelConfig.rewrites) {
    if (typeof rule.destination === 'string') {
      assert.equal(
        rule.destination.endsWith('.html'),
        false,
        `Rewrite destination must NOT end in .html when cleanUrls is true: ${rule.source} -> ${rule.destination}`
      );
    }
  }

  // Specifically verify the /work/:slug rule
  const projectRewrite = vercelConfig.rewrites.find((r) => r.source === '/work/:slug');
  assert.ok(projectRewrite, 'Rewrite rule for /work/:slug must exist');
  assert.equal(
    projectRewrite.destination,
    '/work/project',
    'Destination for /work/:slug must be clean URL /work/project, not /work/project.html'
  );

  // Verify clean URL target exists on disk in public
  const targetHtmlPath = path.join(rootDir, 'public', 'work', 'project.html');
  assert.ok(
    fs.existsSync(targetHtmlPath),
    'Clean URL /work/project must correspond to public/work/project.html on disk'
  );
});

test('P0 Project Routing Regression: Hybrid Navigation lockdown strictly maintained', () => {
  assert.equal(
    DEFAULT_HYBRID_PILOT_ENABLED,
    false,
    'DEFAULT_HYBRID_PILOT_ENABLED must remain false in production runtime'
  );
  assert.equal(
    isHybridPilotEnabled(),
    false,
    'isHybridPilotEnabled() without explicit local opt-in must evaluate to false'
  );
  // Non-local hostnames must strictly reject opt-in
  const mockProdWin = {
    location: { hostname: 'mondo-studio.vercel.app', search: '?hybrid=1' },
    sessionStorage: { getItem: () => '1' }
  };
  assert.equal(
    isHybridPilotEnabled({ window: mockProdWin }),
    false,
    'isHybridPilotEnabled() on production hostname must evaluate to false even with ?hybrid=1'
  );
});

test('P0 Project Routing Regression: pure getSlugFromPath helper accuracy', () => {
  for (const slug of VALID_PROJECT_SLUGS) {
    assert.equal(
      getSlugFromPath(`/work/${slug}`),
      slug,
      `getSlugFromPath(/work/${slug}) must resolve to ${slug}`
    );
    assert.equal(
      getSlugFromPath(`/work/${slug}/`),
      slug,
      `getSlugFromPath with trailing slash /work/${slug}/ must resolve to ${slug}`
    );
  }

  // Legacy fallback via search parameter
  assert.equal(
    getSlugFromPath('/work/project.html', '?slug=rainbow-orchard'),
    'rainbow-orchard',
    'getSlugFromPath must support ?slug= query param on project.html'
  );

  // Verify all 5 slugs exist in defaultProjects
  for (const slug of VALID_PROJECT_SLUGS) {
    const proj = defaultProjects.find((p) => p.slug === slug);
    assert.ok(proj, `Default project for slug "${slug}" must exist in defaultProjects`);
    assert.ok(proj.title, `Project "${slug}" must have a title`);
    assert.ok(proj.description, `Project "${slug}" must have a description`);
    assert.ok(proj.objective, `Project "${slug}" must have an objective`);
    assert.ok(proj.hook, `Project "${slug}" must have a hook`);
  }
});

test('P0 Project Routing Regression: Express server route-to-document delivery', async (t) => {
  let server;
  let baseUrl;

  await new Promise((resolve) => {
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  t.after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  for (const slug of VALID_PROJECT_SLUGS) {
    await t.test(`Route /work/${slug} delivers Project Details HTML, NOT Homepage`, async () => {
      const res = await fetch(`${baseUrl}/work/${slug}`);
      assert.equal(res.status, 200, `HTTP status must be 200 for /work/${slug}`);
      assert.match(res.headers.get('content-type'), /text\/html/);

      const html = await res.text();

      // Document identity assertions
      assert.match(html, /<title>Project Details — MONDO<\/title>/, 'Page title must be Project Details');
      assert.match(html, /id="project-main"/, 'Must contain #project-main container');
      assert.match(html, /id="project-intro-wrap"/, 'Must contain #project-intro-wrap');
      assert.match(html, /id="project-media"/, 'Must contain #project-media');
      assert.match(html, /id="project-story"/, 'Must contain #project-story');
      assert.match(html, /id="explore-grid"/, 'Must contain #explore-grid');
      assert.match(html, /src="\/js\/project\.js"/, 'Must load project.js bundle/module');

      // STRICT NEGATIVE ASSERTIONS: Must NEVER contain Homepage Hero
      assert.doesNotMatch(html, /Make your<br \/>game the<br \/><span>next click\.<\/span>/, 'Must NOT contain Homepage hero headline');
      assert.doesNotMatch(html, /class="hero"/, 'Must NOT contain Homepage .hero class');
      assert.doesNotMatch(html, /src="\/js\/home\.js"/, 'Must NOT load home.js');
    });
  }

  await t.test('Unknown project slug resolves to Project Details template (allowing client-side 404), NOT Homepage', async () => {
    const res = await fetch(`${baseUrl}/work/non-existent-mystery-slug-xyz`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);

    const html = await res.text();
    assert.match(html, /<title>Project Details — MONDO<\/title>/);
    assert.match(html, /id="project-main"/);
    assert.match(html, /id="project-error-host"/);
    assert.doesNotMatch(html, /Make your<br \/>game the<br \/><span>next click\.<\/span>/);
    assert.doesNotMatch(html, /src="\/js\/home\.js"/);
  });

  await t.test('Non-project routes retain their expected document identities', async () => {
    // Homepage
    const homeRes = await fetch(`${baseUrl}/`);
    assert.equal(homeRes.status, 200);
    const homeHtml = await homeRes.text();
    assert.match(homeHtml, /<title>MONDO — Game Creative Studio<\/title>/);
    assert.match(homeHtml, /src="\/js\/home\.js"/);

    // Work portfolio
    const workRes = await fetch(`${baseUrl}/work`);
    assert.equal(workRes.status, 200);
    const workHtml = await workRes.text();
    assert.match(workHtml, /<title>Our work — MONDO<\/title>/);
    assert.match(workHtml, /id="work-grid"/);

    // Start enquiry
    const startRes = await fetch(`${baseUrl}/start`);
    assert.equal(startRes.status, 200);
    const startHtml = await startRes.text();
    assert.match(startHtml, /<title>Start a project — MONDO<\/title>/);

    // Privacy
    const privRes = await fetch(`${baseUrl}/privacy`);
    assert.equal(privRes.status, 200);
    const privHtml = await privRes.text();
    assert.match(privHtml, /<title>Privacy notice — MONDO<\/title>/);
  });
});
