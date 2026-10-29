/**
 * MONDO Frontend API Client
 * Root compatibility entry point re-exporting from shared module.
 */

export {
  loadPublicContent,
  track,
  submitEnquiry,
  adminLogin,
  checkSession,
  adminLogout,
  saveProject,
  saveSettings,
  updateEnquiryStatus,
  deleteEnquiry,
  uploadMedia
} from './shared/api.js';
