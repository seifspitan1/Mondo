import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getSlugFromPath,
  renderProject,
  renderNotFound,
  renderErrorState,
  clearProjectErrorState,
  mountProject,
  unmountProject,
  initProjectPage,
  areProjectsEquivalent,
  areRelatedProjectsEquivalent,
  trackProjectView,
  resetProjectTrackingState
} from '../public/js/features/project/project-page.js';

import { defaultProjects } from '../public/js/shared/defaults.js';
import { DEFAULT_HYBRID_PILOT_ENABLED } from '../public/js/features/navigation/coordinator-binding.js';

class MockElement {
  constructor(id, tagName = 'div') {
    this.id = id;
    this.tagName = tagName.toUpperCase();
    this.className = '';
    this.classList = {
      _classes: new Set(),
      add: (...cls) => cls.forEach((c) => this.classList._classes.add(c)),
      remove: (...cls) => cls.forEach((c) => this.classList._classes.delete(c)),
      contains: (c) => this.classList._classes.has(c)
    };
    this.attributes = new Map();
    this._innerHTML = '';
    this._children = [];
    this.style = {};
    this.hidden = false;
    this.dataset = {};
  }
  getAttribute(name) { return this.attributes.get(name) || null; }
  setAttribute(name, val) { this.attributes.set(name, String(val)); }
  removeAttribute(name) { this.attributes.delete(name); }
  get innerHTML() { return this._innerHTML; }
  set innerHTML(val) {
    this._innerHTML = val;
    if (val.includes('<img')) {
      const srcMatch = val.match(/src="([^"]+)"/);
      const altMatch = val.match(/alt="([^"]+)"/);
      const img = new MockElement('', 'img');
      img.src = srcMatch ? srcMatch[1] : '';
      img.alt = altMatch ? altMatch[1] : '';
      img.setAttribute('alt', img.alt);
      img.setAttribute('src', img.src);
      img.naturalWidth = 1600;
      img.naturalHeight = 900;
      img.decode = async () => {};
      this._children = [img];
    } else if (val.includes('<video')) {
      const video = new MockElement('', 'video');
      video.addEventListener = () => {};
      this._children = [video];
    } else {
      this._children = [];
    }
  }
  get firstElementChild() { return this._children[0] || null; }
  querySelector(sel) {
    if (sel === 'img') return this._children.find((c) => c.tagName === 'IMG') || null;
    if (sel === 'video') return this._children.find((c) => c.tagName === 'VIDEO') || null;
    return null;
  }
}

function createMockProjectDoc() {
  const elements = {
    'project-main': new MockElement('project-main'),
    'project-intro-wrap': new MockElement('project-intro-wrap'),
    'project-media': new MockElement('project-media'),
    'project-story': new MockElement('project-story'),
    'explore-grid': new MockElement('explore-grid'),
    'project-error-host': new MockElement('project-error-host')
  };
  elements['project-main'].dataset = {};

  return {
    elements,
    documentElement: {
      classList: {
        _classes: new Set(),
        add: () => {},
        remove: () => {},
        contains: () => false
      }
    },
    body: elements['project-main'],
    getElementById: (id) => elements[id] || null,
    querySelector: (sel) => {
      if (sel === '#project-media img') return elements['project-media'].querySelector('img');
      if (sel === '#project-media video') return elements['project-media'].querySelector('video');
      if (sel.startsWith('#')) return elements[sel.slice(1)] || null;
      return null;
    }
  };
}

test('Project Rendering & Analytics Deduplication (Phase 5D-C.1B)', async (t) => {
  t.beforeEach(() => {
    resetProjectTrackingState();
    global.window = {
      __MONDO_PROJECT_READY__: false,
      __MONDO_BOOTSTRAP_STATE__: 'idle',
      dispatchEvent: () => {}
    };
    global.document = createMockProjectDoc();
    global.CustomEvent = class CustomEvent {
      constructor(type, init) {
        this.type = type;
        this.detail = init?.detail;
      }
    };
  });

  t.afterEach(() => {
    unmountProject({ root: global.document });
    resetProjectTrackingState();
    delete global.window;
    delete global.document;
    delete global.CustomEvent;
  });

  // TEST-01: Initial project content renders successfully
  await t.test('TEST-01: Initial project content renders successfully from canonical fallback defaults', async () => {
    const doc = createMockProjectDoc();
    const trackCalls = [];
    const mockTrack = (type, slug) => trackCalls.push({ type, slug });

    const coordinator = await mountProject({
      root: doc,
      slug: 'rainbow-orchard',
      fallbackProjects: defaultProjects,
      trackEvent: mockTrack,
      fetchContent: async () => ({ projects: defaultProjects })
    });

    assert.ok(coordinator, 'ReadinessCoordinator must be returned');
    assert.ok(doc.elements['project-intro-wrap'].innerHTML.includes('Rainbow Orchard'), 'Intro wrap must contain project title');
    assert.ok(doc.elements['project-intro-wrap'].innerHTML.includes('THUMBNAILS'), 'Intro wrap must contain category');
    assert.ok(doc.elements['project-media'].querySelector('img'), 'Media container must contain hero image');
    assert.strictEqual(doc.elements['project-media'].querySelector('img').src, '/assets/rainbow-orchard.webp');
    assert.ok(doc.elements['project-story'].innerHTML.includes('The objective'), 'Story container must contain facts');
    assert.ok(doc.elements['explore-grid'].innerHTML.includes('cat-battle'), 'Explore grid must render related cards');
  });

  // TEST-02: Equivalent API data does not trigger a duplicate render
  await t.test('TEST-02: Equivalent API data does not trigger a duplicate render or DOM churn', async () => {
    const doc = createMockProjectDoc();
    let apiResolved = false;

    // Track innerHTML setter calls on project containers
    let introSetCount = 0;
    const introEl = doc.elements['project-intro-wrap'];
    const origIntroDesc = Object.getOwnPropertyDescriptor(MockElement.prototype, 'innerHTML');
    
    // We can spy on whether media element is modified after initial render
    const coordinator = await mountProject({
      root: doc,
      slug: 'rainbow-orchard',
      fallbackProjects: defaultProjects,
      trackEvent: () => {},
      fetchContent: async () => {
        apiResolved = true;
        // Return cloned array with equivalent project records
        return { projects: JSON.parse(JSON.stringify(defaultProjects)) };
      }
    });

    // Capture hero image reference immediately after initial synchronous render
    const initialImg = doc.elements['project-media'].querySelector('img');
    assert.ok(initialImg, 'Initial hero image must exist');
    const initialIntroHtml = doc.elements['project-intro-wrap'].innerHTML;

    // Allow background fetchContent promise tick to complete
    await new Promise((r) => setTimeout(r, 20));

    assert.strictEqual(apiResolved, true, 'API fetch must have resolved');
    // Ensure media element was NOT replaced or destroyed
    const postReconciliationImg = doc.elements['project-media'].querySelector('img');
    assert.strictEqual(initialImg, postReconciliationImg, 'Hero image DOM reference must be identical (no re-render)');
    assert.strictEqual(doc.elements['project-intro-wrap'].innerHTML, initialIntroHtml, 'Intro HTML must be unchanged');
  });

  // TEST-03: Equivalent API data produces exactly one project-view event
  await t.test('TEST-03: Equivalent API data produces exactly one project-view event', async () => {
    const doc = createMockProjectDoc();
    const trackCalls = [];
    const mockTrack = (type, slug) => trackCalls.push({ type, slug });

    await mountProject({
      root: doc,
      slug: 'rainbow-orchard',
      fallbackProjects: defaultProjects,
      trackEvent: mockTrack,
      fetchContent: async () => {
        await new Promise((r) => setTimeout(r, 10));
        return { projects: defaultProjects };
      }
    });

    // Wait for async background hydration
    await new Promise((r) => setTimeout(r, 30));

    const viewEvents = trackCalls.filter((c) => c.type === 'project_open');
    assert.strictEqual(viewEvents.length, 1, 'Must dispatch exactly ONE project_open event');
    assert.strictEqual(viewEvents[0].slug, 'rainbow-orchard');
  });

  // TEST-04: Changed API data updates the visible project information
  await t.test('TEST-04: Changed API data updates the visible project information', async () => {
    const doc = createMockProjectDoc();

    // Updated project payload where title and description are edited
    const updatedProjects = JSON.parse(JSON.stringify(defaultProjects));
    const target = updatedProjects.find((p) => p.slug === 'rainbow-orchard');
    target.title = 'Rainbow Orchard Remastered';
    target.description = 'Updated description from studio CMS.';

    await mountProject({
      root: doc,
      slug: 'rainbow-orchard',
      fallbackProjects: defaultProjects,
      trackEvent: () => {},
      fetchContent: async () => {
        await new Promise((r) => setTimeout(r, 10));
        return { projects: updatedProjects };
      }
    });

    // Before API resolution: fallback title
    assert.ok(doc.elements['project-intro-wrap'].innerHTML.includes('Rainbow Orchard'));

    // Wait for API reconciliation
    await new Promise((r) => setTimeout(r, 30));

    // After API resolution: updated title and description must be visible
    assert.ok(
      doc.elements['project-intro-wrap'].innerHTML.includes('Rainbow Orchard Remastered'),
      'Intro must update to reflect new title'
    );
    assert.ok(
      doc.elements['project-story'].innerHTML.includes('Updated description from studio CMS.'),
      'Story must update to reflect new description'
    );
  });

  // TEST-05: Changed API data does not duplicate the same page-view event
  await t.test('TEST-05: Changed API data does not duplicate the same page-view event', async () => {
    const doc = createMockProjectDoc();
    const trackCalls = [];
    const mockTrack = (type, slug) => trackCalls.push({ type, slug });

    const updatedProjects = JSON.parse(JSON.stringify(defaultProjects));
    const target = updatedProjects.find((p) => p.slug === 'rainbow-orchard');
    target.title = 'Rainbow Orchard 2';

    await mountProject({
      root: doc,
      slug: 'rainbow-orchard',
      fallbackProjects: defaultProjects,
      trackEvent: mockTrack,
      fetchContent: async () => {
        await new Promise((r) => setTimeout(r, 10));
        return { projects: updatedProjects };
      }
    });

    // Wait for reconciliation
    await new Promise((r) => setTimeout(r, 30));

    const viewEvents = trackCalls.filter((c) => c.type === 'project_open');
    assert.strictEqual(viewEvents.length, 1, 'Must NOT fire duplicate project_open event when data updates');
  });

  // TEST-06: Delayed /api/v1/load response is handled correctly
  await t.test('TEST-06: Delayed /api/v1/load response is handled correctly without visual glitch', async () => {
    const doc = createMockProjectDoc();
    const trackCalls = [];

    await mountProject({
      root: doc,
      slug: 'cat-battle',
      fallbackProjects: defaultProjects,
      trackEvent: (t, s) => trackCalls.push({ t, s }),
      fetchContent: async () => {
        // Simulate slow 60ms network latency
        await new Promise((r) => setTimeout(r, 60));
        return { projects: defaultProjects };
      }
    });

    // Initial content immediately available
    assert.ok(doc.elements['project-intro-wrap'].innerHTML.includes('Cat Battles'));
    assert.strictEqual(trackCalls.length, 1);

    // Wait for delayed response
    await new Promise((r) => setTimeout(r, 90));

    // Content still healthy, exactly 1 view event
    assert.ok(doc.elements['project-intro-wrap'].innerHTML.includes('Cat Battles'));
    assert.strictEqual(trackCalls.length, 1);
  });

  // TEST-07: Failed API request preserves appropriate fallback behavior
  await t.test('TEST-07: Failed API request preserves appropriate fallback behavior', async () => {
    const doc = createMockProjectDoc();
    const trackCalls = [];

    await mountProject({
      root: doc,
      slug: 'cosmic-egg',
      fallbackProjects: defaultProjects,
      trackEvent: (t, s) => trackCalls.push({ t, s }),
      fetchContent: async () => {
        await new Promise((r) => setTimeout(r, 10));
        throw new Error('500 Internal Server Error');
      }
    });

    await new Promise((r) => setTimeout(r, 30));

    // Canonical content remains intact and rendered
    assert.ok(doc.elements['project-intro-wrap'].innerHTML.includes('The Cosmic Upgrade'));
    assert.strictEqual(doc.elements['project-main'].classList.contains('has-project-error'), false);
    assert.strictEqual(trackCalls.length, 1);
  });

  // TEST-08: Invalid project slug preserves the existing 404 behavior
  await t.test('TEST-08: Invalid project slug preserves the existing 404 behavior', async () => {
    const doc = createMockProjectDoc();

    await mountProject({
      root: doc,
      slug: 'non-existent-game-slug',
      fallbackProjects: defaultProjects,
      fetchContent: async () => ({ projects: defaultProjects })
    });

    await new Promise((r) => setTimeout(r, 30));

    assert.ok(doc.elements['project-main'].classList.contains('has-project-not-found'));
    assert.strictEqual(global.document.title, 'Project not found — MONDO');
  });

  // TEST-09: Each legitimate new project visit is tracked correctly
  await t.test('TEST-09: Each legitimate new project visit is tracked correctly', async () => {
    const doc = createMockProjectDoc();
    const trackCalls = [];
    const mockTrack = (type, slug) => trackCalls.push({ type, slug });

    // Visit 1: Rainbow Orchard
    await mountProject({
      root: doc,
      slug: 'rainbow-orchard',
      fallbackProjects: defaultProjects,
      trackEvent: mockTrack,
      fetchContent: async () => ({ projects: defaultProjects })
    });
    await new Promise((r) => setTimeout(r, 20));

    assert.strictEqual(trackCalls.length, 1);
    assert.strictEqual(trackCalls[0].slug, 'rainbow-orchard');

    // Unmount (user navigates away)
    unmountProject({ root: doc });

    // Visit 2: Cat Battle
    await mountProject({
      root: doc,
      slug: 'cat-battle',
      fallbackProjects: defaultProjects,
      trackEvent: mockTrack,
      fetchContent: async () => ({ projects: defaultProjects })
    });
    await new Promise((r) => setTimeout(r, 20));

    assert.strictEqual(trackCalls.length, 2);
    assert.strictEqual(trackCalls[1].slug, 'cat-battle');

    // Unmount
    unmountProject({ root: doc });

    // Visit 3: Back to Rainbow Orchard
    await mountProject({
      root: doc,
      slug: 'rainbow-orchard',
      fallbackProjects: defaultProjects,
      trackEvent: mockTrack,
      fetchContent: async () => ({ projects: defaultProjects })
    });
    await new Promise((r) => setTimeout(r, 20));

    assert.strictEqual(trackCalls.length, 3);
    assert.strictEqual(trackCalls[2].slug, 'rainbow-orchard');
  });

  // TEST-10: Existing project media is not unnecessarily destroyed and recreated
  await t.test('TEST-10: Existing project media is not unnecessarily destroyed and recreated when equivalent data arrives', async () => {
    const doc = createMockProjectDoc();

    await mountProject({
      root: doc,
      slug: 'dragon-escape',
      fallbackProjects: defaultProjects,
      trackEvent: () => {},
      fetchContent: async () => {
        await new Promise((r) => setTimeout(r, 10));
        return { projects: defaultProjects };
      }
    });

    const imgBefore = doc.elements['project-media'].querySelector('img');
    assert.ok(imgBefore, 'Image must exist on initial mount');

    await new Promise((r) => setTimeout(r, 30));

    const imgAfter = doc.elements['project-media'].querySelector('img');
    assert.strictEqual(imgBefore, imgAfter, 'Image DOM node must be preserved (not destroyed and recreated)');
  });

  // TEST-11: Repeated or overlapping initialization cannot create duplicate page-view events
  await t.test('TEST-11: Repeated or overlapping initialization cannot create duplicate page-view events', async () => {
    const doc = createMockProjectDoc();
    const trackCalls = [];
    const mockTrack = (type, slug) => trackCalls.push({ type, slug });

    // Simulate two concurrent or overlapping mountProject calls
    await Promise.all([
      mountProject({
        root: doc,
        slug: 'legendary-orchard',
        fallbackProjects: defaultProjects,
        trackEvent: mockTrack,
        fetchContent: async () => ({ projects: defaultProjects })
      }),
      mountProject({
        root: doc,
        slug: 'legendary-orchard',
        fallbackProjects: defaultProjects,
        trackEvent: mockTrack,
        fetchContent: async () => ({ projects: defaultProjects })
      })
    ]);

    await new Promise((r) => setTimeout(r, 30));

    const openEvents = trackCalls.filter((c) => c.type === 'project_open');
    assert.strictEqual(openEvents.length, 1, 'Must record exactly 1 project_open event despite overlapping calls');
  });

  // TEST-12: Native MPA and Hybrid Pilot restrictions remain intact
  await t.test('TEST-12: Native MPA and Hybrid Pilot restrictions remain intact (DEFAULT_HYBRID_PILOT_ENABLED = false)', () => {
    assert.strictEqual(
      DEFAULT_HYBRID_PILOT_ENABLED,
      false,
      'DEFAULT_HYBRID_PILOT_ENABLED must remain false in production runtime'
    );
  });
});
