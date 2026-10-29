/**
 * MONDO content operations compatibility facade.
 * Re-exports domain operations from cohesive src/services modules.
 */

export {
  getProjects,
  getProjectBySlug,
  saveProject
} from '../src/services/project.service.js';

export {
  getSettings,
  saveSettings
} from '../src/services/settings.service.js';

export {
  submitEnquiry,
  getEnquiries,
  updateEnquiryStatus,
  deleteEnquiry
} from '../src/services/enquiry.service.js';

export {
  recordEvent,
  getActivityMetrics
} from '../src/services/activity.service.js';
