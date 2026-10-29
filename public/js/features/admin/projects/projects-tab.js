import { icons } from '../../../shared/icons.js';
import { escapeHtml } from '../../../shared/dom.js';
import { generateProjectEditorHtml, bindProjectEditorEvents } from './project-editor.js';

/**
 * Generates the complete HTML for the Projects tab.
 * @param {Object} state
 * @returns {string}
 */
export function generateProjectsTabHtml(state) {
  const editorHtml = state.editor ? generateProjectEditorHtml(state.editor, state) : '';

  return `
    <div class="admin-toolbar">
      <div>
        <h2>Portfolio projects</h2>
        <p>Click a project to edit. Hidden drafts stay out of the public portfolio.</p>
      </div>
      <button class="button" id="add-project-btn">
        ${icons.plus(14)} Add project
      </button>
    </div>

    ${editorHtml}

    <div class="admin-project-list">
      ${state.projects
        .map(
          (p) => `
        <button class="admin-project" data-id="${escapeHtml(p.id)}">
          <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.title)}" width="800" height="450" />
          <h3>${escapeHtml(p.title)}</h3>
          <div class="project-flags">
            <span class="tag ${p.published ? 'tag-green' : ''}">${p.published ? 'Published' : 'Hidden'}</span>
            <span>${escapeHtml(p.category)}</span>
            ${p.featured ? '<span>· Featured</span>' : ''}
          </div>
        </button>
      `
        )
        .join('')}
    </div>
  `;
}

/**
 * Renders the Projects workspace tab and attaches event listeners.
 *
 * @param {HTMLElement|string} target
 * @param {Object} store
 * @param {Object} context
 */
export function renderProjectsTab(target, store, context = {}) {
  const container = typeof target === 'string' ? document.getElementById(target) : target;
  if (!container) return;

  const state = store.getState();
  container.innerHTML = generateProjectsTabHtml(state);

  // Add project button
  container.querySelector('#add-project-btn')?.addEventListener('click', () => {
    const currentState = store.getState();
    const newProject = {
      id: crypto.randomUUID(),
      slug: '',
      title: '',
      category: 'Thumbnails',
      image: '',
      video: '',
      description: '',
      objective: '',
      hook: '',
      role: 'Creative direction · GFX',
      published: false,
      featured: false,
      concept: false,
      order: currentState.projects.length
    };

    store.setEditor(newProject);
    store.notice('');
    renderProjectsTab(container, store, context);
  });

  // Project cards selection
  container.querySelectorAll('.admin-project').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.getAttribute('data-id');
      const p = store.getState().projects.find((x) => x.id === id);
      if (p) {
        store.setEditor({ ...p });
        store.notice('');
        renderProjectsTab(container, store, context);
        if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
    });
  });

  // Project editor events (if editor is active)
  if (state.editor) {
    bindProjectEditorEvents(container, store, () => renderProjectsTab(container, store, context), context);
  }
}
