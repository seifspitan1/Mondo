/**
 * MONDO Validation and Security compatibility facade.
 * Re-exports schemas from src/schemas/* and utilities from src/utils/*.
 */

export {
  webUrl,
  safeUrl,
  mediaUrl,
  firstError
} from '../src/schemas/common.js';

export { projectSchema } from '../src/schemas/project.schema.js';
export { packageSchema, settingsSchema } from '../src/schemas/settings.schema.js';
export { enquirySchema, enquiryStatuses } from '../src/schemas/enquiry.schema.js';
export { eventSchema } from '../src/schemas/event.schema.js';

export { matchesSignature, allowedMediaTypes } from '../src/utils/signatures.js';
export { sameOrigin } from '../src/utils/csrf.js';
