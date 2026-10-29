import { icons } from '../../shared/icons.js';
import { escapeHtml } from '../../shared/dom.js';

/**
 * Pure generator rendering a single package pricing card.
 * @param {object} p - Package data record
 * @param {number} i - Index in list
 * @param {boolean} monthly - Whether monthly cadence is active
 * @returns {string} HTML string
 */
export function renderPackageCard(p, i, monthly) {
  const highlighted = Boolean(p.highlighted);
  const indexStr = `0${i + 1} / ${monthly ? 'ONGOING' : 'PROJECT'}`;
  const badgeStr = highlighted
    ? `<span class="package-badge">${monthly ? 'KEEP THE MOMENTUM' : 'READY TO LAUNCH'}</span>`
    : '';

  const serviceParam = monthly
    ? 'Monthly Creatives'
    : p.id === 'launch'
      ? 'Launch Pack'
      : p.id === 'lab'
        ? 'Game Thumbnails'
        : 'Custom Project';

  const talkTarget = p.name === 'YOUR NEXT MOVE' ? 'creative' : p.name.replace('MONDO ', '');

  return `
    <article class="package-card ${highlighted ? 'highlighted' : ''}">
      <div class="package-topline">
        <span>${indexStr}</span>
        ${badgeStr}
      </div>
      <h3>${escapeHtml(p.name)}</h3>
      <p>${escapeHtml(p.subtitle)}</p>
      <div class="package-price">
        ${escapeHtml(p.price)}
        <span>${escapeHtml(p.cadence)}</span>
      </div>
      <ul>
        ${(p.features || []).map((f) => `<li>${icons.check(15)}${escapeHtml(f)}</li>`).join('')}
      </ul>
      <a class="button ${highlighted ? '' : 'button-outline'}" href="/start?service=${encodeURIComponent(serviceParam)}&package=${encodeURIComponent(p.name)}">
        Let’s talk ${escapeHtml(talkTarget)} ${icons.arrowUpRight(17)}
      </a>
    </article>
  `;
}

/**
 * Pure generator rendering the full package list for the active cadence.
 * @param {Array<object>} packages - Array of package objects
 * @param {boolean} monthly - Filter monthly or one-off
 * @returns {string} HTML string
 */
export function renderPackagesHtml(packages, monthly) {
  if (!Array.isArray(packages)) return '';
  const filtered = packages.filter((p) => p.monthly === monthly);
  return filtered.map((p, i) => renderPackageCard(p, i, monthly)).join('');
}

/**
 * Renders packages into the DOM container element.
 * @param {HTMLElement} container - DOM container (e.g. #packages-grid)
 * @param {Array<object>} packages - Array of package data records
 * @param {boolean} monthly - Whether to show monthly packages
 */
export function renderPackages(container, packages, monthly) {
  if (!container) return;
  container.innerHTML = renderPackagesHtml(packages, monthly);
}

/**
 * Attaches click handlers to the segmented toggle buttons (One-off / Monthly).
 * Idempotent: safe against duplicate bindings.
 * @param {object} options
 * @param {Document|HTMLElement} [options.root=document]
 * @param {Function} options.onToggle - Callback (isMonthly: boolean) => void
 */
export function setupPackageToggle({ root = document, onToggle } = {}) {
  const toggleButtons = root.querySelectorAll('.segmented button');
  if (!toggleButtons.length) return;

  toggleButtons.forEach((btn, index) => {
    if (btn.dataset.toggleBound === 'true') return;
    btn.dataset.toggleBound = 'true';

    btn.addEventListener('click', () => {
      toggleButtons.forEach((b) => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      const isMonthly = index === 1;
      if (typeof onToggle === 'function') {
        onToggle(isMonthly);
      }
    });
  });
}
