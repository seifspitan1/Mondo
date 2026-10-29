import { uploadMedia as defaultUploadMedia } from '../../../shared/api.js';

/**
 * Handles project media file uploads with asynchronous safety guards.
 * Prevents late responses from updating a closed or switched project editor.
 *
 * @param {File} file
 * @param {'image'|'video'} kind
 * @param {Object} store
 * @param {Function} renderProjectsTab
 * @param {Object} context
 */
export async function uploadProjectMedia(file, kind, store, renderProjectsTab, context = {}) {
  if (!file) return;

  const currentEditor = store.getState().editor;
  if (!currentEditor) return;
  const targetProjectId = currentEditor.id;

  const uploadFn = context.uploadMedia || defaultUploadMedia;

  store.setUploading(kind);
  renderProjectsTab();

  try {
    const res = await uploadFn(file);

    // Stale response safety guard: verify the editor is still open for the same project
    const latestEditor = store.getState().editor;
    if (latestEditor && latestEditor.id === targetProjectId) {
      if (kind === 'image') {
        store.updateEditor({ image: res.url });
      } else if (kind === 'video') {
        store.updateEditor({ video: res.url });
      }
      store.notice('File uploaded. Save the project to persist.');
    } else {
      console.warn('Upload completed for a project editor that is no longer active.');
    }
  } catch (err) {
    store.notice(err.message || 'File upload failed.', true);
  } finally {
    store.setUploading('');
    renderProjectsTab();
  }
}
