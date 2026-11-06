import { icons } from '../../shared/icons.js';
import { escapeHtml } from '../../shared/dom.js';
import { track, loadPublicContent } from '../../shared/api.js';
import { renderProjectCard, LOCAL_PROJECTS } from '../work/card.js';
import { defaultProjects } from '../../shared/defaults.js';
import {
  createReadinessCoordinator,
  waitForImageDecode,
  waitForVideoReady
} from '../../shared/readiness.js';

/**
 * Pure helper parsing the project slug from URL pathname or search parameters.
 * Supports /work/:slug as well as ?slug=:slug.
 * @param {string} [pathname]
 * @param {string} [search]
 * @returns {string} Project slug
 */
export function getSlugFromPath(
  pathname = (typeof window !== 'undefined' ? window.location.pathname : ''),
  search = (typeof window !== 'undefined' ? window.location.search : '')
) {
  const path = (pathname || '').replace(/\/$/, '');
  const parts = path.split('/');
  if (parts.length >= 3 && parts[1] === 'work' && parts[2] !== 'project.html' && parts[2] !== 'index.html') {
    return parts[2];
  }
  const params = new URLSearchParams(search || '');
  return params.get('slug') || '';
}

const PILOT_STATUS_COPY = 'LOADING PROJECT DETAILS…';
let activeProjectOperationId = 0;
let activeProjectAbortController = null;
let activeTrackedSlug = null;
let activeTrackedOpId = null;

/**
 * Compares two project records for visual rendering equivalence.
 * Returns true if all rendered fields (title, category, concept, image, video,
 * description, objective, hook, role) are identical.
 * @param {object|null} a
 * @param {object|null} b
 * @returns {boolean}
 */
export function areProjectsEquivalent(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;

  return (
    a.id === b.id &&
    a.slug === b.slug &&
    a.title === b.title &&
    a.category === b.category &&
    Boolean(a.concept) === Boolean(b.concept) &&
    a.image === b.image &&
    (a.video || '') === (b.video || '') &&
    a.description === b.description &&
    (a.objective || '') === (b.objective || '') &&
    (a.hook || '') === (b.hook || '') &&
    (a.role || '') === (b.role || '')
  );
}

/**
 * Compares the related projects slice (up to 3 other projects) for rendering equivalence.
 * @param {Array<object>} listA
 * @param {Array<object>} listB
 * @param {string} currentId
 * @returns {boolean}
 */
export function areRelatedProjectsEquivalent(listA, listB, currentId) {
  if (listA === listB) return true;
  if (!Array.isArray(listA) || !Array.isArray(listB)) return false;

  const othersA = listA.filter((x) => x && x.id !== currentId).slice(0, 3);
  const othersB = listB.filter((x) => x && x.id !== currentId).slice(0, 3);

  if (othersA.length !== othersB.length) return false;
  for (let i = 0; i < othersA.length; i++) {
    const a = othersA[i];
    const b = othersB[i];
    if (
      a.id !== b.id ||
      a.slug !== b.slug ||
      a.title !== b.title ||
      a.category !== b.category ||
      a.image !== b.image ||
      (a.video || '') !== (b.video || '') ||
      Boolean(a.concept) !== Boolean(b.concept)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Dispatches the project_open view tracking event exactly once per project visit/mount.
 * Safe against concurrent calls, multiple render passes, and API data reconciliation.
 * @param {string} slug
 * @param {object} [options]
 * @param {Function} [options.trackEvent=track]
 * @param {boolean} [options.force=false]
 * @returns {boolean} Whether the event was dispatched
 */
export function trackProjectView(slug, { trackEvent = track, force = false } = {}) {
  if (!slug) return false;
  if (!force && activeTrackedSlug === slug && activeTrackedOpId === activeProjectOperationId) {
    return false;
  }
  activeTrackedSlug = slug;
  activeTrackedOpId = activeProjectOperationId;
  try {
    trackEvent('project_open', slug);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Resets the project view tracking state (primarily for unmount and test harnesses).
 */
export function resetProjectTrackingState() {
  activeTrackedSlug = null;
  activeTrackedOpId = null;
}

/**
 * Resolves or creates the non-destructive #project-error-host container inside #project-main
 * so watchdog or transient network errors never destroy #project-intro-wrap, #project-media,
 * #project-story, or #explore-grid.
 * @param {Document|HTMLElement} root
 * @param {HTMLElement|null} main
 * @returns {HTMLElement|null}
 */
function resolveErrorHost(root, main) {
  if (!main) return null;
  let host = (root && root.getElementById)
    ? root.getElementById('project-error-host')
    : (main.querySelector ? main.querySelector('#project-error-host') : null);
  if (host) return host;

  const hasSubContainers = Boolean(
    (root && root.getElementById && root.getElementById('project-intro-wrap')) ||
    (main.querySelector && main.querySelector('#project-intro-wrap'))
  );
  if (hasSubContainers && typeof document !== 'undefined' && typeof document.createElement === 'function' && typeof main.insertBefore === 'function') {
    host = document.createElement('div');
    host.id = 'project-error-host';
    host.className = 'project-error-host';
    main.insertBefore(host, main.firstChild || null);
    return host;
  }
  return main;
}

/**
 * Clears any temporary non-destructive error or not-found state without stealing focus.
 * @param {Document|HTMLElement} [root=document]
 */
export function clearProjectErrorState(root = document) {
  if (!root) return;
  const main = root.getElementById
    ? root.getElementById('project-main')
    : (typeof root.querySelector === 'function' ? root.querySelector('#project-main') : null);
  if (main && main.classList) {
    main.classList.remove('has-project-error', 'has-project-not-found');
  }
  const docEl = (root && root.documentElement) || (typeof document !== 'undefined' ? document.documentElement : null);
  if (docEl && docEl.classList) {
    docEl.classList.remove('is-project-pilot-error');
  }
  const host = root.getElementById
    ? root.getElementById('project-error-host')
    : (main && typeof main.querySelector === 'function' ? main.querySelector('#project-error-host') : null);
  if (host && host !== main) {
    host.hidden = true;
    host.innerHTML = '';
  }
  if (typeof window !== 'undefined' && window.__MONDO_WATCHDOG_FIRED__) {
    window.__MONDO_WATCHDOG_FIRED__ = false;
    window.__MONDO_LATE_RECOVERED__ = true;
  }
}

/**
 * Awaits the pilot stylesheet readiness (if #mondo-main-stylesheet is present in the document)
 * with a bounded timeout so unstyled project content is never revealed while CSS is pending.
 * @param {Document|HTMLElement} root
 * @param {number} [timeoutMs=3500]
 * @returns {Promise<{ status: string }>}
 */
export function waitForStylesheetReady(root = document, timeoutMs = 3500) {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return Promise.resolve({ status: 'no_document' });
  }
  const linkEl = root && root.getElementById ? root.getElementById('mondo-main-stylesheet') : document.getElementById('mondo-main-stylesheet');
  if (!linkEl) {
    return Promise.resolve({ status: 'no_stylesheet_guard' });
  }
  if (
    window.__MONDO_CSS_READY__ ||
    (document.documentElement && document.documentElement.classList && document.documentElement.classList.contains('is-project-css-ready'))
  ) {
    if (linkEl.media !== 'all') linkEl.media = 'all';
    return Promise.resolve({ status: 'ready' });
  }

  return new Promise((resolve) => {
    let settled = false;
    let timerId = null;
    const finish = (status) => {
      if (settled) return;
      settled = true;
      if (timerId) clearTimeout(timerId);
      window.removeEventListener('mondo:css-ready', onCssReady);
      if (linkEl.media !== 'all') linkEl.media = 'all';
      if (document.documentElement && document.documentElement.classList) {
        document.documentElement.classList.add('is-project-css-ready');
      }
      resolve({ status });
    };
    const onCssReady = () => finish('ready');
    window.addEventListener('mondo:css-ready', onCssReady, { once: true });
    if (typeof linkEl.addEventListener === 'function') {
      linkEl.addEventListener('load', () => finish('loaded'), { once: true });
      linkEl.addEventListener('error', () => finish('error'), { once: true });
    }
    timerId = setTimeout(() => finish('timeout'), timeoutMs);
  });
}

/**
 * Renders the 404 Project Not Found state non-destructively.
 * @param {Document|HTMLElement} [root=document]
 */
export function renderNotFound(root = document) {
  if (typeof document !== 'undefined') {
    document.title = 'Project not found — MONDO';
  }
  const main = root.getElementById ? root.getElementById('project-main') : root.querySelector('#project-main');
  if (main) {
    const target = resolveErrorHost(root, main);
    if (main.classList) {
      main.classList.remove('has-project-error');
      main.classList.add('has-project-not-found');
    }
    const docEl = (root && root.documentElement) || (typeof document !== 'undefined' ? document.documentElement : null);
    if (docEl && docEl.classList) {
      docEl.classList.add('is-project-pilot-error');
    }
    if (target !== main) {
      target.hidden = false;
    }
    target.innerHTML = `
      <div class="not-found" style="text-align: center; padding: 100px 0;">
        <p class="eyebrow"><span class="lime-dot"></span> 404</p>
        <h1>Project not found.</h1>
        <p class="muted">The project you are looking for does not exist or has been moved.</p>
        <a class="button" href="/work">Back to our work ${icons.arrowUpRight(18)}</a>
      </div>
    `;
  }
}

/**
 * Renders the recoverable connection error state for custom project lookups non-destructively.
 * Prevents treating transient network or API failures as confirmed 404s and preserves
 * #project-intro-wrap, #project-media, #project-story, and #explore-grid for late recovery or retry.
 * @param {Document|HTMLElement} [root=document]
 * @param {object} [options]
 * @param {Function} [options.onRetry]
 * @param {string} [options.message]
 */
export function renderErrorState(root = document, { onRetry = null, message = '' } = {}) {
  if (typeof document !== 'undefined') {
    document.title = 'Unable to load project — MONDO';
  }
  const main = root.getElementById ? root.getElementById('project-main') : root.querySelector('#project-main');
  if (main) {
    const target = resolveErrorHost(root, main);
    if (main.classList) {
      main.classList.remove('has-project-not-found');
      main.classList.add('has-project-error');
    }
    const docEl = (root && root.documentElement) || (typeof document !== 'undefined' ? document.documentElement : null);
    if (docEl && docEl.classList) {
      docEl.classList.add('is-project-pilot-error');
    }
    if (target !== main) {
      target.hidden = false;
    }

    const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
    const isUserInteractingInsideError = Boolean(
      activeEl &&
      target &&
      typeof target.contains === 'function' &&
      target.contains(activeEl) &&
      activeEl !== target
    );

    target.innerHTML = `
      <div class="project-error-state" role="alert" tabindex="-1" style="text-align: center; padding: 100px 20px;">
        <p class="eyebrow"><span class="lime-dot"></span> CONNECTION ISSUE</p>
        <h1>Unable to load project.</h1>
        <p class="muted" style="max-width: 480px; margin: 16px auto 32px;">${escapeHtml(message || 'We encountered a problem loading this project brief. Your connection may be offline or interrupted.')}</p>
        <div style="display: flex; gap: 16px; justify-content: center; flex-wrap: wrap;">
          <button class="button" id="project-retry-btn" type="button">Try again</button>
          <a class="button button-outline" href="/work">Back to our work</a>
        </div>
      </div>
    `;
    const errContainer = target.querySelector ? target.querySelector('.project-error-state') : main.querySelector('.project-error-state');
    if (errContainer && typeof errContainer.focus === 'function' && !isUserInteractingInsideError) {
      if (typeof errContainer.setAttribute === 'function') {
        errContainer.setAttribute('data-focus-managed', 'true');
      }
      try {
        errContainer.focus();
      } catch (_) {}
      if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(() => {
          const currentActive = typeof document !== 'undefined' ? document.activeElement : null;
          if (!currentActive || currentActive === document.body || currentActive === errContainer) {
            try { errContainer.focus(); } catch (_) {}
          }
        });
      }
    }
    const retryBtn = target.querySelector ? target.querySelector('#project-retry-btn') : main.querySelector('#project-retry-btn');
    if (retryBtn && typeof onRetry === 'function') {
      retryBtn.addEventListener('click', onRetry);
    }
  }
}

/**
 * Renders the complete project detail page layout across 4 sections:
 * 1. Intro header row with authentic marks and CTA
 * 2. Large media element (video trailer with play event tracking, or high-priority image)
 * 3. Story, description, concept note, and facts grid
 * 4. Keep Exploring related project cards
 *
 * @param {object|null} p - Project record or null if not found
 * @param {Array<object>} allProjects - All available projects for related cards
 * @param {object} [options]
 * @param {Document|HTMLElement} [options.root=document]
 * @param {Function} [options.trackEvent=track]
 * @param {boolean} [options.trackView=true]
 * @param {object|null} [options.previousProject=null]
 */
export function renderProject(
  p,
  allProjects,
  {
    root = document,
    trackEvent = track,
    trackView = true,
    previousProject = null
  } = {}
) {
  if (!p) {
    renderNotFound(root);
    return;
  }

  // Reconcile and remove any temporary watchdog or transient error state once valid project renders
  clearProjectErrorState(root);

  // Set page title
  if (typeof document !== 'undefined') {
    document.title = `${p.title} — MONDO`;
  }

  // Track project open event (idempotent: exactly once per project visit operation)
  if (trackView) {
    trackProjectView(p.slug, { trackEvent });
  }

  // 1. Project Title Row
  const serviceParam = p.category === 'Trailers' ? 'Game Trailers' : 'Game Thumbnails';
  const introEl = root.getElementById ? root.getElementById('project-intro-wrap') : root.querySelector('#project-intro-wrap');
  if (introEl) {
    introEl.innerHTML = `
      <a href="/work" class="back-link">${icons.arrowLeft(16)} All work</a>
      <div class="project-title-row">
        <div>
          <p class="eyebrow eyebrow-with-mark">
            <img src="/assets/mondo-mark.webp" alt="" class="mondo-mark mondo-mark--compact" width="18" height="24" aria-hidden="true" decoding="async" />
            <span class="lime-dot"></span>
            ${escapeHtml((p.category || '').toUpperCase())}
            ${p.concept ? '<span class="outline-tag">CONCEPT PROJECT</span>' : ''}
          </p>
          <h1><span class="section-signature" aria-hidden="true"><img src="/assets/mondo-mark.webp" alt="" class="mondo-mark mondo-mark--signature" width="28" height="38" decoding="async" /></span>${escapeHtml(p.title)}</h1>
        </div>
        <a class="button button-outline" href="/start?service=${encodeURIComponent(serviceParam)}">
          Create something like this ${icons.arrowUpRight(18)}
        </a>
      </div>
    `;
  }

  // 2. Large Media Section
  const mediaEl = root.getElementById ? root.getElementById('project-media') : root.querySelector('#project-media');
  if (mediaEl) {
    const existingMedia = mediaEl.firstElementChild;
    const sameMedia = Boolean(
      existingMedia &&
      previousProject &&
      previousProject.image === p.image &&
      (previousProject.video || '') === (p.video || '')
    );

    if (sameMedia) {
      // Preserve already-decoded media element; only update accessible alt text if title changed
      const existingImg = mediaEl.querySelector('img');
      if (existingImg) {
        const expectedAlt = `${p.title} creative, shown in full`;
        if (existingImg.getAttribute('alt') !== expectedAlt) {
          existingImg.setAttribute('alt', expectedAlt);
        }
      }
    } else {
      if (p.video) {
        mediaEl.innerHTML = `
          <video class="project-video" controls playsinline preload="none" poster="${escapeHtml(p.image)}">
            <source src="${escapeHtml(p.video)}" />
            Your browser does not support video. <a href="${escapeHtml(p.video)}">Open the trailer</a>.
          </video>
        `;
        const video = mediaEl.querySelector('video');
        if (video) {
          let trackedPlay = false;
          video.addEventListener('play', () => {
            if (!trackedPlay) {
              trackedPlay = true;
              trackEvent('trailer_play', p.slug);
            }
          });
        }
      } else {
        const isLocal = LOCAL_PROJECTS.some((n) => p.image === `/assets/${n}.webp`);
        const srcSetAttr = isLocal ? `srcset="${escapeHtml(p.image.replace('.webp', '-small.webp'))} 800w, ${escapeHtml(p.image)} 1600w"` : '';
        const sizesAttr = isLocal ? `sizes="(max-width: 800px) 100vw, 1600px"` : '';
        mediaEl.innerHTML = `
          <img src="${escapeHtml(p.image)}" ${srcSetAttr} ${sizesAttr} alt="${escapeHtml(p.title)} creative, shown in full" width="1600" height="900" fetchpriority="high" decoding="async" />
        `;
      }
    }
  }

  // 3. Project Story & Facts
  const storyEl = root.getElementById ? root.getElementById('project-story') : root.querySelector('#project-story');
  if (storyEl) {
    const facts = [
      ['The objective', p.objective],
      ['The hook', p.hook],
      ['Creative scope', p.role]
    ].filter((x) => Boolean(x[1]));

    storyEl.innerHTML = `
      <div>
        <p class="eyebrow">THE IDEA</p>
        <h2>${escapeHtml(p.description)}</h2>
        ${p.concept
        ? '<p class="concept-note">A concept exploration. This project presents a creative direction and does not make a claim about client results.</p>'
        : ''
      }
      </div>
      <div class="project-facts">
        ${facts
        .map(
          ([title, copy]) => `
          <div>
            <h3>${escapeHtml(title)}</h3>
            <p>${escapeHtml(copy)}</p>
          </div>
        `
        )
        .join('')}
      </div>
    `;
  }

  // 4. Keep Exploring Section (genuinely below the fold; render with loading="lazy")
  const exploreGrid = root.getElementById ? root.getElementById('explore-grid') : root.querySelector('#explore-grid');
  if (exploreGrid && Array.isArray(allProjects) && allProjects.length > 1) {
    const others = allProjects.filter((x) => x && x.id !== p.id).slice(0, 3);
    exploreGrid.innerHTML = others.map((x, i) => renderProjectCard(x, i, { eager: false })).join('');
  }
}

/**
 * Phase 5C Stage G1: Route Lifecycle Contract — Mount Project Details Page.
 * Orchestrates synchronous fallback rendering, readiness coordination, and hero media decode.
 * Safe, idempotent, and cancellation-aware.
 *
 * @param {object} [context]
 * @param {Document|HTMLElement} [context.root=document]
 * @param {Function} [context.fetchContent=loadPublicContent]
 * @param {Array<object>} [context.fallbackProjects=defaultProjects]
 * @param {boolean} [context.forceRetry=false]
 * @param {string} [context.slug]
 * @param {string} [context.url]
 * @param {string} [context.search]
 * @param {number|string} [context.operationId]
 * @param {AbortSignal} [context.signal]
 * @returns {Promise<object>} Active ReadinessCoordinator instance
 */
export async function mountProject({
  root = document,
  fetchContent = loadPublicContent,
  fallbackProjects = defaultProjects,
  forceRetry = false,
  slug: providedSlug = '',
  url = '',
  search = '',
  operationId = null,
  signal = null,
  trackEvent = track
} = {}) {
  const scopeEl = root.body || (root.getElementById ? root.getElementById('project-main') : null);
  if (!forceRetry && scopeEl && scopeEl.dataset && scopeEl.dataset.projectMounted === 'true') {
    return (typeof window !== 'undefined' ? window.__MONDO_READINESS_COORDINATOR__ : null);
  }
  if (scopeEl && scopeEl.dataset) {
    scopeEl.dataset.projectMounted = 'true';
    scopeEl.dataset.projectInitialized = 'true';
  }

  const opId = operationId || ++activeProjectOperationId;
  if (typeof window !== 'undefined') {
    window.__MONDO_BOOTSTRAP_STATE__ = 'hydrating';
    window.__MONDO_RETRY_INTENT__ = false;
  }

  // Abort previous project operation if active
  if (activeProjectAbortController) {
    try {
      activeProjectAbortController.abort();
    } catch (_) {}
    activeProjectAbortController = null;
  }

  const operationAbortController = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  activeProjectAbortController = operationAbortController;

  if (typeof window !== 'undefined') {
    window.__MONDO_ABORT_PROJECT_OPERATION__ = () => {
      if (activeProjectAbortController) {
        try {
          activeProjectAbortController.abort();
        } catch (_) {}
      }
    };
  }

  if (signal && operationAbortController && typeof signal.addEventListener === 'function') {
    if (signal.aborted) {
      operationAbortController.abort();
    } else {
      signal.addEventListener('abort', () => {
        try { operationAbortController.abort(); } catch (_) {}
      }, { once: true });
    }
  }

  const opSignal = operationAbortController ? operationAbortController.signal : null;

  const retryAction = () => mountProject({ root, fetchContent, fallbackProjects, forceRetry: true, slug: providedSlug, url, search });
  if (typeof window !== 'undefined') {
    window.__MONDO_RETRY_PROJECT__ = retryAction;
  }

  let slug = providedSlug;
  if (!slug && url) {
    try {
      const u = new URL(url, 'http://localhost');
      slug = getSlugFromPath(u.pathname, u.search);
    } catch (_) {
      slug = getSlugFromPath(url, search);
    }
  }
  if (!slug) {
    slug = getSlugFromPath(
      typeof window !== 'undefined' ? window.location.pathname : '',
      typeof window !== 'undefined' ? window.location.search : search
    );
  }
  let projects = fallbackProjects;

  // Detect whether a watchdog already fired before project.js arrived (AQ1-R1-03 late recovery)
  const recoveringFromWatchdog = !forceRetry && Boolean(
    typeof window !== 'undefined' && window.__MONDO_WATCHDOG_FIRED__
  );

  // Detect whether Quiet Mark is actively veiling the inbound document
  const qmEl = root.getElementById ? root.getElementById('mondo-quiet-mark') : root.querySelector('#mondo-quiet-mark');
  const isQmOverlayVisible = Boolean(
    qmEl &&
    (!qmEl.getAttribute || qmEl.getAttribute('data-qm-state') !== 'dismissed') &&
    (!qmEl.style || qmEl.style.display !== 'none')
  );
  const isQuietMarkActive = !forceRetry && !recoveringFromWatchdog && (
    (typeof document !== 'undefined' && document.documentElement.classList.contains('is-quiet-mark-inbound')) ||
    isQmOverlayVisible ||
    (typeof window !== 'undefined' && Boolean(
      (window.__MONDO_EARLY_QM__ && window.__MONDO_EARLY_QM__.state !== 'dismissed') ||
      (window.__MONDO_ADAPTIVE_QM__ && typeof window.__MONDO_ADAPTIVE_QM__.getState === 'function' && window.__MONDO_ADAPTIVE_QM__.getState() !== 'dismissed')
    ))
  );

  const shellEl = root.getElementById ? root.getElementById('mondo-loading-shell') : root.querySelector('#mondo-loading-shell');
  const statusEl = root.getElementById ? root.getElementById('mondo-loading-shell-status') : root.querySelector('#mondo-loading-shell-status');

  // Adopt early head timers if present on direct/refresh path to avoid duplicate 250ms / 2500ms events
  const nowTs = () => (typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now());
  let elapsedFromEarlyGuard = 0;
  if (!forceRetry && typeof window !== 'undefined' && window.__MONDO_PILOT_GUARD__) {
    if (typeof window.__MONDO_PILOT_GUARD__.startTime === 'number') {
      elapsedFromEarlyGuard = Math.max(0, nowTs() - window.__MONDO_PILOT_GUARD__.startTime);
    }
    if (typeof window.__MONDO_PILOT_GUARD__.clearEarlyTimers === 'function') {
      window.__MONDO_PILOT_GUARD__.clearEarlyTimers();
    }
  }

  // Signal completion helper across module boundaries
  const notifyProjectReady = () => {
    if (opId !== activeProjectOperationId) return;
    if (typeof window !== 'undefined') {
      if (window.__MONDO_WATCHDOG_FIRED__) return;
      window.__MONDO_BOOTSTRAP_STATE__ = 'ready';
      window.__MONDO_PROJECT_READY__ = true;
      try {
        window.dispatchEvent(new CustomEvent('mondo:project-ready'));
      } catch (_) {}
    }
  };

  const cleanupShellStatus = () => {
    if (statusEl) {
      if (statusEl.classList) statusEl.classList.remove('is-visible');
      statusEl.textContent = '';
    }
    if (typeof document !== 'undefined' && document.documentElement && document.documentElement.classList) {
      document.documentElement.classList.remove('is-project-pilot-status');
    }
  };

  const coordinator = createReadinessCoordinator({
    appearanceThresholdMs: elapsedFromEarlyGuard > 0 ? Math.max(1, Math.round(250 - elapsedFromEarlyGuard)) : 250,
    longWaitMs: elapsedFromEarlyGuard > 0 ? Math.max(1, Math.round(2500 - elapsedFromEarlyGuard)) : 2500,
    maxTimeoutMs: 4000,
    onThreshold: () => {
      if (opId !== activeProjectOperationId || recoveringFromWatchdog) return;
      // Direct visit: if Quiet Mark is NOT in flight, show branded loading shell
      if (shellEl && !isQuietMarkActive) {
        shellEl.classList.add('is-active');
        shellEl.setAttribute('aria-hidden', 'false');
      }
    },
    onLongWait: () => {
      if (opId !== activeProjectOperationId || recoveringFromWatchdog) return;
      if (statusEl && !isQuietMarkActive) {
        if (statusEl.textContent !== PILOT_STATUS_COPY) {
          statusEl.textContent = PILOT_STATUS_COPY;
        }
        statusEl.classList.add('is-visible');
      }
    },
    onReady: () => {
      if (opId !== activeProjectOperationId) return;
      notifyProjectReady();
      if (typeof window !== 'undefined' && window.__MONDO_PILOT_GUARD__) {
        window.__MONDO_PILOT_GUARD__.dismiss();
      }
      cleanupShellStatus();
      // If visual shell was showing, execute ~200ms soft exit
      const isPilotActive = typeof document !== 'undefined' && document.documentElement.classList.contains('is-project-pilot-active');
      if (shellEl && (shellEl.classList.contains('is-active') || isPilotActive)) {
        shellEl.classList.add('is-exiting');
        if (typeof document !== 'undefined') {
          document.documentElement.classList.remove('is-project-pilot-active');
        }
        setTimeout(() => {
          shellEl.classList.remove('is-active', 'is-exiting');
          shellEl.setAttribute('aria-hidden', 'true');
          coordinator.dismiss();
        }, 200);
      } else {
        coordinator.dismiss();
      }
    },
    onFallback: ({ name, reason } = {}) => {
      if (opId !== activeProjectOperationId) return;
      // Do NOT notify project ready if hero media or critical visual dependency timed out or fell back!
      if (name === 'hero_media') {
        return;
      }
      if (coordinator.isReady()) {
        notifyProjectReady();
      }
      if (typeof window !== 'undefined' && window.__MONDO_PILOT_GUARD__) {
        window.__MONDO_PILOT_GUARD__.dismiss();
      }
      cleanupShellStatus();
      const isPilotActive = typeof document !== 'undefined' && document.documentElement.classList.contains('is-project-pilot-active');
      if (shellEl && (shellEl.classList.contains('is-active') || isPilotActive)) {
        shellEl.classList.add('is-exiting');
        if (typeof document !== 'undefined') {
          document.documentElement.classList.remove('is-project-pilot-active');
        }
        setTimeout(() => {
          shellEl.classList.remove('is-active', 'is-exiting');
          shellEl.setAttribute('aria-hidden', 'true');
          coordinator.dismiss();
        }, 200);
      } else {
        coordinator.dismiss();
      }
    },
    onDismiss: ({ state } = {}) => {
      if (opId !== activeProjectOperationId) return;
      if (state === 'FAILED' && !coordinator.isReady()) {
        renderErrorState(root, {
          onRetry: retryAction,
          message: 'Unable to load project media. Please try again.'
        });
      }
    }
  });

  if (typeof window !== 'undefined') {
    window.__MONDO_READINESS_COORDINATOR__ = coordinator;
  }

  // Register critical dependencies
  coordinator.register('project_slug', Promise.resolve(slug), { critical: true });

  // Gate content reveal on stylesheet readiness when #mondo-main-stylesheet is present in document
  const hasMainStylesheet = Boolean(
    root && root.getElementById && root.getElementById('mondo-main-stylesheet')
  );
  if (hasMainStylesheet) {
    coordinator.register('project_styles', waitForStylesheetReady(root, 3500), { critical: true, timeoutMs: 3500 });
  }

  // 1. Check Canonical Defaults synchronously
  let currentProject = projects.find((x) => x.slug === slug);
  if (currentProject) {
    coordinator.register('project_data', Promise.resolve(currentProject), { critical: true });
    renderProject(currentProject, projects, { root, trackEvent, trackView: true });
    coordinator.markReady('project_data', currentProject);

    // Hero media readiness: wait for image decode with extended observation
    const heroImg = root.querySelector('#project-media img');
    const heroVideo = root.querySelector('#project-media video');
    if (heroImg) {
      coordinator.register('hero_media', null, { critical: true, visual: true, allowFallback: false, timeoutMs: 2500 });
      waitForImageDecode(heroImg, 2500, { keepListening: true, signal: opSignal })
        .then((result) => {
          if (opId !== activeProjectOperationId || result.status === 'aborted') return;
          if (result.status === 'decoded' || result.status === 'complete' || result.status === 'loaded' || (heroImg.naturalWidth > 0)) {
            heroImg.classList.add('is-decoded');
            if (heroImg.style) {
              heroImg.style.visibility = '';
              heroImg.style.opacity = '1';
            }
            coordinator.markReady('hero_media', result);
          } else if (result.status === 'error' || result.status === 'decode_fallback') {
            coordinator.markFailed('hero_media', result.error);
            renderErrorState(root, {
              onRetry: retryAction,
              message: 'Unable to load project media. Please try again.'
            });
          }
        })
        .catch((err) => {
          if (opId !== activeProjectOperationId || (opSignal && opSignal.aborted)) return;
          coordinator.markFailed('hero_media', err);
          renderErrorState(root, {
            onRetry: retryAction,
            message: 'Unable to load project media. Please try again.'
          });
        });
    } else if (heroVideo) {
      coordinator.register('hero_media', null, { critical: true, visual: true, allowFallback: false, timeoutMs: 2500 });
      waitForVideoReady(heroVideo, 2500, { requireFirstFrame: true, signal: opSignal })
        .then((result) => {
          if (opId !== activeProjectOperationId || result.status === 'aborted') return;
          if (result.status === 'poster_ready' || result.status === 'frame_ready' || result.status === 'frame_loaded' || result.status === 'metadata_ready') {
            coordinator.markReady('hero_media', result);
          } else {
            coordinator.markFailed('hero_media', result.error);
            renderErrorState(root, {
              onRetry: retryAction,
              message: 'Unable to load project video. Please try again.'
            });
          }
        })
        .catch((err) => {
          if (opId !== activeProjectOperationId || (opSignal && opSignal.aborted)) return;
          coordinator.markFailed('hero_media', err);
          renderErrorState(root, {
            onRetry: retryAction,
            message: 'Unable to load project video. Please try again.'
          });
        });
    } else {
      coordinator.markReady('hero_media');
    }

    coordinator.start();

    // Background asynchronous hydration (non-critical, does not block the shell or initial rendering)
    fetchContent()
      .then((data) => {
        if (opId !== activeProjectOperationId) return;
        if (data && Array.isArray(data.projects)) {
          const freshProjects = data.projects;
          const found = freshProjects.find((x) => x.slug === slug);
          if (found) {
            const main = root.getElementById ? root.getElementById('project-main') : root.querySelector('#project-main');
            const isErrorState = (coordinator && coordinator.getState() === 'FAILED') ||
                                 (main && main.classList && main.classList.contains('has-project-error'));
            if (!isErrorState) {
              const projectUnchanged = areProjectsEquivalent(currentProject, found);
              const relatedUnchanged = areRelatedProjectsEquivalent(projects, freshProjects, found.id);

              if (!projectUnchanged || !relatedUnchanged) {
                // Legitimate project update from API: reconcile without duplicate view tracking
                renderProject(found, freshProjects, {
                  root,
                  trackEvent,
                  trackView: false,
                  previousProject: currentProject
                });
                currentProject = found;
                projects = freshProjects;
              }
            }
          }
        }
      })
      .catch((err) => {
        // Non-critical background refresh failure: canonical content is already rendered
        console.warn('[Project Details] Background update skipped:', err.message);
      });

    return coordinator;
  }

  // 2. Custom Project (not found in canonical defaults)
  // Register critical project_data dependency
  coordinator.register('project_data', null, { critical: true, timeoutMs: 3000 });
  coordinator.start();

  let fetchPromise = null;
  let timedOutOrFailed = false;
  let lateReconciled = false;

  try {
    // Bounded fetch with 3,000ms timeout
    fetchPromise = Promise.resolve(fetchContent());
    let timerId = null;
    const timeoutPromise = new Promise((_, reject) => {
      timerId = setTimeout(() => reject(new Error('Request timed out.')), 3000);
    });
    const data = await Promise.race([fetchPromise, timeoutPromise]);
    if (timerId) clearTimeout(timerId);
    if (opId !== activeProjectOperationId) return coordinator;

    if (data && Array.isArray(data.projects)) {
      projects = data.projects;
      const found = projects.find((x) => x.slug === slug);
      if (found) {
        renderProject(found, projects, { root, trackEvent, trackView: true });

        // Hero media readiness: register BEFORE settling project_data to prevent premature terminal READY state
        const heroImg = root.querySelector('#project-media img');
        const heroVideo = root.querySelector('#project-media video');
        if (heroImg) {
          coordinator.register('hero_media', null, { critical: true, visual: true, allowFallback: false, timeoutMs: 2500 });
          waitForImageDecode(heroImg, 2500, { keepListening: true, signal: opSignal })
            .then((result) => {
              if (opId !== activeProjectOperationId || result.status === 'aborted') return;
              if (result.status === 'decoded' || result.status === 'complete' || result.status === 'loaded' || (heroImg.naturalWidth > 0)) {
                heroImg.classList.add('is-decoded');
                if (heroImg.style) {
                  heroImg.style.visibility = '';
                  heroImg.style.opacity = '1';
                }
                coordinator.markReady('hero_media', result);
              } else if (result.status === 'error' || result.status === 'decode_fallback') {
                coordinator.markFailed('hero_media', result.error);
                renderErrorState(root, {
                  onRetry: retryAction,
                  message: 'Unable to load project media. Please try again.'
                });
              }
            })
            .catch((err) => {
              if (opId !== activeProjectOperationId || (opSignal && opSignal.aborted)) return;
              coordinator.markFailed('hero_media', err);
              renderErrorState(root, {
                onRetry: retryAction,
                message: 'Unable to load project media. Please try again.'
              });
            });
        } else if (heroVideo) {
          coordinator.register('hero_media', null, { critical: true, visual: true, allowFallback: false, timeoutMs: 2500 });
          waitForVideoReady(heroVideo, 2500, { requireFirstFrame: true, signal: opSignal })
            .then((result) => {
              if (opId !== activeProjectOperationId || result.status === 'aborted') return;
              if (result.status === 'poster_ready' || result.status === 'frame_ready' || result.status === 'frame_loaded' || result.status === 'metadata_ready') {
                coordinator.markReady('hero_media', result);
              } else {
                coordinator.markFailed('hero_media', result.error);
                renderErrorState(root, {
                  onRetry: retryAction,
                  message: 'Unable to load project video. Please try again.'
                });
              }
            })
            .catch((err) => {
              if (opId !== activeProjectOperationId || (opSignal && opSignal.aborted)) return;
              coordinator.markFailed('hero_media', err);
              renderErrorState(root, {
                onRetry: retryAction,
                message: 'Unable to load project video. Please try again.'
              });
            });
        }

        coordinator.markReady('project_data', found);
      } else {
        // Confirmed absence: slug not in database
        renderNotFound(root);
        coordinator.markReady('project_data', null);
      }
    } else {
      // Ambiguous payload: treat as recoverable error
      renderErrorState(root, {
        onRetry: retryAction,
        message: 'Could not load project information.'
      });
      coordinator.markFallback('project_data', 'invalid_payload');
    }
  } catch (err) {
    if (opId !== activeProjectOperationId) return coordinator;
    timedOutOrFailed = true;
    // Network failure, 500, or timeout: DO NOT render 404! Render recoverable error state.
    renderErrorState(root, {
      onRetry: retryAction,
      message: err.message || 'We could not connect to the studio service. Please check your network.'
    });
    coordinator.markFallback('project_data', err.message);

    // One-shot pilot reconciliation if an in-flight timed-out fetch later resolves with valid project data
    if (fetchPromise && typeof fetchPromise.then === 'function') {
      fetchPromise
        .then((lateData) => {
          if (opId !== activeProjectOperationId || !timedOutOrFailed || lateReconciled) return;
          if (lateData && Array.isArray(lateData.projects)) {
            const lateFound = lateData.projects.find((x) => x.slug === slug);
            if (lateFound) {
              lateReconciled = true;
              projects = lateData.projects;
              renderProject(lateFound, projects, {
                root,
                trackEvent,
                trackView: false,
                previousProject: null
              });
            }
          }
        })
        .catch(() => { /* already showing recoverable error state */ });
    }
  }

  return coordinator;
}

/**
 * Phase 5C Stage G1: Route Lifecycle Contract — Unmount Project Details Page.
 * Destroys active readiness coordinator, releases timers, resets route-owned state,
 * and clears idempotency flags.
 * Does NOT destroy transition-owned state (__MONDO_EARLY_QM__ or __MONDO_ADAPTIVE_QM__).
 *
 * @param {object} [context]
 * @param {Document|HTMLElement} [context.root=document]
 */
export function unmountProject({ root = document } = {}) {
  // Invalidate in-flight async operations
  activeProjectOperationId++;

  // Abort operation-owned media observers and listeners
  if (activeProjectAbortController) {
    try {
      activeProjectAbortController.abort();
    } catch (_) {}
    activeProjectAbortController = null;
  }

  if (typeof window !== 'undefined') {
    window.__MONDO_ABORT_PROJECT_OPERATION__ = null;
  }

  // Destroy active coordinator if present
  if (typeof window !== 'undefined' && window.__MONDO_READINESS_COORDINATOR__) {
    if (typeof window.__MONDO_READINESS_COORDINATOR__.destroy === 'function') {
      try {
        window.__MONDO_READINESS_COORDINATOR__.destroy();
      } catch (_) {}
    }
    window.__MONDO_READINESS_COORDINATOR__ = null;
  }

  // Reset route-owned global state
  if (typeof window !== 'undefined') {
    window.__MONDO_PROJECT_READY__ = false;
    window.__MONDO_BOOTSTRAP_STATE__ = 'idle';
    window.__MONDO_WATCHDOG_FIRED__ = false;
    window.__MONDO_LATE_RECOVERED__ = false;
    window.__MONDO_RETRY_INTENT__ = false;
    window.__MONDO_RETRY_PROJECT__ = null;
  }

  const scopeEl = root.body || (root.getElementById ? root.getElementById('project-main') : null);
  if (scopeEl && scopeEl.dataset) {
    delete scopeEl.dataset.projectMounted;
    delete scopeEl.dataset.projectInitialized;
  }

  // Clear non-destructive error host if present
  clearProjectErrorState(root);

  // Reset project view tracking state for future visits
  resetProjectTrackingState();
}

// Canonical lifecycle aliases for Global Coordinator
export { mountProject as mount, unmountProject as unmount };

/**
 * Orchestrator initializing the project detail view (Phase 5C.3.3 Pilot):
 * Preserved for backward compatibility with direct document loads.
 *
 * @param {object} [options]
 * @param {Document|HTMLElement} [options.root=document]
 * @param {Function} [options.fetchContent=loadPublicContent]
 * @param {Array<object>} [options.fallbackProjects=defaultProjects]
 * @param {boolean} [options.forceRetry=false]
 * @param {Function} [options.trackEvent=track]
 * @returns {Promise<object>} Active ReadinessCoordinator instance
 */
export async function initProjectPage({
  root = document,
  fetchContent = loadPublicContent,
  fallbackProjects = defaultProjects,
  forceRetry = false,
  trackEvent = track
} = {}) {
  return mountProject({ root, fetchContent, fallbackProjects, forceRetry, trackEvent });
}
