import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const distDir = path.join(publicDir, 'dist');
const distCssDir = path.join(distDir, 'css');
const distJsDir = path.join(distDir, 'js');

// Ensure output directories exist
fs.mkdirSync(distCssDir, { recursive: true });
fs.mkdirSync(distJsDir, { recursive: true });

function getHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 8);
}

async function build() {
  const startTime = Date.now();
  console.log('=== MONDO PRODUCTION ASSET BUILD ===');

  const manifest = {
    generatedAt: new Date().toISOString(),
    bundles: {}
  };

  // 1. CSS Bundle
  console.log('-> Bundling CSS...');
  const cssResult = await esbuild.build({
    entryPoints: [path.join(publicDir, 'css', 'style.css')],
    bundle: true,
    minify: true,
    external: ['/assets/*'],
    legalComments: 'none',
    write: false
  });

  const cssBuffer = Buffer.from(cssResult.outputFiles[0].text, 'utf8');
  const cssHash = getHash(cssBuffer);
  const cssBundleCanonical = 'style.bundle.css';
  const cssBundleHashed = `style.bundle.${cssHash}.css`;

  fs.writeFileSync(path.join(distCssDir, cssBundleCanonical), cssBuffer);
  fs.writeFileSync(path.join(distCssDir, cssBundleHashed), cssBuffer);

  manifest.bundles['css/style.css'] = {
    canonical: `/dist/css/${cssBundleCanonical}`,
    hashed: `/dist/css/${cssBundleHashed}`,
    size: cssBuffer.length,
    hash: cssHash
  };
  console.log(`   CSS: ${cssBuffer.length} bytes -> ${cssBundleCanonical} (${cssBundleHashed})`);

  // 2. JavaScript Entry-Point Bundles
  console.log('-> Bundling JavaScript ES Modules...');
  const jsEntries = ['home', 'site', 'intro', 'work', 'project', 'start', 'admin'];

  for (const entry of jsEntries) {
    const entryPath = path.join(publicDir, 'js', `${entry}.js`);
    if (!fs.existsSync(entryPath)) continue;

    const jsResult = await esbuild.build({
      entryPoints: [entryPath],
      bundle: true,
      minify: true,
      format: 'esm',
      legalComments: 'none',
      write: false
    });

    const jsBuffer = Buffer.from(jsResult.outputFiles[0].text, 'utf8');
    const jsHash = getHash(jsBuffer);
    const jsBundleCanonical = `${entry}.bundle.js`;
    const jsBundleHashed = `${entry}.bundle.${jsHash}.js`;

    fs.writeFileSync(path.join(distJsDir, jsBundleCanonical), jsBuffer);
    fs.writeFileSync(path.join(distJsDir, jsBundleHashed), jsBuffer);

    manifest.bundles[`js/${entry}.js`] = {
      canonical: `/dist/js/${jsBundleCanonical}`,
      hashed: `/dist/js/${jsBundleHashed}`,
      size: jsBuffer.length,
      hash: jsHash
    };
    console.log(`   JS [${entry}]: ${jsBuffer.length} bytes -> ${jsBundleCanonical} (${jsBundleHashed})`);
  }

  // 3. Write manifest.json
  const manifestPath = path.join(distDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`-> Manifest written to: ${path.relative(rootDir, manifestPath)}`);

  const elapsed = Date.now() - startTime;
  console.log(`=== BUILD COMPLETE in ${elapsed}ms ===`);
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
