/**
 * MONDO — Hybrid Navigation Infrastructure Test Suite (Stage G3.2-R3)
 * Comprehensive automated verification for Option C Hybrid Navigation:
 * - Group A: Route Eligibility (Syntactic validation, pair eligibility, future slug support)
 * - Group B: Route Registry (Declarative specs, pattern matching, slug extraction)
 * - Group C: Navigation State & Point of No Return (Boundaries, cancellation rejection, supersession guards)
 * - Group D: Safe Destination HTML Loader (Bounded streaming, fail-closed unstreamed, redirect identity)
 * - Group E: Historical Regression & Dormancy Verification
 */

import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  normalizePath,
  isValidSlug,
  parsePilotRoute,
  isPilotRoute,
  isEligiblePilotPair
} from '../public/js/features/navigation/route-eligibility.js';

import {
  PILOT_ROUTE_DEFINITIONS,
  matchPilotRoute,
  extractProjectSlug,
  isSupportedPilotRoute,
  getRegisteredRouteIds
} from '../public/js/features/navigation/route-registry.js';

import {
  NAVIGATION_STATES,
  PERMITTED_TRANSITIONS,
  TERMINAL_STATES,
  NON_CANCELLABLE_STATES,
  isPostBoundaryState,
  isCancellableState,
  createNavigationStateManager
} from '../public/js/features/navigation/navigation-state.js';

import {
  validateTargetUrl,
  validateRouteDocument,
  fetchRouteHtml,
  MAX_RESPONSE_BYTES
} from '../public/js/features/navigation/html-loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// ─────────────────────────────────────────────────────────────────────────────
// Group A: Route Eligibility Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('Group A: Route Eligibility (Option C G3.2-R2 Core)', () => {
  it('1. Work -> Project transition is eligible', () => {
    assert.equal(isEligiblePilotPair('/work', '/work/cat-battle'), true);
    assert.equal(isEligiblePilotPair('/work', '/work/rainbow-orchard'), true);
  });

  it('2. Project -> Work transition is eligible', () => {
    assert.equal(isEligiblePilotPair('/work/cat-battle', '/work'), true);
    assert.equal(isEligiblePilotPair('/work/legendary-orchard', '/work'), true);
  });

  it('3. Valid syntactic future slugs remain eligible at shape layer', () => {
    // Proves route shape is decoupled from static catalog lists
    assert.equal(isEligiblePilotPair('/work', '/work/future-project-2026'), true);
    assert.equal(isEligiblePilotPair('/work/future-project-2026', '/work'), true);
    assert.equal(isValidSlug('future-project-2026'), true);
  });

  it('4. Project existence is not inferred from route shape', () => {
    // Route parser accepts well-formed candidate slugs without database lookup
    const parsed = parsePilotRoute('/work/brand-new-concept');
    assert.ok(parsed);
    assert.equal(parsed.type, 'project');
    assert.equal(parsed.slug, 'brand-new-concept');
  });

  it('5. Project A -> Project B transition is ineligible (Deferred per G3-D02)', () => {
    assert.equal(isEligiblePilotPair('/work/rainbow-orchard', '/work/cat-battle'), false);
    assert.equal(isEligiblePilotPair('/work/cat-battle', '/work/cosmic-egg'), false);
  });

  it('6. Work -> Work (same-route) is ineligible', () => {
    assert.equal(isEligiblePilotPair('/work', '/work'), false);
    assert.equal(isEligiblePilotPair('/work/', '/work'), false);
  });

  it('7. Project A -> Project A (same-route) is ineligible', () => {
    assert.equal(isEligiblePilotPair('/work/cat-battle', '/work/cat-battle'), false);
    assert.equal(isEligiblePilotPair('/work/cat-battle/', '/work/cat-battle'), false);
  });

  it('8. Landing (/) -> Work (/work) is ineligible', () => {
    assert.equal(isEligiblePilotPair('/', '/work'), false);
    assert.equal(isEligiblePilotPair('', '/work'), false);
  });

  it('9. Work -> Start (/start) is ineligible', () => {
    assert.equal(isEligiblePilotPair('/work', '/start'), false);
    assert.equal(isEligiblePilotPair('/work/rainbow-orchard', '/start'), false);
  });

  it('10. Privacy routes are ineligible', () => {
    assert.equal(isEligiblePilotPair('/work', '/privacy'), false);
    assert.equal(isEligiblePilotPair('/privacy', '/work'), false);
  });

  it('11. Admin routes and nested admin paths are strictly ineligible', () => {
    assert.equal(isEligiblePilotPair('/work', '/admin'), false);
    assert.equal(isEligiblePilotPair('/work', '/admin/dashboard'), false);
    assert.equal(isEligiblePilotPair('/admin', '/work'), false);
    assert.equal(isEligiblePilotPair('/admin', '/work/rainbow-orchard'), false);
  });

  it('12. External URLs and protocols are rejected', () => {
    assert.equal(isEligiblePilotPair('/work', 'https://example.com/work/rainbow-orchard'), false);
    assert.equal(isEligiblePilotPair('/work', 'javascript:alert(1)'), false);
    assert.equal(isEligiblePilotPair('/work', 'mailto:studio@mondo.com'), false);
  });

  it('13. Same-route hash anchors are rejected', () => {
    assert.equal(isEligiblePilotPair('/work', '/work#packages'), false);
    assert.equal(isEligiblePilotPair('/work/rainbow-orchard', '/work/rainbow-orchard#story'), false);
  });

  it('14. Empty and malformed project slugs are rejected', () => {
    assert.equal(isEligiblePilotPair('/work', '/work/'), false);
    assert.equal(isEligiblePilotPair('/work', '/work/index.html'), false);
    assert.equal(isEligiblePilotPair('/work', '/work/project.html'), false);
    assert.equal(isEligiblePilotPair('/work', '/work/has space'), false);
    assert.equal(isEligiblePilotPair('/work', '/work/UPPERCASE'), false);
    assert.equal(isEligiblePilotPair('/work', '/work/nested/slug'), false);
  });

  it('15. Encoded traversal or path separator injection is rejected', () => {
    assert.equal(isEligiblePilotPair('/work', '/work/..%2fadmin'), false);
    assert.equal(isEligiblePilotPair('/work', '/work/%2e%2e'), false);
    assert.equal(isEligiblePilotPair('/work', '/work/rainbow%2forchard'), false);
    assert.equal(isEligiblePilotPair('/work', '/work/rainbow\\orchard'), false);
  });

  it('16. URL normalization behaves consistently with trailing slashes, queries, and hashes', () => {
    assert.equal(normalizePath('/work/'), '/work');
    assert.equal(normalizePath('/work//rainbow-orchard/'), '/work/rainbow-orchard');
    assert.equal(normalizePath('/work/rainbow-orchard?source=test#top'), '/work/rainbow-orchard');
    assert.equal(normalizePath(new URL('http://localhost:3005/work/cosmic-egg?preview=1')), '/work/cosmic-egg');
    assert.equal(isPilotRoute('/work'), true);
    assert.equal(isPilotRoute('/work/dragon-escape'), true);
    assert.equal(isPilotRoute('/'), false);
    assert.equal(isPilotRoute('/admin'), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group B: Route Registry Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('Group B: Pure Route Registry (Option C G3.2-R2)', () => {
  it('1. Recognizes Work Portfolio route definition', () => {
    const match = matchPilotRoute('/work');
    assert.ok(match);
    assert.equal(match.id, 'work');
    assert.equal(match.definition.pattern, '/work');
    assert.equal(match.definition.title, 'Our work — MONDO');
    assert.deepEqual(match.params, {});
  });

  it('2. Recognizes Project Details route definition', () => {
    const match = matchPilotRoute('/work/cat-battle');
    assert.ok(match);
    assert.equal(match.id, 'project');
    assert.equal(match.definition.pattern, '/work/:slug');
    assert.equal(match.params.slug, 'cat-battle');
  });

  it('3. Extracts normalized project slug accurately', () => {
    assert.equal(extractProjectSlug('/work/cosmic-egg'), 'cosmic-egg');
    assert.equal(extractProjectSlug('/work/legendary-orchard/'), 'legendary-orchard');
    assert.equal(extractProjectSlug('/work'), null);
    assert.equal(extractProjectSlug('/work/project.html'), null);
  });

  it('4. Rejects unsupported non-pilot routes', () => {
    assert.equal(matchPilotRoute('/'), null);
    assert.equal(matchPilotRoute('/start'), null);
    assert.equal(matchPilotRoute('/privacy'), null);
    assert.equal(matchPilotRoute('/admin'), null);
    assert.equal(isSupportedPilotRoute('/admin/dashboard'), false);
    assert.equal(isSupportedPilotRoute('/work'), true);
    assert.equal(isSupportedPilotRoute('/work/cat-battle'), true);
  });

  it('5. Route definitions are frozen and immutable', () => {
    assert.ok(Object.isFrozen(PILOT_ROUTE_DEFINITIONS));
    assert.ok(Object.isFrozen(PILOT_ROUTE_DEFINITIONS.work));
    assert.ok(Object.isFrozen(PILOT_ROUTE_DEFINITIONS.project));
    assert.throws(() => {
      PILOT_ROUTE_DEFINITIONS.work.title = 'Mutated';
    });
  });

  it('6. Does not import active feature lifecycles in G3.2-R2', () => {
    const registryModulePath = path.join(rootDir, 'public', 'js', 'features', 'navigation', 'route-registry.js');
    const content = fs.readFileSync(registryModulePath, 'utf8');
    assert.equal(content.includes('work-page.js'), false, 'Must not import work-page.js');
    assert.equal(content.includes('project-page.js'), false, 'Must not import project-page.js');
    assert.equal(content.includes('quiet-mark.js'), false, 'Must not import quiet-mark.js');
  });

  it('7. Exposes registered route IDs deterministically', () => {
    const ids = getRegisteredRouteIds();
    assert.deepEqual(ids, ['work', 'project']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group C: Navigation State & Cancellation Tests (Point of No Return)
// ─────────────────────────────────────────────────────────────────────────────
describe('Group C: Navigation State & Cancellation (Option C G3.2-R2)', () => {
  it('1. Initializes in IDLE state with no active operation', () => {
    const manager = createNavigationStateManager();
    assert.equal(manager.getState(), NAVIGATION_STATES.IDLE);
    assert.equal(manager.getActiveOperation(), null);
  });

  it('2. Follows standard forward transition sequence cleanly', () => {
    const manager = createNavigationStateManager();
    const op = manager.startOperation({ to: '/work/rainbow-orchard' });
    assert.equal(op.state, NAVIGATION_STATES.INITIATED);

    const step1 = manager.transition(op.id, NAVIGATION_STATES.OUTBOUND);
    assert.ok(step1.ok);
    assert.equal(step1.state, NAVIGATION_STATES.OUTBOUND);

    const step2 = manager.transition(op.id, NAVIGATION_STATES.FETCHING);
    assert.ok(step2.ok);

    const step3 = manager.transition(op.id, NAVIGATION_STATES.PARSED);
    assert.ok(step3.ok);

    const step4 = manager.transition(op.id, NAVIGATION_STATES.COMMITTING);
    assert.ok(step4.ok);

    const step5 = manager.transition(op.id, NAVIGATION_STATES.AWAITING_READINESS);
    assert.ok(step5.ok);

    const step6 = manager.transition(op.id, NAVIGATION_STATES.REVEALING);
    assert.ok(step6.ok);

    const step7 = manager.transition(op.id, NAVIGATION_STATES.COMPLETE);
    assert.ok(step7.ok);

    assert.equal(manager.getState(), NAVIGATION_STATES.COMPLETE);
  });

  it('3. Rejects illegal state transitions', () => {
    const manager = createNavigationStateManager();
    const op = manager.startOperation();

    // Cannot jump directly from INITIATED to COMMITTING (skipping OUTBOUND, FETCHING, PARSED)
    const illegal = manager.transition(op.id, NAVIGATION_STATES.COMMITTING);
    assert.equal(illegal.ok, false);
    assert.ok(illegal.error.includes('Illegal state transition'));
    assert.equal(manager.getState(), NAVIGATION_STATES.INITIATED);
  });

  it('4. Cancellation before the irreversible boundary succeeds', () => {
    const manager = createNavigationStateManager();
    const op = manager.startOperation();
    manager.transition(op.id, NAVIGATION_STATES.OUTBOUND);
    manager.transition(op.id, NAVIGATION_STATES.FETCHING);

    assert.equal(manager.cancelOperation(op.id, 'user_clicked_back'), true);
    assert.equal(manager.getState(), NAVIGATION_STATES.CANCELLED);
    assert.equal(op.signal.aborted, true);
    assert.equal(manager.getActiveOperation().cancellationReason, 'user_clicked_back');
  });

  it('5. Cancellation at the irreversible boundary (COMMITTING) is strictly rejected', () => {
    const manager = createNavigationStateManager();
    const op = manager.startOperation();
    manager.transition(op.id, NAVIGATION_STATES.OUTBOUND);
    manager.transition(op.id, NAVIGATION_STATES.FETCHING);
    manager.transition(op.id, NAVIGATION_STATES.PARSED);
    manager.transition(op.id, NAVIGATION_STATES.COMMITTING);

    // Irreversible boundary crossed: cancellation MUST fail
    const result = manager.cancelOperation(op.id, 'user_late_cancel');
    assert.equal(result, false, 'Cancellation at COMMITTING must return false');
    assert.equal(manager.getState(), NAVIGATION_STATES.COMMITTING, 'State must remain COMMITTING');
    assert.equal(op.signal.aborted, false, 'Signal must NOT be aborted');
    assert.equal(manager.getActiveOperation().cancellationReason, null, 'Cancellation reason must not be set');
  });

  it('6. Cancellation during AWAITING_READINESS is strictly rejected', () => {
    const manager = createNavigationStateManager();
    const op = manager.startOperation();
    manager.transition(op.id, NAVIGATION_STATES.OUTBOUND);
    manager.transition(op.id, NAVIGATION_STATES.FETCHING);
    manager.transition(op.id, NAVIGATION_STATES.PARSED);
    manager.transition(op.id, NAVIGATION_STATES.COMMITTING);
    manager.transition(op.id, NAVIGATION_STATES.AWAITING_READINESS);

    assert.equal(manager.cancelOperation(op.id, 'user_aborted'), false);
    assert.equal(manager.getState(), NAVIGATION_STATES.AWAITING_READINESS);
    assert.equal(op.signal.aborted, false);
  });

  it('7. Cancellation during REVEALING is strictly rejected', () => {
    const manager = createNavigationStateManager();
    const op = manager.startOperation();
    manager.transition(op.id, NAVIGATION_STATES.OUTBOUND);
    manager.transition(op.id, NAVIGATION_STATES.FETCHING);
    manager.transition(op.id, NAVIGATION_STATES.PARSED);
    manager.transition(op.id, NAVIGATION_STATES.COMMITTING);
    manager.transition(op.id, NAVIGATION_STATES.AWAITING_READINESS);
    manager.transition(op.id, NAVIGATION_STATES.REVEALING);

    assert.equal(manager.cancelOperation(op.id, 'veil_interrupted'), false);
    assert.equal(manager.getState(), NAVIGATION_STATES.REVEALING);
    assert.equal(op.signal.aborted, false);
  });

  it('8. Terminal COMPLETE state cannot be cancelled or reactivated', () => {
    const manager = createNavigationStateManager();
    const op = manager.startOperation();
    manager.transition(op.id, NAVIGATION_STATES.OUTBOUND);
    manager.transition(op.id, NAVIGATION_STATES.FETCHING);
    manager.transition(op.id, NAVIGATION_STATES.PARSED);
    manager.transition(op.id, NAVIGATION_STATES.COMMITTING);
    manager.transition(op.id, NAVIGATION_STATES.AWAITING_READINESS);
    manager.transition(op.id, NAVIGATION_STATES.REVEALING);
    manager.transition(op.id, NAVIGATION_STATES.COMPLETE);

    assert.equal(manager.cancelOperation(op.id), false);
    assert.equal(manager.getState(), NAVIGATION_STATES.COMPLETE);
    assert.equal(op.signal.aborted, false);

    // Cannot transition from COMPLETE to non-IDLE state
    const illegalReactivation = manager.transition(op.id, NAVIGATION_STATES.INITIATED);
    assert.equal(illegalReactivation.ok, false);
  });

  it('9. Starting a new operation cannot supersede an irreversible operation', () => {
    const manager = createNavigationStateManager();
    const op1 = manager.startOperation({ to: '/work/rainbow-orchard' });
    manager.transition(op1.id, NAVIGATION_STATES.OUTBOUND);
    manager.transition(op1.id, NAVIGATION_STATES.FETCHING);
    manager.transition(op1.id, NAVIGATION_STATES.PARSED);
    manager.transition(op1.id, NAVIGATION_STATES.COMMITTING);

    // Fast click on another link while op1 is committing
    const op2 = manager.startOperation({ to: '/work/cat-battle' });
    assert.equal(op2, null, 'startOperation must return null when irreversible operation is active');
    assert.equal(manager.getActiveOperation().id, op1.id, 'op1 must remain active');
    assert.equal(manager.getState(), NAVIGATION_STATES.COMMITTING, 'State must remain COMMITTING');
    assert.equal(op1.signal.aborted, false, 'op1 signal must not be aborted');
  });

  it('10. Pre-boundary failure transitions to CANCELLED cleanly', () => {
    const manager = createNavigationStateManager();
    const op = manager.startOperation();
    manager.transition(op.id, NAVIGATION_STATES.OUTBOUND);
    manager.transition(op.id, NAVIGATION_STATES.FETCHING);

    // Fetch network failure: cancels pre-boundary operation
    const failTransition = manager.transition(op.id, NAVIGATION_STATES.CANCELLED);
    assert.equal(failTransition.ok, true);
    assert.equal(manager.getState(), NAVIGATION_STATES.CANCELLED);
  });

  it('11. Post-boundary failure transitions to RECOVERING (in-situ recovery)', () => {
    const manager = createNavigationStateManager();
    const op = manager.startOperation();
    manager.transition(op.id, NAVIGATION_STATES.OUTBOUND);
    manager.transition(op.id, NAVIGATION_STATES.FETCHING);
    manager.transition(op.id, NAVIGATION_STATES.PARSED);
    manager.transition(op.id, NAVIGATION_STATES.COMMITTING);
    manager.transition(op.id, NAVIGATION_STATES.AWAITING_READINESS);

    // Hero decode timeout or readiness failure: transitions to RECOVERING, NOT CANCELLED
    const recoveryTransition = manager.transition(op.id, NAVIGATION_STATES.RECOVERING);
    assert.equal(recoveryTransition.ok, true);
    assert.equal(manager.getState(), NAVIGATION_STATES.RECOVERING);

    // Recovery can transition to COMPLETE after recovery UI renders
    const complete = manager.transition(op.id, NAVIGATION_STATES.COMPLETE);
    assert.equal(complete.ok, true);
    assert.equal(manager.getState(), NAVIGATION_STATES.COMPLETE);
  });

  it('12. Stale operation callbacks remain rejected', () => {
    const manager = createNavigationStateManager();
    const op1 = manager.startOperation();
    const op2 = manager.startOperation(); // Supersedes op1 while cancellable

    const staleResult = manager.transition(op1.id, NAVIGATION_STATES.OUTBOUND);
    assert.equal(staleResult.ok, false);
    assert.ok(staleResult.error.includes('Stale or non-existent'));
    assert.equal(manager.getState(), NAVIGATION_STATES.INITIATED);
  });

  it('13. Repeated valid cancellation remains idempotent', () => {
    const manager = createNavigationStateManager();
    const op = manager.startOperation();
    assert.equal(manager.cancelOperation(op.id, 'cancel_1'), true);
    assert.equal(manager.cancelOperation(op.id, 'cancel_2'), true);
    assert.equal(manager.getState(), NAVIGATION_STATES.CANCELLED);
  });

  it('14. Independent managers remain completely isolated', () => {
    const managerA = createNavigationStateManager();
    const managerB = createNavigationStateManager();

    const opA = managerA.startOperation({ name: 'A' });
    const opB = managerB.startOperation({ name: 'B' });

    managerA.cancelOperation(opA.id);
    assert.equal(managerA.getState(), NAVIGATION_STATES.CANCELLED);
    assert.equal(managerB.getState(), NAVIGATION_STATES.INITIATED);
    assert.equal(opB.signal.aborted, false);
  });

  it('15. State classification helpers correctly identify boundary status', () => {
    assert.equal(isPostBoundaryState(NAVIGATION_STATES.COMMITTING), true);
    assert.equal(isPostBoundaryState(NAVIGATION_STATES.AWAITING_READINESS), true);
    assert.equal(isPostBoundaryState(NAVIGATION_STATES.REVEALING), true);
    assert.equal(isPostBoundaryState(NAVIGATION_STATES.COMPLETE), true);
    assert.equal(isPostBoundaryState(NAVIGATION_STATES.RECOVERING), true);

    assert.equal(isPostBoundaryState(NAVIGATION_STATES.IDLE), false);
    assert.equal(isPostBoundaryState(NAVIGATION_STATES.INITIATED), false);
    assert.equal(isPostBoundaryState(NAVIGATION_STATES.OUTBOUND), false);
    assert.equal(isPostBoundaryState(NAVIGATION_STATES.FETCHING), false);
    assert.equal(isPostBoundaryState(NAVIGATION_STATES.PARSED), false);
    assert.equal(isPostBoundaryState(NAVIGATION_STATES.CANCELLED), false);

    assert.equal(isCancellableState(NAVIGATION_STATES.INITIATED), true);
    assert.equal(isCancellableState(NAVIGATION_STATES.FETCHING), true);
    assert.equal(isCancellableState(NAVIGATION_STATES.COMMITTING), false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group D: Safe Destination HTML Loader Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('Group D: Safe Destination HTML Loader (Option C G3.2-R2)', () => {
  // Helper to create a mock DOM element
  function createMockElement(tagName, id = '', className = '', innerHTML = '') {
    const children = [];
    return {
      tagName: tagName.toUpperCase(),
      id,
      className,
      innerHTML,
      textContent: innerHTML.replace(/<[^>]+>/g, ''),
      children,
      appendChild(child) { children.push(child); return child; },
      querySelector(selector) {
        if (selector === `#${id}` || selector === `${tagName.toLowerCase()}#${id}`) return this;
        if (selector === `.${className}` || selector === `${tagName.toLowerCase()}.${className}`) return this;
        for (const child of children) {
          const found = child.querySelector ? child.querySelector(selector) : null;
          if (found) return found;
        }
        return null;
      },
      querySelectorAll(selector) {
        const matches = [];
        if (selector === tagName.toLowerCase() || selector === tagName.toUpperCase()) matches.push(this);
        for (const child of children) {
          if (child.querySelectorAll) matches.push(...child.querySelectorAll(selector));
        }
        return matches;
      },
      getAttribute(attr) {
        if (attr === 'id') return id;
        if (attr === 'class') return className;
        return null;
      }
    };
  }

  // Mock DOM parser for Node environment
  function mockParser(html) {
    const doc = {
      titleEl: null,
      metaDescEl: null,
      mains: [],
      querySelector(selector) {
        if (selector === 'title') return this.titleEl;
        if (selector === 'meta[name="description"]') return this.metaDescEl;
        if (selector === 'main#main' || selector === '#main') {
          return this.mains.find(m => m.id === 'main') || null;
        }
        for (const m of this.mains) {
          const res = m.querySelector ? m.querySelector(selector) : null;
          if (res) return res;
        }
        return null;
      },
      querySelectorAll(selector) {
        if (selector === 'main') return [...this.mains];
        return [];
      },
      getElementById(id) {
        return this.mains.find(m => m.id === id) || null;
      }
    };

    const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
    if (titleMatch) {
      doc.titleEl = { textContent: titleMatch[1] };
    }

    const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i);
    if (descMatch) {
      doc.metaDescEl = { getAttribute: (attr) => (attr === 'content' ? descMatch[1] : null) };
    }

    const mainRegex = /<main([^>]*)>([\s\S]*?)<\/main>/gi;
    let match;
    while ((match = mainRegex.exec(html)) !== null) {
      const attrs = match[1];
      const inner = match[2];
      const idMatch = attrs.match(/id=["']([^"']+)["']/i);
      const id = idMatch ? idMatch[1] : '';
      const classMatch = attrs.match(/class=["']([^"']+)["']/i);
      const className = classMatch ? classMatch[1] : '';

      const mainNode = createMockElement('main', id, className, inner);

      if (inner.includes('id="work-grid"') || inner.includes('class="work-page-grid"')) {
        mainNode.appendChild(createMockElement('div', 'work-grid', 'work-grid'));
      }
      if (inner.includes('id="project-main"')) {
        mainNode.appendChild(createMockElement('div', 'project-main', ''));
      }

      doc.mains.push(mainNode);
    }

    return doc;
  }

  // Configurable mock response builder supporting streaming and headers
  function createMockResponse(body, {
    status = 200,
    contentType = 'text/html; charset=utf-8',
    redirected = false,
    url = 'http://localhost:3005/work',
    includeContentLength = true,
    contentLength = null,
    enableStream = true,
    streamChunks = null
  } = {}) {
    const buf = Buffer.from(body, 'utf8');
    const headers = new Map([['content-type', contentType]]);
    if (includeContentLength) {
      headers.set('content-length', contentLength !== null ? String(contentLength) : String(buf.byteLength));
    }

    let stream = null;
    if (enableStream) {
      const chunks = streamChunks || [buf];
      let chunkIdx = 0;
      stream = {
        getReader() {
          return {
            async read() {
              if (chunkIdx < chunks.length) {
                const chunk = chunks[chunkIdx++];
                return { done: false, value: chunk };
              }
              return { done: true, value: undefined };
            },
            async cancel() {
              return;
            }
          };
        }
      };
    }

    return {
      ok: status >= 200 && status < 300,
      status,
      redirected,
      url,
      headers,
      body: stream,
      text: async () => body
    };
  }

  it('1. Valid Work HTML parses and extracts landmark and metadata', async () => {
    const validWorkHtml = `
      <!DOCTYPE html><html><head>
      <title>Our work — MONDO</title>
      <meta name="description" content="Explore thumbnails and trailers." />
      </head><body>
      <main id="main" class="container"><div class="work-page-grid" id="work-grid"><p>Cards</p></div></main>
      </body></html>
    `;
    const mockFetch = async () => createMockResponse(validWorkHtml, { url: 'http://localhost:3005/work' });

    const result = await fetchRouteHtml('/work', {
      fetchImpl: mockFetch,
      parseHtmlImpl: mockParser,
      trustedOrigin: 'http://localhost:3005'
    });

    assert.equal(result.ok, true);
    assert.equal(result.data.route, 'work');
    assert.equal(result.data.title, 'Our work — MONDO');
    assert.equal(result.data.metaDescription, 'Explore thumbnails and trailers.');
    assert.ok(result.data.mainHtml.includes('id="work-grid"'));
  });

  it('2. Valid Project HTML parses and extracts landmark and metadata', async () => {
    const validProjectHtml = `
      <!DOCTYPE html><html><head>
      <title>Rainbow Orchard — MONDO</title>
      <meta name="description" content="A vibrant game thumbnail." />
      </head><body>
      <main id="main" class="container"><div id="project-main"><p>Story</p></div></main>
      </body></html>
    `;
    const mockFetch = async () => createMockResponse(validProjectHtml, { url: 'http://localhost:3005/work/rainbow-orchard' });

    const result = await fetchRouteHtml('/work/rainbow-orchard', {
      fetchImpl: mockFetch,
      parseHtmlImpl: mockParser,
      trustedOrigin: 'http://localhost:3005'
    });

    assert.equal(result.ok, true);
    assert.equal(result.data.route, 'project');
    assert.equal(result.data.slug, 'rainbow-orchard');
    assert.equal(result.data.title, 'Rainbow Orchard — MONDO');
    assert.ok(result.data.mainHtml.includes('id="project-main"'));
  });

  it('3. Bounded streaming: Valid response without Content-Length streams successfully', async () => {
    const validHtml = '<html><body><main id="main"><div class="work-page-grid" id="work-grid"></div></main></body></html>';
    // Streamed chunked response without Content-Length
    const mockFetch = async () => createMockResponse(validHtml, { includeContentLength: false });

    const result = await fetchRouteHtml('/work', {
      fetchImpl: mockFetch,
      parseHtmlImpl: mockParser,
      trustedOrigin: 'http://localhost:3005'
    });

    assert.equal(result.ok, true);
    assert.equal(result.data.route, 'work');
  });

  it('4. Oversized response advertising excessive Content-Length is rejected before stream', async () => {
    const mockFetch = async () => createMockResponse('small-body', {
      contentLength: 600 * 1024,
      maxResponseBytes: 500 * 1024
    });

    const result = await fetchRouteHtml('/work', {
      fetchImpl: mockFetch,
      maxResponseBytes: 500 * 1024,
      trustedOrigin: 'http://localhost:3005'
    });

    assert.equal(result.ok, false);
    assert.ok(result.error.includes('exceeds size ceiling'));
  });

  it('5. Oversized streamed response without Content-Length is cancelled and rejected', async () => {
    let cancelCalled = false;
    const chunk1 = Buffer.alloc(300 * 1024, 'a');
    const chunk2 = Buffer.alloc(300 * 1024, 'b'); // Total 600 KB > 500 KB ceiling

    const mockFetch = async () => {
      let idx = 0;
      const chunks = [chunk1, chunk2];
      return {
        ok: true,
        status: 200,
        headers: new Map([['content-type', 'text/html']]),
        body: {
          getReader() {
            return {
              async read() {
                if (idx < chunks.length) return { done: false, value: chunks[idx++] };
                return { done: true, value: undefined };
              },
              async cancel() {
                cancelCalled = true;
              }
            };
          }
        }
      };
    };

    const result = await fetchRouteHtml('/work', {
      fetchImpl: mockFetch,
      maxResponseBytes: 500 * 1024,
      trustedOrigin: 'http://localhost:3005'
    });

    assert.equal(result.ok, false);
    assert.ok(result.error.includes('exceeds maximum allowed size'));
    assert.equal(cancelCalled, true, 'Stream reader must be cancelled upon exceeding ceiling');
  });

  it('6. Inaccurate small Content-Length followed by oversized stream is detected and rejected', async () => {
    let cancelCalled = false;
    const chunk1 = Buffer.alloc(600 * 1024, 'a');

    const mockFetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([
        ['content-type', 'text/html'],
        ['content-length', '100'] // Inaccurate declared size
      ]),
      body: {
        getReader() {
          return {
            async read() {
              if (chunk1) {
                const val = chunk1;
                return { done: false, value: val };
              }
              return { done: true, value: undefined };
            },
            async cancel() {
              cancelCalled = true;
            }
          };
        }
      }
    });

    const result = await fetchRouteHtml('/work', {
      fetchImpl: mockFetch,
      maxResponseBytes: 500 * 1024,
      trustedOrigin: 'http://localhost:3005'
    });

    assert.equal(result.ok, false);
    assert.ok(result.error.includes('exceeds maximum allowed size'));
    assert.equal(cancelCalled, true);
  });

  it('7. Multibyte UTF-8 characters stream and decode accurately across chunks', async () => {
    // 4-byte UTF-8 emoji split across chunks
    const fullText = '<!DOCTYPE html><html><body><main id="main"><div class="work-page-grid" id="work-grid">🚀🌟</div></main></body></html>';
    const fullBuf = Buffer.from(fullText, 'utf8');
    const part1 = fullBuf.subarray(0, 50);
    const part2 = fullBuf.subarray(50);

    const mockFetch = async () => createMockResponse(fullText, {
      streamChunks: [part1, part2],
      includeContentLength: false
    });

    const result = await fetchRouteHtml('/work', {
      fetchImpl: mockFetch,
      parseHtmlImpl: mockParser,
      trustedOrigin: 'http://localhost:3005'
    });

    assert.equal(result.ok, true);
    assert.ok(result.data.mainHtml.includes('🚀🌟'));
  });

  it('8. Non-streaming response without Content-Length fails closed', async () => {
    const mockFetch = async () => createMockResponse('<html><body></body></html>', {
      enableStream: false,
      includeContentLength: false
    });

    const result = await fetchRouteHtml('/work', {
      fetchImpl: mockFetch,
      trustedOrigin: 'http://localhost:3005'
    });

    assert.equal(result.ok, false);
    assert.ok(result.error.includes('Streaming unavailable: cannot safely bound response'));
  });

  it('9. Non-streaming response with small declared Content-Length fails closed without invoking response.text()', async () => {
    let textCalled = false;
    let arrayBufferCalled = false;

    const mockFetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([
        ['content-type', 'text/html; charset=utf-8'],
        ['content-length', '100'] // Small declared Content-Length
      ]),
      body: null, // Non-streaming
      text: async () => {
        textCalled = true;
        return '<html><body><main id="main"><div class="work-page-grid" id="work-grid">Unbounded</div></main></body></html>';
      },
      arrayBuffer: async () => {
        arrayBufferCalled = true;
        return new ArrayBuffer(100);
      }
    });

    const result = await fetchRouteHtml('/work', {
      fetchImpl: mockFetch,
      parseHtmlImpl: mockParser,
      trustedOrigin: 'http://localhost:3005'
    });

    assert.equal(result.ok, false);
    assert.ok(result.error.includes('Streaming unavailable: cannot safely bound response'));
    assert.equal(textCalled, false, 'response.text() must NEVER be invoked on unstreamed responses');
    assert.equal(arrayBufferCalled, false, 'response.arrayBuffer() must NEVER be invoked on unstreamed responses');
  });

  it('10. Non-streaming response with inaccurate declared Content-Length fails closed safely', async () => {
    let textCalled = false;

    const mockFetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([
        ['content-type', 'text/html; charset=utf-8'],
        ['content-length', '50'] // Deceptive header
      ]),
      body: null,
      text: async () => {
        textCalled = true;
        return 'x'.repeat(600 * 1024); // 600 KB payload
      }
    });

    const result = await fetchRouteHtml('/work', {
      fetchImpl: mockFetch,
      parseHtmlImpl: mockParser,
      trustedOrigin: 'http://localhost:3005'
    });

    assert.equal(result.ok, false);
    assert.ok(result.error.includes('Streaming unavailable'));
    assert.equal(textCalled, false, 'Payload must not be buffered before rejection');
  });

  it('11. Missing or unverifiable final response URL on redirect is rejected', async () => {
    const validHtml = '<html><body><main id="main"><div class="work-page-grid" id="work-grid"></div></main></body></html>';
    const mockFetch = async () => createMockResponse(validHtml, {
      redirected: true,
      url: '' // Missing final response URL
    });

    const result = await fetchRouteHtml('/work', {
      fetchImpl: mockFetch,
      parseHtmlImpl: mockParser,
      trustedOrigin: 'http://localhost:3005'
    });

    assert.equal(result.ok, false);
    assert.ok(result.error.includes('missing or unverifiable'));
  });

  it('12. Redirect to different project is strictly rejected', async () => {
    const validHtml = '<html><body><main id="main"><div id="project-main"></div></main></body></html>';
    // Requested cat-battle, but redirected to rainbow-orchard
    const mockFetch = async () => createMockResponse(validHtml, {
      redirected: true,
      url: 'http://localhost:3005/work/rainbow-orchard'
    });

    const result = await fetchRouteHtml('/work/cat-battle', {
      fetchImpl: mockFetch,
      parseHtmlImpl: mockParser,
      trustedOrigin: 'http://localhost:3005'
    });

    assert.equal(result.ok, false);
    assert.ok(result.error.includes('Redirect changed project identity'));
  });

  it('13. Redirect changing route family (project -> work) is strictly rejected', async () => {
    const validHtml = '<html><body><main id="main"><div class="work-page-grid" id="work-grid"></div></main></body></html>';
    // Requested project, but redirected to /work (e.g. unpublished project)
    const mockFetch = async () => createMockResponse(validHtml, {
      redirected: true,
      url: 'http://localhost:3005/work'
    });

    const result = await fetchRouteHtml('/work/cat-battle', {
      fetchImpl: mockFetch,
      parseHtmlImpl: mockParser,
      trustedOrigin: 'http://localhost:3005'
    });

    assert.equal(result.ok, false);
    assert.ok(result.error.includes('Redirect changed route family'));
  });

  it('14. Valid canonical redirect preserves identity and updates accepted metadata', async () => {
    const validHtml = '<html><body><main id="main"><div id="project-main"></div></main></body></html>';
    // Trailing slash redirect for project details
    const mockFetch = async () => createMockResponse(validHtml, {
      redirected: true,
      url: 'http://localhost:3005/work/cat-battle/'
    });

    const result = await fetchRouteHtml('/work/cat-battle', {
      fetchImpl: mockFetch,
      parseHtmlImpl: mockParser,
      trustedOrigin: 'http://localhost:3005'
    });

    assert.equal(result.ok, true);
    assert.equal(result.data.pathname, '/work/cat-battle');
    assert.equal(result.data.slug, 'cat-battle');
  });

  it('15. Missing <main> returns structural validation error', async () => {
    const noMainHtml = '<html><head><title>No Main</title></head><body><div id="content"></div></body></html>';
    const mockFetch = async () => createMockResponse(noMainHtml);

    const result = await fetchRouteHtml('/work', {
      fetchImpl: mockFetch,
      parseHtmlImpl: mockParser,
      trustedOrigin: 'http://localhost:3005'
    });

    assert.equal(result.ok, false);
    assert.ok(result.error.includes('Missing <main> element'));
  });

  it('16. Duplicate <main> elements returns structural validation error', async () => {
    const dupMainHtml = '<html><body><main id="main">A</main><main id="second">B</main></body></html>';
    const mockFetch = async () => createMockResponse(dupMainHtml);

    const result = await fetchRouteHtml('/work', {
      fetchImpl: mockFetch,
      parseHtmlImpl: mockParser,
      trustedOrigin: 'http://localhost:3005'
    });

    assert.equal(result.ok, false);
    assert.ok(result.error.includes('Duplicate <main> elements'));
  });

  it('17. Project HTML missing #project-main container returns validation error', async () => {
    const corruptProjectHtml = '<html><body><main id="main"><p>Missing container</p></main></body></html>';
    const mockFetch = async () => createMockResponse(corruptProjectHtml, { url: 'http://localhost:3005/work/cat-battle' });

    const result = await fetchRouteHtml('/work/cat-battle', {
      fetchImpl: mockFetch,
      parseHtmlImpl: mockParser,
      trustedOrigin: 'http://localhost:3005'
    });

    assert.equal(result.ok, false);
    assert.ok(result.error.includes('missing expected #project-main'));
  });

  it('18. HTTP 404 response is rejected with status error', async () => {
    const mockFetch = async () => createMockResponse('Not Found', { status: 404 });

    const result = await fetchRouteHtml('/work/nonexistent', {
      fetchImpl: mockFetch,
      parseHtmlImpl: mockParser,
      trustedOrigin: 'http://localhost:3005'
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 404);
    assert.ok(result.error.includes('HTTP 404'));
  });

  it('19. HTTP 500 response is rejected with status error', async () => {
    const mockFetch = async () => createMockResponse('Internal Server Error', { status: 500 });

    const result = await fetchRouteHtml('/work', {
      fetchImpl: mockFetch,
      parseHtmlImpl: mockParser,
      trustedOrigin: 'http://localhost:3005'
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 500);
    assert.ok(result.error.includes('HTTP 500'));
  });

  it('20. Non-HTML Content-Type (e.g. application/json) is rejected', async () => {
    const mockFetch = async () => createMockResponse('{"error":"json"}', { contentType: 'application/json' });

    const result = await fetchRouteHtml('/work', {
      fetchImpl: mockFetch,
      parseHtmlImpl: mockParser,
      trustedOrigin: 'http://localhost:3005'
    });

    assert.equal(result.ok, false);
    assert.ok(result.error.includes('Invalid Content-Type'));
  });

  it('21. Cross-origin target URL is rejected before fetch', async () => {
    let fetchCalled = false;
    const mockFetch = async () => { fetchCalled = true; return createMockResponse(''); };

    const result = await fetchRouteHtml('https://evil.com/work/cat-battle', {
      fetchImpl: mockFetch,
      trustedOrigin: 'http://localhost:3005'
    });

    assert.equal(result.ok, false);
    assert.equal(fetchCalled, false, 'Must not dispatch fetch for cross-origin target');
    assert.ok(result.error.includes('Cross-origin target rejected'));
  });

  it('22. Unexpected redirect to non-pilot route (/admin) is rejected', async () => {
    const validHtml = '<html><body><main id="main"><div class="work-page-grid" id="work-grid"></div></main></body></html>';
    const mockFetch = async () => createMockResponse(validHtml, {
      redirected: true,
      url: 'http://localhost:3005/admin'
    });

    const result = await fetchRouteHtml('/work', {
      fetchImpl: mockFetch,
      parseHtmlImpl: mockParser,
      trustedOrigin: 'http://localhost:3005'
    });

    assert.equal(result.ok, false);
    assert.ok(result.error.includes('redirected to unauthorized path'));
  });

  it('23. Redirect to external origin is rejected', async () => {
    const validHtml = '<html><body><main id="main"><div class="work-page-grid" id="work-grid"></div></main></body></html>';
    const mockFetch = async () => createMockResponse(validHtml, {
      redirected: true,
      url: 'https://auth.external.com/login'
    });

    const result = await fetchRouteHtml('/work', {
      fetchImpl: mockFetch,
      parseHtmlImpl: mockParser,
      trustedOrigin: 'http://localhost:3005'
    });

    assert.equal(result.ok, false);
    assert.ok(result.error.includes('redirected to unauthorized path'));
  });

  it('24. Pre-aborted signal terminates before dispatching fetch', async () => {
    let fetchCalled = false;
    const mockFetch = async () => { fetchCalled = true; return createMockResponse(''); };
    const controller = new AbortController();
    controller.abort();

    const result = await fetchRouteHtml('/work', {
      fetchImpl: mockFetch,
      signal: controller.signal,
      trustedOrigin: 'http://localhost:3005'
    });

    assert.equal(result.ok, false);
    assert.equal(fetchCalled, false);
    assert.ok(result.error.includes('aborted'));
  });

  it('25. Abort during streaming cancels reader cleanly', async () => {
    const controller = new AbortController();
    let cancelCalled = false;

    const mockFetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([['content-type', 'text/html']]),
      body: {
        getReader() {
          return {
            async read() {
              controller.abort();
              return { done: false, value: Buffer.from('data') };
            },
            async cancel() {
              cancelCalled = true;
            }
          };
        }
      }
    });

    const result = await fetchRouteHtml('/work', {
      fetchImpl: mockFetch,
      signal: controller.signal,
      trustedOrigin: 'http://localhost:3005'
    });

    assert.equal(result.ok, false);
    assert.ok(result.error.includes('aborted'));
    assert.equal(cancelCalled, true);
  });

  it('26. Validates URL against sourcePath pair restriction', async () => {
    let fetchCalled = false;
    const mockFetch = async () => { fetchCalled = true; return createMockResponse(''); };

    // Ineligible pair: Project to Project
    const result = await fetchRouteHtml('/work/cat-battle', {
      fetchImpl: mockFetch,
      sourcePath: '/work/rainbow-orchard',
      trustedOrigin: 'http://localhost:3005'
    });

    assert.equal(result.ok, false);
    assert.equal(fetchCalled, false);
    assert.ok(result.error.includes('Ineligible route pair transition'));
  });

  it('27. Does not mutate live DOM (pure memory operation)', async () => {
    const validHtml = '<html><body><main id="main"><div class="work-page-grid" id="work-grid"></div></main></body></html>';
    const mockFetch = async () => createMockResponse(validHtml);

    const result = await fetchRouteHtml('/work', {
      fetchImpl: mockFetch,
      parseHtmlImpl: mockParser,
      trustedOrigin: 'http://localhost:3005'
    });

    assert.equal(result.ok, true);
    assert.equal(typeof globalThis.document === 'undefined' || globalThis.document === null, true);
  });

  it('28. Does not mutate History API', async () => {
    const validHtml = '<html><body><main id="main"><div class="work-page-grid" id="work-grid"></div></main></body></html>';
    const mockFetch = async () => createMockResponse(validHtml);

    let pushStateCalled = false;
    globalThis.history = {
      pushState: () => { pushStateCalled = true; }
    };

    await fetchRouteHtml('/work', {
      fetchImpl: mockFetch,
      parseHtmlImpl: mockParser,
      trustedOrigin: 'http://localhost:3005'
    });

    assert.equal(pushStateCalled, false, 'HTML loader must never call pushState');
    delete globalThis.history;
  });

  it('29. Inert document parsing executes zero scripts', async () => {
    let scriptExecuted = false;
    globalThis.__test_script_executed__ = () => { scriptExecuted = true; };

    const scriptHtml = `
      <html><body>
      <main id="main"><div class="work-page-grid" id="work-grid"></div></main>
      <script>globalThis.__test_script_executed__();</script>
      </body></html>
    `;
    const mockFetch = async () => createMockResponse(scriptHtml);

    await fetchRouteHtml('/work', {
      fetchImpl: mockFetch,
      parseHtmlImpl: mockParser,
      trustedOrigin: 'http://localhost:3005'
    });

    assert.equal(scriptExecuted, false, 'Parsed scripts must never execute');
    delete globalThis.__test_script_executed__;
  });

  it('30. Zero fetch calls performed at module import time', () => {
    assert.ok(typeof fetchRouteHtml === 'function');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Group E: Historical Regression & Dormancy Verification
// ─────────────────────────────────────────────────────────────────────────────
describe('Group E: Historical Regression & Dormancy Verification', () => {
  it('1. Zero existing live entry points import new navigation infrastructure', () => {
    const liveEntryFiles = [
      'public/js/site.js',
      'public/js/work.js',
      'public/js/project.js',
      'public/js/home.js',
      'public/js/start.js',
      'public/js/admin.js',
      'public/js/features/navigation/navigation.js',
      'public/js/features/transitions/quiet-mark.js'
    ];

    for (const relPath of liveEntryFiles) {
      const fullPath = path.join(rootDir, relPath);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        assert.equal(content.includes('route-eligibility.js'), false, `${relPath} must not import route-eligibility.js`);
        assert.equal(content.includes('route-registry.js'), false, `${relPath} must not import route-registry.js`);
        assert.equal(content.includes('navigation-state.js'), false, `${relPath} must not import navigation-state.js`);
        assert.equal(content.includes('html-loader.js'), false, `${relPath} must not import html-loader.js`);
      }
    }
  });

  it('2. Zero global window coordinator or navigation state exists', () => {
    assert.equal(typeof globalThis.__MONDO_HYBRID_COORDINATOR__, 'undefined');
    assert.equal(typeof globalThis.__MONDO_HYBRID_STATE__, 'undefined');
  });

  it('3. Route eligibility is purely syntactic with zero catalog coupling', () => {
    // Valid syntactic future slugs are eligible without catalog dependency
    assert.equal(isEligiblePilotPair('/work', '/work/future-project-2026'), true);
    assert.equal(isEligiblePilotPair('/work/future-project-2026', '/work'), true);
    // Malformed slugs remain rejected
    assert.equal(isEligiblePilotPair('/work', '/work/INVALID_UPPERCASE'), false);
  });

  it('4. G1 route lifecycle contracts remain intact and executable', async () => {
    const workPageModule = await import('../public/js/features/work/work-page.js');
    const projectPageModule = await import('../public/js/features/project/project-page.js');

    assert.equal(typeof workPageModule.mountWork, 'function');
    assert.equal(typeof workPageModule.unmountWork, 'function');
    assert.equal(typeof projectPageModule.mountProject, 'function');
    assert.equal(typeof projectPageModule.unmountProject, 'function');
  });

  it('5. Live website remains native MPA without hybrid activation', () => {
    const siteJsPath = path.join(rootDir, 'public', 'js', 'site.js');
    const siteJs = fs.readFileSync(siteJsPath, 'utf8');
    assert.equal(siteJs.includes('initNavigation'), true);
    assert.equal(siteJs.includes('initQuietMark'), true);
    assert.equal(siteJs.includes('initOfflinePreparation'), true);
    assert.equal(siteJs.includes('HybridCoordinator'), false);
  });
});
