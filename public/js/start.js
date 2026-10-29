import { initEnquiryPage, initEnquiryParams, setupEnquiryForm, renderSuccessMarkup } from './features/enquiry/enquiry-form.js';
import { validateEnquiryPayload, isHoneypotTriggered, buildEnquiryPayload } from './features/enquiry/validation.js';

export {
  initEnquiryPage,
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
