import { escapeHtml } from '../../../shared/dom.js';
import { markDirty } from '../ui/form-state.js';

/**
 * Generates HTML for the Packages tab workspace.
 * @param {Object} state
 * @returns {string}
 */
export function generatePackagesTabHtml(state) {
  if (!state.settings?.packages) return '';

  return `
    <div class="admin-toolbar">
      <div>
        <h2>Creative packages</h2>
        <p>Prices are display text. Choosing a package starts a project enquiry.</p>
      </div>
    </div>

    <div class="package-admin-grid">
      ${state.settings.packages
        .map(
          (p, i) => `
        <article class="package-editor" data-idx="${i}">
          <h3>${escapeHtml(p.name)}</h3>
          <label>
            Package name
            <input class="pkg-name" value="${escapeHtml(p.name)}" />
          </label>
          <label>
            Short description
            <input class="pkg-subtitle" value="${escapeHtml(p.subtitle)}" />
          </label>
          <label>
            Displayed price
            <input class="pkg-price" value="${escapeHtml(p.price)}" />
          </label>
          <label>
            Price period
            <input class="pkg-cadence" value="${escapeHtml(p.cadence)}" />
          </label>
          <label>
            Included features · one per line
            <textarea class="pkg-features">${escapeHtml(Array.isArray(p.features) ? p.features.join('\n') : '')}</textarea>
          </label>
          <label class="checkbox-row">
            <input type="checkbox" class="pkg-monthly" ${p.monthly ? 'checked' : ''} />
            <span>Show under monthly plans</span>
          </label>
          <label class="checkbox-row">
            <input type="checkbox" class="pkg-highlighted" ${p.highlighted ? 'checked' : ''} />
            <span>Highlight this package</span>
          </label>
        </article>
      `
        )
        .join('')}
    </div>
  `;
}

/**
 * Renders the Packages tab workspace and attaches input binding listeners.
 *
 * @param {HTMLElement|string} target
 * @param {Object} store
 */
export function renderPackagesTab(target, store) {
  const container = typeof target === 'string' ? document.getElementById(target) : target;
  if (!container) return;

  const state = store.getState();
  if (!state.settings?.packages) return;

  container.innerHTML = generatePackagesTabHtml(state);

  container.querySelectorAll('.package-editor').forEach((art) => {
    const idx = Number(art.getAttribute('data-idx'));
    const packages = store.getState().settings?.packages;
    if (!packages || !packages[idx]) return;

    art.querySelector('.pkg-name')?.addEventListener('input', (e) => {
      packages[idx].name = e.target.value;
      // Also update the preview card header if desired, but original keeps initial h3
      markDirty(store);
    });

    art.querySelector('.pkg-subtitle')?.addEventListener('input', (e) => {
      packages[idx].subtitle = e.target.value;
      markDirty(store);
    });

    art.querySelector('.pkg-price')?.addEventListener('input', (e) => {
      packages[idx].price = e.target.value;
      markDirty(store);
    });

    art.querySelector('.pkg-cadence')?.addEventListener('input', (e) => {
      packages[idx].cadence = e.target.value;
      markDirty(store);
    });

    art.querySelector('.pkg-features')?.addEventListener('input', (e) => {
      packages[idx].features = e.target.value.split('\n');
      markDirty(store);
    });

    art.querySelector('.pkg-monthly')?.addEventListener('change', (e) => {
      packages[idx].monthly = e.target.checked;
      markDirty(store);
    });

    art.querySelector('.pkg-highlighted')?.addEventListener('change', (e) => {
      packages[idx].highlighted = e.target.checked;
      markDirty(store);
    });
  });
}
