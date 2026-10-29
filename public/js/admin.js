/**
 * MONDO Admin Panel — Entry Point
 * Orchestrates Admin bootstrap, session management, and feature controllers.
 */

import { initAdminApp } from './features/admin/admin-app.js';
import { adminStore } from './features/admin/state.js';
import { icons } from './shared/icons.js';
import {
  checkSession,
  adminLogin,
  adminLogout,
  saveProject,
  saveSettings,
  updateEnquiryStatus,
  deleteEnquiry,
  uploadMedia
} from './shared/api.js';
import { escapeHtml } from './shared/dom.js';

export {
  initAdminApp,
  adminStore,
  icons,
  checkSession,
  adminLogin,
  adminLogout,
  saveProject,
  saveSettings,
  updateEnquiryStatus,
  deleteEnquiry,
  uploadMedia,
  escapeHtml
};

// Automatic bootstrap on DOM ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initAdminApp());
  } else {
    initAdminApp();
  }
}
