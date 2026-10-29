import { icons } from '../../../shared/icons.js';
import { escapeHtml } from '../../../shared/dom.js';
import { slugify } from '../ui/rendering.js';
import { confirmCloseEditor } from '../ui/dialogs.js';
import { uploadProjectMedia } from './project-upload.js';
import { saveProject as defaultSaveProject } from '../../../shared/api.js';

/**
 * Generates HTML markup for the project editor form.
 * @param {Object} editor
 * @param {Object} state
 * @returns {string}
 */
export function generateProjectEditorHtml(editor, state) {
  if (!editor) return '';

  const isNew = !state.projects.some((p) => p.id === editor.id);

  return `
    <section class="admin-editor">
      <div class="editor-top">
        <h2>${isNew ? 'A new first impression' : 'Edit project'}</h2>
        <button class="icon-button" id="close-editor-btn" aria-label="Close editor">
          ${icons.close(16)}
        </button>
      </div>

      <form class="admin-form" id="project-form">
        <label>
          Project title
          <input id="proj-title" required maxlength="120" value="${escapeHtml(editor.title)}" />
        </label>

        <label>
          Project URL slug
          <input id="proj-slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxlength="100" value="${escapeHtml(editor.slug)}" />
          <span class="field-help">/work/${escapeHtml(editor.slug || 'your-project')}</span>
        </label>

        <label>
          Creative type
          <select id="proj-category">
            <option ${editor.category === 'Thumbnails' ? 'selected' : ''}>Thumbnails</option>
            <option ${editor.category === 'Trailers' ? 'selected' : ''}>Trailers</option>
            <option ${editor.category === 'Campaigns' ? 'selected' : ''}>Campaigns</option>
          </select>
        </label>

        <label>
          Display order
          <input id="proj-order" type="number" min="0" max="9999" value="${editor.order}" />
        </label>

        <div class="full-width">
          <span class="field-label">Cover image</span>
          <div class="upload-row">
            <input id="proj-image" value="${escapeHtml(editor.image)}" placeholder="Upload a cover or paste an HTTPS image URL" />
            <label class="upload-button">
              ${state.uploading === 'image' ? icons.spinner(13) : icons.upload(13)} Upload
              <input type="file" id="upload-image-input" accept="image/jpeg,image/png,image/webp" />
            </label>
          </div>
          <span class="field-help">JPG, PNG, or WebP. Up to 12 MB. Landscape images display best.</span>
        </div>

        <div class="full-width">
          <span class="field-label">Trailer video <span class="muted">optional</span></span>
          <div class="upload-row">
            <input id="proj-video" value="${escapeHtml(editor.video)}" placeholder="Direct MP4/WebM URL or an uploaded video" />
            <label class="upload-button">
              ${state.uploading === 'video' ? icons.spinner(13) : icons.upload(13)} Upload
              <input type="file" id="upload-video-input" accept="video/mp4,video/webm" />
            </label>
          </div>
          <span class="field-help">MP4 or WebM up to 80 MB. A published trailer needs a playable video file.</span>
        </div>

        <label class="full-width">
          Project introduction
          <textarea id="proj-desc" required maxlength="3000">${escapeHtml(editor.description)}</textarea>
        </label>

        <label>
          The objective
          <textarea id="proj-objective" maxlength="1500">${escapeHtml(editor.objective)}</textarea>
        </label>

        <label>
          The creative hook
          <textarea id="proj-hook" maxlength="1500">${escapeHtml(editor.hook)}</textarea>
        </label>

        <label class="full-width">
          MONDO’s role
          <input id="proj-role" maxlength="300" value="${escapeHtml(editor.role)}" placeholder="Creative direction · GFX · Editing" />
        </label>

        <label class="checkbox-row">
          <input id="proj-published" type="checkbox" ${editor.published ? 'checked' : ''} />
          <span>Published in the portfolio</span>
        </label>

        <label class="checkbox-row">
          <input id="proj-featured" type="checkbox" ${editor.featured ? 'checked' : ''} />
          <span>Featured in the home hero</span>
        </label>

        <label class="checkbox-row full-width">
          <input id="proj-concept" type="checkbox" ${editor.concept ? 'checked' : ''} />
          <span>Label as a concept project</span>
        </label>

        <div class="editor-actions">
          <button type="submit" class="button" id="save-proj-btn" ${state.busy ? 'disabled' : ''}>
            ${state.busy ? `${icons.spinner(15)} Saving…` : `${icons.save(15)} Save project`}
          </button>
        </div>
      </form>
    </section>
  `;
}

/**
 * Binds interaction and lifecycle events to the project editor form.
 *
 * @param {HTMLElement} container
 * @param {Object} store
 * @param {Function} renderProjectsTab
 * @param {Object} context
 */
export function bindProjectEditorEvents(container, store, renderProjectsTab, context = {}) {
  const editor = store.getState().editor;
  if (!editor) return;

  const saveFn = context.saveProject || defaultSaveProject;

  // Close editor button
  const closeBtn = container.querySelector('#close-editor-btn');
  closeBtn?.addEventListener('click', () => {
    if (confirmCloseEditor()) {
      store.setEditor(null);
      renderProjectsTab();
    }
  });

  // Title and auto-slug
  const titleInput = container.querySelector('#proj-title');
  const slugInput = container.querySelector('#proj-slug');
  titleInput?.addEventListener('input', (ev) => {
    const val = ev.target.value;
    const currentEditor = store.getState().editor;
    if (!currentEditor) return;

    const oldSlug = currentEditor.slug;
    const oldTitle = currentEditor.title;
    currentEditor.title = val;

    if (!oldSlug || oldSlug === slugify(oldTitle)) {
      currentEditor.slug = slugify(val);
      if (slugInput) slugInput.value = currentEditor.slug;
    }
  });

  slugInput?.addEventListener('input', (ev) => {
    const currentEditor = store.getState().editor;
    if (currentEditor) currentEditor.slug = ev.target.value;
  });

  // Other form fields
  container.querySelector('#proj-category')?.addEventListener('change', (ev) => {
    const currentEditor = store.getState().editor;
    if (currentEditor) currentEditor.category = ev.target.value;
  });

  container.querySelector('#proj-order')?.addEventListener('input', (ev) => {
    const currentEditor = store.getState().editor;
    if (currentEditor) currentEditor.order = Number(ev.target.value);
  });

  container.querySelector('#proj-image')?.addEventListener('input', (ev) => {
    const currentEditor = store.getState().editor;
    if (currentEditor) currentEditor.image = ev.target.value;
  });

  container.querySelector('#proj-video')?.addEventListener('input', (ev) => {
    const currentEditor = store.getState().editor;
    if (currentEditor) currentEditor.video = ev.target.value;
  });

  container.querySelector('#proj-desc')?.addEventListener('input', (ev) => {
    const currentEditor = store.getState().editor;
    if (currentEditor) currentEditor.description = ev.target.value;
  });

  container.querySelector('#proj-objective')?.addEventListener('input', (ev) => {
    const currentEditor = store.getState().editor;
    if (currentEditor) currentEditor.objective = ev.target.value;
  });

  container.querySelector('#proj-hook')?.addEventListener('input', (ev) => {
    const currentEditor = store.getState().editor;
    if (currentEditor) currentEditor.hook = ev.target.value;
  });

  container.querySelector('#proj-role')?.addEventListener('input', (ev) => {
    const currentEditor = store.getState().editor;
    if (currentEditor) currentEditor.role = ev.target.value;
  });

  container.querySelector('#proj-published')?.addEventListener('change', (ev) => {
    const currentEditor = store.getState().editor;
    if (currentEditor) currentEditor.published = ev.target.checked;
  });

  container.querySelector('#proj-featured')?.addEventListener('change', (ev) => {
    const currentEditor = store.getState().editor;
    if (currentEditor) currentEditor.featured = ev.target.checked;
  });

  container.querySelector('#proj-concept')?.addEventListener('change', (ev) => {
    const currentEditor = store.getState().editor;
    if (currentEditor) currentEditor.concept = ev.target.checked;
  });

  // File uploads
  container.querySelector('#upload-image-input')?.addEventListener('change', (ev) => {
    const file = ev.target.files?.[0];
    uploadProjectMedia(file, 'image', store, renderProjectsTab, context);
  });

  container.querySelector('#upload-video-input')?.addEventListener('change', (ev) => {
    const file = ev.target.files?.[0];
    uploadProjectMedia(file, 'video', store, renderProjectsTab, context);
  });

  // Save project form submission
  container.querySelector('#project-form')?.addEventListener('submit', async (ev) => {
    ev.preventDefault();

    const state = store.getState();
    if (state.busy || !state.editor) return;

    store.setBusy(true);
    renderProjectsTab();

    try {
      const res = await saveFn(store.getState().editor);
      const currentProjects = store.getState().projects;
      const updatedList = [...currentProjects.filter((p) => p.id !== res.project.id), res.project].sort(
        (a, b) => a.order - b.order
      );

      store.setProjects(updatedList);
      store.setEditor(null);
      store.notice(res.project.published ? 'Project saved and visible in portfolio.' : 'Project saved as hidden draft.');
    } catch (err) {
      store.notice(err.message || 'Could not save the project.', true);
    } finally {
      store.setBusy(false);
      renderProjectsTab();
    }
  });
}
