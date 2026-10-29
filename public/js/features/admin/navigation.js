import { confirmCloseEditorOnTabSwitch } from './ui/dialogs.js';
import { handleLogout } from './auth.js';
import { saveSettings as defaultSaveSettings } from '../../shared/api.js';

/**
 * Binds sidebar navigation, sign out, and bottom save bar events.
 *
 * @param {HTMLElement} rootContainer
 * @param {Object} store
 * @param {Object} context
 */
export function bindNavigationEvents(rootContainer, store, context = {}) {
  const saveFn = context.saveSettings || defaultSaveSettings;

  // Sidebar tab buttons
  rootContainer.querySelectorAll('.admin-nav button').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      const state = store.getState();

      if (state.editor && !confirmCloseEditorOnTabSwitch()) {
        return;
      }

      store.setEditor(null);
      store.setTab(target);
      store.notice('');

      if (typeof context.renderDashboard === 'function') {
        context.renderDashboard();
      }
    });
  });

  // Sign out button
  rootContainer.querySelector('#sign-out-btn')?.addEventListener('click', async () => {
    await handleLogout(context);
  });

  // Save settings button (active in Studio and Packages tabs)
  rootContainer.querySelector('#save-settings-btn')?.addEventListener('click', async () => {
    const state = store.getState();
    if (state.busy || !state.dirty) return;

    store.setBusy(true);
    if (typeof context.renderDashboard === 'function') {
      context.renderDashboard();
    }

    try {
      await saveFn(store.getState().settings);
      store.setDirty(false);
      store.notice('Studio content saved. Your website now uses these changes.');
    } catch (err) {
      store.notice(err.message || 'Could not save settings.', true);
    } finally {
      store.setBusy(false);
      if (typeof context.renderDashboard === 'function') {
        context.renderDashboard();
      }
    }
  });
}
