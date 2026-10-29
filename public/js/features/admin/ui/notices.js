import { escapeHtml } from '../../../shared/dom.js';

/**
 * Generates HTML markup for admin notices based on state.
 * @param {Object} state
 * @returns {string}
 */
export function generateNoticesHtml(state) {
  let html = '';
  if (state?.message) {
    html += `<div class="admin-notice" role="status">${escapeHtml(state.message)}</div>`;
  }
  if (state?.error) {
    html += `<div class="admin-notice admin-error" role="alert">${escapeHtml(state.error)}</div>`;
  }
  return html;
}

/**
 * Mounts notices HTML into the target container.
 * @param {HTMLElement|string} target - Container element or element ID
 * @param {Object} state
 */
export function renderNotices(target, state) {
  const container = typeof target === 'string' ? document.getElementById(target) : target;
  if (!container) return;
  container.innerHTML = generateNoticesHtml(state);
}
