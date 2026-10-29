import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import app from '../server.js';
import { defaultProjects } from '../src/config/defaults.js';

test('Brand assets integrity: all authentic marks, wordmark, and favicons exist with non-zero size', () => {
  const brandAssets = [
    'public/assets/mondo-mark.webp',
    'public/assets/mondo-mark-dark.webp',
    'public/assets/mondo-mark-original.webp',
    'public/assets/mondo-wordmark.svg',
    'public/favicon.svg',
    'public/favicon.ico',
    'public/favicon-16x16.png',
    'public/favicon-32x32.png',
    'public/apple-touch-icon.png'
  ];

  for (const asset of brandAssets) {
    assert.ok(fs.existsSync(asset), `Brand asset must exist: ${asset}`);
    const stat = fs.statSync(asset);
    assert.ok(stat.size > 0, `Brand asset must have non-zero size: ${asset} (${stat.size} bytes)`);
  }
});

test('Geometric facet assets integrity: active SVGs exist and contain valid XML markup', () => {
  const facets = [
    'public/assets/facet-button-left.svg',
    'public/assets/facet-button-right.svg',
    'public/assets/facet-button-secondary-left.svg',
    'public/assets/facet-card-bottom-right.svg',
    'public/assets/facet-card-top-left.svg',
    'public/assets/facet-input-leading.svg'
  ];

  for (const facet of facets) {
    assert.ok(fs.existsSync(facet), `Facet SVG must exist: ${facet}`);
    const content = fs.readFileSync(facet, 'utf8');
    assert.ok(content.startsWith('<svg'), `Facet SVG must start with <svg: ${facet}`);
    assert.ok(content.includes('</svg>'), `Facet SVG must close with </svg>: ${facet}`);
    assert.ok(content.includes('viewBox='), `Facet SVG must define a viewBox: ${facet}`);
  }
});

test('Portfolio project media integrity: all canonical project cover images exist', () => {
  for (const project of defaultProjects) {
    assert.ok(project.image, `Project ${project.slug} must define an image property`);
    const localPath = path.join('public', project.image);
    assert.ok(fs.existsSync(localPath), `Project image must exist on disk: ${localPath}`);
    assert.ok(fs.statSync(localPath).size > 1000, `Project image must be substantial: ${localPath}`);

    // Verify small variant exists for srcset
    const smallPath = localPath.replace('.webp', '-small.webp');
    assert.ok(fs.existsSync(smallPath), `Project small image variant must exist: ${smallPath}`);
  }
});

test('Production HTML reference integrity: all referenced local stylesheets and scripts exist', () => {
  const htmlFiles = [
    'public/index.html',
    'public/work/index.html',
    'public/work/project.html',
    'public/start/index.html',
    'public/privacy/index.html',
    'public/admin/index.html'
  ];

  for (const htmlFile of htmlFiles) {
    assert.ok(fs.existsSync(htmlFile), `HTML file must exist: ${htmlFile}`);
    const content = fs.readFileSync(htmlFile, 'utf8');

    // Extract all local script sources
    const scriptMatches = [...content.matchAll(/<script\b[^>]*src=["'](\/js\/[^"']+)["']/gi)];
    for (const match of scriptMatches) {
      const scriptPath = path.join('public', match[1]);
      assert.ok(fs.existsSync(scriptPath), `Script referenced in ${htmlFile} must exist: ${scriptPath}`);
    }

    // Extract all local stylesheet links
    const cssMatches = [...content.matchAll(/<link\b[^>]*href=["'](\/css\/[^"']+)["']/gi)];
    for (const match of cssMatches) {
      const cssPath = path.join('public', match[1]);
      assert.ok(fs.existsSync(cssPath), `CSS referenced in ${htmlFile} must exist: ${cssPath}`);
    }
  }
});

test('Prototype isolation: standalone prototype HTMLs have been safely relocated to prototypes/', () => {
  const prototypes = [
    'prototypes/mondo-all-cards-catalog.html',
    'prototypes/mondo-test.html',
    'prototypes/mondo-ui.html',
    'prototypes/test_display_font.html',
    'prototypes/test_fonts.html',
    'prototypes/test_verification.html'
  ];

  for (const proto of prototypes) {
    assert.ok(fs.existsSync(proto), `Prototype must exist in prototypes/: ${proto}`);
    assert.ok(fs.statSync(proto).size > 0, `Prototype must have non-zero size: ${proto}`);
    // Confirm no longer in public/
    const publicPath = path.join('public', path.basename(proto));
    assert.strictEqual(fs.existsSync(publicPath), false, `Prototype must NOT exist in public/: ${publicPath}`);
  }
});

test('Quarantine and reference isolation: starter assets and client drafts are preserved in archive/', () => {
  const archivedStarters = [
    'archive/quarantine/starter_assets/file.svg',
    'archive/quarantine/starter_assets/globe.svg',
    'archive/quarantine/starter_assets/window.svg'
  ];

  for (const item of archivedStarters) {
    assert.ok(fs.existsSync(item), `Archived starter asset must exist: ${item}`);
    const publicPath = path.join('public', path.basename(item));
    assert.strictEqual(fs.existsSync(publicPath), false, `Archived asset must NOT remain in public/: ${publicPath}`);
  }

  // Verify archive/design_references contains client whatsapp photos and ref images
  assert.ok(fs.existsSync('archive/design_references/client_whatsapp_logos'), 'WhatsApp archive dir must exist');
  assert.strictEqual(fs.readdirSync('archive/design_references/client_whatsapp_logos').length, 7, 'Must hold 7 WhatsApp photos');

  assert.ok(fs.existsSync('archive/design_references/public_ref'), 'public_ref archive dir must exist');
  assert.strictEqual(fs.readdirSync('archive/design_references/public_ref').length, 20, 'Must hold 20 reference images');

  // Verify public/assets/logo and public/ref are completely removed from public serving tree
  assert.strictEqual(fs.existsSync('public/assets/logo'), false, 'public/assets/logo must not exist');
  assert.strictEqual(fs.existsSync('public/ref'), false, 'public/ref must not exist');
});

test('Server static asset delivery: active assets return 200 with appropriate Content-Type', async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const assetsToTest = [
    { url: '/assets/mondo-mark.webp', expectedType: 'image/webp' },
    { url: '/assets/mondo-wordmark.svg', expectedType: 'image/svg+xml' },
    { url: '/assets/facet-button-left.svg', expectedType: 'image/svg+xml' },
    { url: '/assets/rainbow-orchard.webp', expectedType: 'image/webp' },
    { url: '/favicon.svg', expectedType: 'image/svg+xml' },
    { url: '/apple-touch-icon.png', expectedType: 'image/png' },
    { url: '/css/style.css', expectedType: 'text/css' },
    { url: '/js/site.js', expectedType: 'application/javascript' }
  ];

  for (const item of assetsToTest) {
    const res = await fetch(`${baseUrl}${item.url}`);
    assert.strictEqual(res.status, 200, `Asset ${item.url} must return 200 OK`);
    const ctype = res.headers.get('content-type') || '';
    assert.ok(ctype.includes(item.expectedType), `Asset ${item.url} must match content-type ${item.expectedType}, got ${ctype}`);
  }

  // Verify isolated prototypes return 404 (with fallback index.html) and do NOT leak into public route
  const res404 = await fetch(`${baseUrl}/mondo-test.html`);
  assert.strictEqual(res404.status, 404, 'Isolated prototype must return 404 from public server');

  const res404Ref = await fetch(`${baseUrl}/ref/card-reference.png`);
  assert.strictEqual(res404Ref.status, 404, 'Isolated ref asset must return 404 from public server');

  server.close();
});
