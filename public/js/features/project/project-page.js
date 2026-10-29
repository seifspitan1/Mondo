import { icons } from '../../shared/icons.js';
import { escapeHtml } from '../../shared/dom.js';
import { track, loadPublicContent } from '../../shared/api.js';
import { renderProjectCard } from '../work/card.js';
import { defaultProjects } from '../../shared/defaults.js';

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

/**
 * Renders the 404 Project Not Found state.
 * @param {Document|HTMLElement} [root=document]
 */
export function renderNotFound(root = document) {
  if (typeof document !== 'undefined') {
    document.title = 'Project not found — MONDO';
  }
  const main = root.getElementById ? root.getElementById('project-main') : root.querySelector('#project-main');
  if (main) {
    main.innerHTML = `
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
 */
export function renderProject(p, allProjects, { root = document, trackEvent = track } = {}) {
  if (!p) {
    renderNotFound(root);
    return;
  }

  // Set page title
  if (typeof document !== 'undefined') {
    document.title = `${p.title} — MONDO`;
  }

  // Track project open event
  trackEvent('project_open', p.slug);

  // 1. Project Title Row
  const serviceParam = p.category === 'Trailers' ? 'Game Trailers' : 'Game Thumbnails';
  const introEl = root.getElementById ? root.getElementById('project-intro-wrap') : root.querySelector('#project-intro-wrap');
  if (introEl) {
    introEl.innerHTML = `
      <a href="/work" class="back-link">${icons.arrowLeft(16)} All work</a>
      <div class="project-title-row">
        <div>
          <p class="eyebrow eyebrow-with-mark">
            <img src="/assets/mondo-mark.webp" alt="" class="mondo-mark mondo-mark--compact" width="18" height="24" aria-hidden="true" />
            <span class="lime-dot"></span>
            ${escapeHtml((p.category || '').toUpperCase())}
            ${p.concept ? '<span class="outline-tag">CONCEPT PROJECT</span>' : ''}
          </p>
          <h1><span class="section-signature" aria-hidden="true"><img src="/assets/mondo-mark.webp" alt="" class="mondo-mark mondo-mark--signature" width="28" height="38" /></span>${escapeHtml(p.title)}</h1>
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
      mediaEl.innerHTML = `
        <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.title)} creative, shown in full" width="1600" height="900" fetchpriority="high" />
      `;
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

  // 4. Keep Exploring Section
  const exploreGrid = root.getElementById ? root.getElementById('explore-grid') : root.querySelector('#explore-grid');
  if (exploreGrid && Array.isArray(allProjects) && allProjects.length > 1) {
    const others = allProjects.filter((x) => x && x.id !== p.id).slice(0, 3);
    exploreGrid.innerHTML = others.map((x, i) => renderProjectCard(x, i)).join('');
  }
}

/**
 * Orchestrator initializing the project detail view:
 * 1. Synchronous fallback rendering from browser-safe client defaults (eliminates server-side import).
 * 2. Asynchronous hydration via loadPublicContent API fetch.
 * 3. Reliable 404 presentation if project is missing from both defaults and API.
 *
 * Idempotent: safe against duplicate initialization.
 * @param {object} [options]
 * @param {Document|HTMLElement} [options.root=document]
 * @param {Function} [options.fetchContent=loadPublicContent]
 * @param {Array<object>} [options.fallbackProjects=defaultProjects]
 * @returns {Promise<void>}
 */
export async function initProjectPage({
  root = document,
  fetchContent = loadPublicContent,
  fallbackProjects = defaultProjects
} = {}) {
  const scopeEl = root.body || (root.getElementById ? root.getElementById('project-main') : null);
  if (scopeEl && scopeEl.dataset && scopeEl.dataset.projectInitialized === 'true') {
    return;
  }
  if (scopeEl && scopeEl.dataset) {
    scopeEl.dataset.projectInitialized = 'true';
  }

  const slug = getSlugFromPath();
  let projects = fallbackProjects;

  // Try to find in defaults first for immediate synchronous fallback rendering
  let currentProject = projects.find((x) => x.slug === slug);
  if (currentProject) {
    renderProject(currentProject, projects, { root });
  }

  try {
    const data = await fetchContent();
    if (data.projects && Array.isArray(data.projects)) {
      projects = data.projects;
      const found = projects.find((x) => x.slug === slug);
      if (found) {
        renderProject(found, projects, { root });
      } else if (!currentProject) {
        renderProject(null, projects, { root });
      }
    }
  } catch (err) {
    if (!currentProject) {
      renderProject(null, projects, { root });
    }
  }
}
