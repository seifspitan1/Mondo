import { adminStore } from './state.js';
import { renderLogin } from './auth.js';
import { renderDashboard } from './dashboard.js';
import * as defaultApiClient from '../../shared/api.js';

/**
 * Factory for creating an Admin Application Controller instance.
 * Allows deterministic isolation in automated tests while running
 * the single production instance in the browser.
 *
 * @param {Object} options
 * @returns {Object}
 */
export function createAdminApp(options = {}) {
  const store = options.store || adminStore;
  const apiClient = options.apiClient || defaultApiClient;
  const getRoot = typeof options.getRoot === 'function'
    ? options.getRoot
    : () => (typeof document !== 'undefined' ? document.getElementById('admin-root') : null);

  let initialized = false;
  let sessionSequence = 0;

  const context = {
    store,
    adminLogin: apiClient.adminLogin,
    adminLogout: apiClient.adminLogout,
    saveProject: apiClient.saveProject,
    saveSettings: apiClient.saveSettings,
    updateEnquiryStatus: apiClient.updateEnquiryStatus,
    deleteEnquiry: apiClient.deleteEnquiry,
    uploadMedia: apiClient.uploadMedia,
    renderDashboard: () => {
      const root = getRoot();
      if (root) renderDashboard(root, store, context);
    },
    onLoginSuccess: async () => {
      await refreshSession();
    },
    onLogoutSuccess: () => {
      sessionSequence++; // Invalidate any pending session responses
      const root = getRoot();
      if (root) renderLogin(root, '', context);
    }
  };

  /**
   * Refreshes the active authentication session with async race-condition safety.
   */
  async function refreshSession() {
    const currentSeq = ++sessionSequence;
    const root = getRoot();

    try {
      const session = await apiClient.checkSession();

      // Guard: If logout or a newer checkSession occurred in-flight, discard stale response
      if (currentSeq !== sessionSequence) {
        return;
      }

      if (session && session.authenticated) {
        store.setUser(session.user);
        store.setProjects(session.projects || []);
        store.setSettings(session.settings || null);
        store.setEnquiries(session.enquiries || []);
        store.setActivity(session.activity || {});

        if (root) {
          renderDashboard(root, store, context);
        }
      } else {
        store.reset();
        if (root) {
          renderLogin(root, '', context);
        }
      }
    } catch (err) {
      if (currentSeq !== sessionSequence) return;
      store.reset();
      if (root) {
        renderLogin(root, err.message || 'Session verification failed.', context);
      }
    }
  }

  /**
   * Bootstraps the admin application once.
   */
  function init() {
    if (initialized) {
      return;
    }
    initialized = true;
    return refreshSession();
  }

  return {
    init,
    refreshSession,
    getContext: () => context,
    getStore: () => store,
    isInitialized: () => initialized
  };
}

let defaultAppInstance = null;

/**
 * Production bootstrap function invoked by public/js/admin.js.
 */
export function initAdminApp() {
  if (!defaultAppInstance) {
    defaultAppInstance = createAdminApp();
  }
  return defaultAppInstance.init();
}
