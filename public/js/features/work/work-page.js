import { loadPublicContent } from '../../shared/api.js';
import { renderFilteredProjectsGrid } from './filter.js';

/**
 * Pure formatter for total portfolio project count.
 * @param {number} count
 * @returns {string} e.g. "05 creative projects"
 */
export function formatProjectCount(count) {
  const num = typeof count === 'number' && !isNaN(count) ? count : 0;
  return `${num.toString().padStart(2, '0')} creative projects`;
}

/**
 * Renders the work page grid and updates the count badge.
 * @param {HTMLElement} grid - Grid container (#work-grid)
 * @param {HTMLElement|null} countEl - Count element (#project-count)
 * @param {Array<object>} projects - All projects
 * @param {string} [filter='All'] - Active category filter
 */
export function renderWorkGrid(grid, countEl, projects, filter = 'All') {
  if (countEl) {
    countEl.textContent = formatProjectCount(projects ? projects.length : 0);
  }
  if (!grid) return;
  // In portfolio page, all filtered items are shown (no limit)
  renderFilteredProjectsGrid(grid, projects, filter, null);
}

/**
 * Attaches filter button click handlers for the portfolio collection page.
 * Idempotent: protected against duplicate listener bindings.
 * @param {object} options
 * @param {Document|HTMLElement} [options.root=document]
 * @param {Function} options.onFilterChange - Callback (filter: string) => void
 */
export function setupWorkFilters({ root = document, onFilterChange } = {}) {
  const buttons = root.querySelectorAll('.filter-list button');
  if (!buttons.length) return;

  buttons.forEach((btn) => {
    if (btn.dataset.workFilterBound === 'true') return;
    btn.dataset.workFilterBound = 'true';

    btn.addEventListener('click', () => {
      buttons.forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      const filter = btn.getAttribute('data-filter') || 'All';
      if (typeof onFilterChange === 'function') {
        onFilterChange(filter);
      }
    });
  });
}

/**
 * Orchestrator initializing the work portfolio collection page:
 * - Category filter toolbar (All, Thumbnails, Trailers)
 * - Initial grid and project count
 * - API hydration via loadPublicContent
 *
 * Idempotent and safe against duplicate execution.
 * @param {object} [options]
 * @param {Document|HTMLElement} [options.root=document]
 * @param {Function} [options.fetchContent=loadPublicContent]
 * @returns {Promise<void>}
 */
export async function initWorkPage({ root = document, fetchContent = loadPublicContent } = {}) {
  const scopeEl = root.body || (root.getElementById ? root.getElementById('work-grid') : null);
  if (scopeEl && scopeEl.dataset && scopeEl.dataset.workInitialized === 'true') {
    return;
  }
  if (scopeEl && scopeEl.dataset) {
    scopeEl.dataset.workInitialized = 'true';
  }

  let allProjects = [];
  const grid = root.getElementById ? root.getElementById('work-grid') : root.querySelector('#work-grid');
  const countEl = root.getElementById ? root.getElementById('project-count') : root.querySelector('#project-count');

  setupWorkFilters({
    root,
    onFilterChange: (filter) => {
      renderWorkGrid(grid, countEl, allProjects, filter);
    }
  });

  try {
    const data = await fetchContent();
    if (data.projects && Array.isArray(data.projects)) {
      allProjects = data.projects;
      renderWorkGrid(grid, countEl, allProjects, 'All');
    }
  } catch (err) {
    console.warn('Using pre-rendered work collection:', err.message);
  }
}
