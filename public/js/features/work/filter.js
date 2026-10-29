import { icons } from '../../shared/icons.js';
import { renderProjectCard } from './card.js';

/**
 * Pure filter function filtering projects by category and optional limit.
 * @param {Array<object>} projects - All projects
 * @param {string} [category='All'] - Selected category
 * @param {number|null} [limit=null] - Maximum items to return
 * @returns {Array<object>} Filtered projects array
 */
export function filterProjects(projects, category = 'All', limit = null) {
  if (!Array.isArray(projects)) return [];
  const list = category === 'All' ? projects : projects.filter((p) => p && p.category === category);
  return typeof limit === 'number' && limit > 0 ? list.slice(0, limit) : list;
}

/**
 * Pure generator for the empty-state work grid markup.
 * @param {string} filter - Current category filter name
 * @returns {string} HTML string
 */
export function renderWorkEmptyState(filter) {
  const isTrailers = filter === 'Trailers';
  return `
    <div class="empty-state" style="grid-column: 1 / -1;">
      ${icons.clapperboard(32)}
      <h3>${isTrailers ? 'Something worth pressing play on.' : 'The next creative chapter.'}</h3>
      <p>${isTrailers ? 'Trailer projects will appear here as they’re added to the studio.' : 'New creative projects will appear here as they’re added to the studio.'}</p>
      <a href="/start?service=Game%20Trailers" class="text-link">Let’s talk about your trailer ${icons.arrowUpRight(17)}</a>
    </div>
  `;
}

/**
 * Renders filtered project cards or empty state into the target grid element.
 * @param {HTMLElement} grid - Target DOM grid element
 * @param {Array<object>} projects - Projects list
 * @param {string} [filter='All'] - Category filter
 * @param {number|null} [limit=3] - Maximum items to display
 */
export function renderFilteredProjectsGrid(grid, projects, filter = 'All', limit = 3) {
  if (!grid) return;
  const displayList = filterProjects(projects, filter, limit);
  if (displayList.length > 0) {
    grid.innerHTML = displayList.map((p, i) => renderProjectCard(p, i)).join('');
  } else {
    grid.innerHTML = renderWorkEmptyState(filter);
  }
}

/**
 * Attaches click handlers to category filter buttons with idempotency guard.
 * @param {Array<object>} projects - Projects data array
 * @param {object} [options]
 * @param {Document|HTMLElement} [options.root=document]
 * @param {string} [options.selector='.selected-work .filter-list button']
 * @param {string} [options.gridId='selected-work-grid']
 * @param {number|null} [options.limit=3]
 * @param {Function} [options.onFilterChange]
 */
export function setupWorkFilter(projects, {
  root = document,
  selector = '.selected-work .filter-list button',
  gridId = 'selected-work-grid',
  limit = 3,
  onFilterChange
} = {}) {
  const filterBtns = root.querySelectorAll(selector);
  const grid = root.getElementById ? root.getElementById(gridId) : root.querySelector(`#${gridId}`);
  if (!grid || !filterBtns.length) return;

  filterBtns.forEach((btn) => {
    if (btn.dataset.filterBound === 'true') return;
    btn.dataset.filterBound = 'true';

    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');

      const filter = btn.getAttribute('data-filter') || 'All';
      renderFilteredProjectsGrid(grid, projects, filter, limit);

      if (typeof onFilterChange === 'function') {
        onFilterChange(filter);
      }
    });
  });
}
