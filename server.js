import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Load environment variables from .env if present
dotenv.config();

import loadHandler from './api/v1/load.js';
import loginHandler from './api/v1/login.js';
import sessionHandler from './api/v1/session.js';
import logoutHandler from './api/v1/logout.js';
import saveHandler from './api/v1/save.js';
import uploadHandler from './api/v1/upload.js';
import enquiriesHandler from './api/v1/enquiries.js';
import eventsHandler from './api/v1/events.js';
import mediaHandler from './api/v1/media.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Middleware for parsing JSON on standard API endpoints
// Note: /api/v1/upload is excluded from json parsing so busboy can parse multipart stream.
const jsonParser = express.json({ limit: '1mb' });

app.use((req, res, next) => {
  if (req.path === '/api/v1/upload') {
    return next();
  }
  return jsonParser(req, res, next);
});

app.use(express.urlencoded({ extended: true }));

// Adapt Vercel Serverless Function handlers
app.all('/api/v1/load', (req, res) => loadHandler(req, res));
app.all('/api/v1/login', (req, res) => loginHandler(req, res));
app.all('/api/v1/session', (req, res) => sessionHandler(req, res));
app.all('/api/v1/logout', (req, res) => logoutHandler(req, res));
app.all('/api/v1/save', (req, res) => saveHandler(req, res));
app.all('/api/v1/upload', (req, res) => uploadHandler(req, res));
app.all('/api/v1/enquiries', (req, res) => enquiriesHandler(req, res));
app.all('/api/v1/events', (req, res) => eventsHandler(req, res));
app.all('/api/v1/media', (req, res) => mediaHandler(req, res));

// Rewrite media route
app.get('/media/:key', (req, res) => {
  req.query.key = req.params.key;
  return mediaHandler(req, res);
});

// Serve static assets from public/
const publicDir = path.join(__dirname, 'public');
const distDir = path.join(publicDir, 'dist');

// 1. Immutable caching for content-hashed assets under /dist/
app.use('/dist', express.static(distDir, {
  maxAge: '1y',
  immutable: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css')) res.setHeader('Content-Type', 'text/css; charset=UTF-8');
    if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
  }
}));

// 2. Production bundle router: serves optimized bundles when built unless ?source=1 is requested
const bundleMappings = {
  '/css/style.css': path.join(distDir, 'css', 'style.bundle.css'),
  '/js/home.js': path.join(distDir, 'js', 'home.bundle.js'),
  '/js/site.js': path.join(distDir, 'js', 'site.bundle.js'),
  '/js/intro.js': path.join(distDir, 'js', 'intro.bundle.js'),
  '/js/work.js': path.join(distDir, 'js', 'work.bundle.js'),
  '/js/project.js': path.join(distDir, 'js', 'project.bundle.js'),
  '/js/start.js': path.join(distDir, 'js', 'start.bundle.js'),
  '/js/admin.js': path.join(distDir, 'js', 'admin.bundle.js')
};

for (const [routePath, bundleFilePath] of Object.entries(bundleMappings)) {
  app.get(routePath, (req, res, next) => {
    if (req.query.source !== '1' && fs.existsSync(bundleFilePath)) {
      const ctype = routePath.endsWith('.css') ? 'text/css; charset=UTF-8' : 'application/javascript; charset=UTF-8';
      res.setHeader('Content-Type', ctype);
      res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
      return res.sendFile(bundleFilePath);
    }
    next();
  });
}

// 3. Serve static assets with appropriate caching
app.use(express.static(publicDir, {
  extensions: ['html'],
  setHeaders: (res, filePath) => {
    if (filePath.includes(path.join('public', 'assets')) || filePath.includes('/assets/')) {
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    } else if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
  }
}));

// Route rewrites for clean URLs matching Vercel
app.get('/work/:slug', (req, res, next) => {
  if (req.params.slug && !req.params.slug.includes('.')) {
    return res.sendFile(path.join(publicDir, 'work', 'project.html'));
  }
  next();
});

app.get('/work', (req, res) => {
  res.sendFile(path.join(publicDir, 'work', 'index.html'));
});

app.get('/start', (req, res) => {
  res.sendFile(path.join(publicDir, 'start', 'index.html'));
});

app.get('/privacy', (req, res) => {
  res.sendFile(path.join(publicDir, 'privacy', 'index.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(publicDir, 'admin', 'index.html'));
});

// 404 handler for unknown routes
app.use((req, res) => {
  res.status(404).sendFile(path.join(publicDir, 'index.html'));
});

// If run directly via node server.js, start listening
if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(port, () => {
    console.log(`MONDO local server running at http://localhost:${port}`);
  });
}

export default app;
