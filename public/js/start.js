import {
  initEnquiryPage,
  mountEnquiry,
  unmountEnquiry,
  mount,
  unmount,
  initEnquiryParams,
  setupEnquiryForm,
  renderSuccessMarkup
} from './features/enquiry/enquiry-form.js';
import { validateEnquiryPayload, isHoneypotTriggered, buildEnquiryPayload } from './features/enquiry/validation.js';

export {
  initEnquiryPage,
  mountEnquiry,
  unmountEnquiry,
  mount,
  unmount,
  initEnquiryParams,
  setupEnquiryForm,
  renderSuccessMarkup,
  validateEnquiryPayload,
  isHoneypotTriggered,
  buildEnquiryPayload
};

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initEnquiryPage());
  } else {
    initEnquiryPage();
  }
}
