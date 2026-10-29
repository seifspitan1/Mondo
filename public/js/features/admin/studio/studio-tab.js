import { icons } from '../../../shared/icons.js';
import { escapeHtml } from '../../../shared/dom.js';
import { markDirty } from '../ui/form-state.js';

/**
 * Generates HTML for the Studio settings tab workspace.
 * @param {Object} state
 * @returns {string}
 */
export function generateStudioTabHtml(state) {
  if (!state.settings) return '';
  const s = state.settings;

  return `
    <section class="settings-section">
      <h3>The studio details</h3>
      <div class="studio-fields">
        <label class="full-width">
          Home introduction
          <textarea id="studio-tagline" maxlength="250">${escapeHtml(s.tagline)}</textarea>
        </label>
        <label>
          Public email address
          <input id="studio-email" type="email" value="${escapeHtml(s.email)}" placeholder="Add your studio email" />
        </label>
        <label>
          Discord link
          <input id="studio-discord" type="url" value="${escapeHtml(s.discordUrl)}" placeholder="https://discord.gg/…" />
        </label>
        <label class="full-width">
          X / Twitter link
          <input id="studio-x" type="url" value="${escapeHtml(s.xUrl)}" placeholder="https://x.com/…" />
        </label>
      </div>
      <p class="field-help">Contact links appear on the website when you add them.</p>
    </section>

    <section class="settings-section">
      <h3>What we do</h3>
      <div class="settings-editor">
        ${s.services
          .map(
            (srv, i) => `
          <div class="editor-row" data-srv-idx="${i}">
            <label>
              Service name
              <input class="srv-title" value="${escapeHtml(srv.title)}" />
            </label>
            <label>
              Short introduction
              <input class="srv-desc" value="${escapeHtml(srv.description)}" />
            </label>
            <label>
              Service description
              <textarea class="srv-detail">${escapeHtml(srv.detail)}</textarea>
            </label>
          </div>
        `
          )
          .join('')}
      </div>
    </section>

    <section class="settings-section">
      <div class="admin-toolbar">
        <h3>Good questions. Clear answers.</h3>
        <button class="button button-outline" id="add-faq-btn" ${s.faqs.length >= 16 ? 'disabled' : ''}>
          ${icons.plus(13)} Add FAQ
        </button>
      </div>

      <div class="settings-editor">
        ${s.faqs
          .map(
            (faq, i) => `
          <div class="editor-row" data-faq-idx="${i}">
            <div>
              <span>QUESTION ${(i + 1).toString().padStart(2, '0')}</span>
              <button class="icon-button remove-faq-btn" data-faq-idx="${i}" aria-label="Remove FAQ">
                ${icons.close(13)}
              </button>
            </div>
            <label>
              Question
              <input class="faq-q" value="${escapeHtml(faq.question)}" />
            </label>
            <label>
              Answer
              <textarea class="faq-a">${escapeHtml(faq.answer)}</textarea>
            </label>
          </div>
        `
          )
          .join('')}
      </div>
    </section>
  `;
}

/**
 * Renders the Studio settings tab workspace and attaches input listeners.
 *
 * @param {HTMLElement|string} target
 * @param {Object} store
 */
export function renderStudioTab(target, store) {
  const container = typeof target === 'string' ? document.getElementById(target) : target;
  if (!container) return;

  const state = store.getState();
  if (!state.settings) return;

  container.innerHTML = generateStudioTabHtml(state);

  // Studio detail inputs
  container.querySelector('#studio-tagline')?.addEventListener('input', (e) => {
    const s = store.getState().settings;
    if (s) s.tagline = e.target.value;
    markDirty(store);
  });

  container.querySelector('#studio-email')?.addEventListener('input', (e) => {
    const s = store.getState().settings;
    if (s) s.email = e.target.value;
    markDirty(store);
  });

  container.querySelector('#studio-discord')?.addEventListener('input', (e) => {
    const s = store.getState().settings;
    if (s) s.discordUrl = e.target.value;
    markDirty(store);
  });

  container.querySelector('#studio-x')?.addEventListener('input', (e) => {
    const s = store.getState().settings;
    if (s) s.xUrl = e.target.value;
    markDirty(store);
  });

  // Services inputs
  container.querySelectorAll('[data-srv-idx]').forEach((row) => {
    const idx = Number(row.getAttribute('data-srv-idx'));
    const s = store.getState().settings;
    if (!s?.services?.[idx]) return;

    row.querySelector('.srv-title')?.addEventListener('input', (e) => {
      s.services[idx].title = e.target.value;
      markDirty(store);
    });
    row.querySelector('.srv-desc')?.addEventListener('input', (e) => {
      s.services[idx].description = e.target.value;
      markDirty(store);
    });
    row.querySelector('.srv-detail')?.addEventListener('input', (e) => {
      s.services[idx].detail = e.target.value;
      markDirty(store);
    });
  });

  // FAQ inputs
  container.querySelectorAll('[data-faq-idx]').forEach((row) => {
    const idx = Number(row.getAttribute('data-faq-idx'));
    const s = store.getState().settings;
    if (!s?.faqs?.[idx]) return;

    row.querySelector('.faq-q')?.addEventListener('input', (e) => {
      s.faqs[idx].question = e.target.value;
      markDirty(store);
    });
    row.querySelector('.faq-a')?.addEventListener('input', (e) => {
      s.faqs[idx].answer = e.target.value;
      markDirty(store);
    });
  });

  // Remove FAQ buttons
  container.querySelectorAll('.remove-faq-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.getAttribute('data-faq-idx'));
      const s = store.getState().settings;
      if (s?.faqs) {
        s.faqs.splice(idx, 1);
        markDirty(store);
        renderStudioTab(container, store);
      }
    });
  });

  // Add FAQ button
  container.querySelector('#add-faq-btn')?.addEventListener('click', () => {
    const s = store.getState().settings;
    if (s?.faqs && s.faqs.length < 16) {
      s.faqs.push({ question: 'New question', answer: 'Add your answer here.' });
      markDirty(store);
      renderStudioTab(container, store);
    }
  });
}
