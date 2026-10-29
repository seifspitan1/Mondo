import { icons } from '../../../shared/icons.js';

/**
 * Generates HTML for the floating bottom save bar.
 * Active for Studio and Packages tabs.
 * @param {Object} state
 * @returns {string}
 */
export function renderSaveBarHtml(state) {
  if (state.tab !== 'Studio' && state.tab !== 'Packages') {
    return '';
  }

  return `
    <div class="admin-save-bar">
      <span id="save-bar-label">${state.dirty ? 'You have unsaved changes.' : 'Your saved content appears on the website.'}</span>
      <button class="button" id="save-settings-btn" ${state.busy || !state.dirty ? 'disabled' : ''}>
        ${state.busy ? `${icons.spinner(14)} Saving…` : `${icons.save(14)} Save changes`}
      </button>
    </div>
  `;
}

/**
 * Updates existing save bar elements directly in the DOM without full re-render.
 * Preserves active focus and caret position in form inputs.
 * @param {Object} store
 */
export function markDirty(store) {
  store.setDirty(true);
  const btn = document.getElementById('save-settings-btn');
  if (btn) {
    btn.removeAttribute('disabled');
  }
  const label = document.getElementById('save-bar-label') || document.querySelector('.admin-save-bar span');
  if (label) {
    label.textContent = 'You have unsaved changes.';
  }
}
