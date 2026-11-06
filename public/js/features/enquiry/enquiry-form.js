import { icons } from '../../shared/icons.js';
import { escapeHtml } from '../../shared/dom.js';
import { submitEnquiry, track, loadPublicContent } from '../../shared/api.js';
import { isHoneypotTriggered, buildEnquiryPayload, validateEnquiryPayload } from './validation.js';

/**
 * Initializes form parameters from the current URL query string.
 * Prefills the service select and selected package banner.
 * @param {string|URLSearchParams} [search]
 * @param {object} [options]
 * @param {Document|HTMLElement} [options.root=document]
 */
export function initEnquiryParams(
  search = (typeof window !== 'undefined' ? window.location.search : ''),
  { root = document } = {}
) {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const service = params.get('service') || '';
  const packageName = params.get('package') || '';

  const serviceSelect = root.getElementById ? root.getElementById('service-select') : root.querySelector('#service-select');
  if (serviceSelect && service) {
    for (const opt of serviceSelect.options) {
      if (opt.value === service) {
        opt.selected = true;
        break;
      }
    }
  }

  const packageWrap = root.getElementById ? root.getElementById('selected-package-wrap') : root.querySelector('#selected-package-wrap');
  const packageInput = root.getElementById ? root.getElementById('package-name-input') : root.querySelector('#package-name-input');
  if (packageName) {
    if (packageInput) packageInput.value = packageName;
    if (packageWrap) {
      packageWrap.style.display = 'flex';
      packageWrap.innerHTML = `
        <span class="lime-dot"></span>
        <span>LET’S TALK <strong>${escapeHtml(packageName)}</strong></span>
        <a href="/#packages" aria-label="Change selected package">Change ${icons.arrowUpRight(14)}</a>
      `;
    }
  }
}

/**
 * Pure generator rendering the brief submission success confirmation card.
 * @param {string} id - UUID or response ID
 * @returns {string} HTML string
 */
export function renderSuccessMarkup(id) {
  const ref = (id || '').slice(0, 8).toUpperCase();
  return `
    <div class="form-success" role="status">
      <span class="success-mark">${icons.check(34)}</span>
      <p class="eyebrow">YOUR NEXT MOVE STARTS HERE</p>
      <h2>You’re on<br />our radar.</h2>
      <p>Your project brief has been received. We’ll review it and follow up using the contact details you provided.</p>
      <p class="reference">Your reference: ${escapeHtml(ref)}</p>
      <a class="button" href="/work">Explore the studio ${icons.arrowUpRight(18)}</a>
    </div>
  `;
}

/**
 * Sets up enquiry form listeners, client validation, idempotency token, and submission.
 * Idempotent: safe against duplicate bindings.
 * @param {object} [options]
 * @param {Document|HTMLElement} [options.root=document]
 * @param {Function} [options.apiSubmit=submitEnquiry]
 * @param {Function} [options.trackEvent=track]
 */
export function setupEnquiryForm({
  root = document,
  apiSubmit = submitEnquiry,
  trackEvent = track
} = {}) {
  const form = root.getElementById ? root.getElementById('enquiry-form') : root.querySelector('#enquiry-form');
  const formWrap = root.getElementById ? root.getElementById('enquiry-wrap') : root.querySelector('#enquiry-wrap');
  const submitBtn = root.getElementById ? root.getElementById('submit-btn') : root.querySelector('#submit-btn');
  const errorBox = root.getElementById ? root.getElementById('form-error') : root.querySelector('#form-error');

  if (!form || !formWrap) return;
  if (form.dataset.enquiryBound === 'true') return;
  form.dataset.enquiryBound = 'true';

  // Encapsulated state per form instance
  let requestId = '';
  let startedForm = false;

  // Track form_start on first focus
  form.addEventListener('focusin', () => {
    if (!startedForm) {
      startedForm = true;
      trackEvent('form_start');
    }
  });

  const showError = (msg) => {
    if (errorBox) {
      errorBox.textContent = msg;
      errorBox.style.display = 'block';
      if (typeof errorBox.scrollIntoView === 'function') {
        errorBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  };

  const showSuccess = (id) => {
    formWrap.innerHTML = renderSuccessMarkup(id);
    if (typeof formWrap.scrollIntoView === 'function') {
      formWrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (errorBox) {
      errorBox.style.display = 'none';
      errorBox.textContent = '';
    }

    // Preserve existing requestId on retry so server can detect duplicate/idempotent retry
    if (!requestId) {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        requestId = crypto.randomUUID();
      } else {
        requestId = 'req-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
      }
    }

    const formData = new FormData(form);

    // Spam honeypot: silently ignore bot submission
    if (isHoneypotTriggered(formData)) {
      return;
    }

    const payload = buildEnquiryPayload(formData, requestId);
    const validation = validateEnquiryPayload(payload);

    if (!validation.valid) {
      showError(validation.error || 'Please review the form fields.');
      return;
    }

    // Set loading state
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `${icons.spinner(19)} Sending your brief…`;
    }

    try {
      const result = await apiSubmit(payload);
      showSuccess(result.id || requestId);
    } catch (err) {
      showError(err.message || 'We couldn’t save your brief. Please try again; your details are still in the form.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `Send my project brief ${icons.arrowUpRight(20)}`;
      }
    }
  });
}

/**
 * Hydrates direct studio contact links into the page.
 * @param {object} [options]
 * @param {Document|HTMLElement} [options.root=document]
 * @param {Function} [options.fetchContent=loadPublicContent]
 */
export async function loadStudioContact({ root = document, fetchContent = loadPublicContent } = {}) {
  try {
    const data = await fetchContent();
    const contactWrap = root.getElementById ? root.getElementById('direct-contact-wrap') : root.querySelector('#direct-contact-wrap');
    if (contactWrap && data.settings) {
      const { discordUrl, email } = data.settings;
      if (discordUrl || email) {
        let html = '<span>Prefer a direct conversation?</span>';
        if (discordUrl) {
          html += `<a href="${escapeHtml(discordUrl)}" target="_blank" rel="noreferrer">Find us on Discord ${icons.arrowUpRight(16)}</a>`;
        }
        if (email) {
          html += `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)} ${icons.arrowUpRight(16)}</a>`;
        }
        contactWrap.innerHTML = html;
        contactWrap.style.display = 'flex';
      }
    }
  } catch {}
}

// Track active async operations for stale request cancellation
let activeEnquiryOp = 0;

/**
 * Phase 5C Stage G1: Route Lifecycle Contract — Mount Enquiry Page.
 * Parses query params from context/URL, attaches form validation & submission listeners,
 * and hydrates direct studio contacts.
 * Safe, idempotent, and cancellation-aware.
 *
 * @param {object} [context]
 * @param {Document|HTMLElement} [context.root=document]
 * @param {Function} [context.fetchContent=loadPublicContent]
 * @param {Function} [context.apiSubmit=submitEnquiry]
 * @param {Function} [context.trackEvent=track]
 * @param {string} [context.url]
 * @param {string|URLSearchParams} [context.search]
 * @param {number|string} [context.operationId]
 * @param {AbortSignal} [context.signal]
 * @returns {void}
 */
export function mountEnquiry({
  root = document,
  fetchContent = loadPublicContent,
  apiSubmit = submitEnquiry,
  trackEvent = track,
  url = '',
  search = '',
  operationId = null,
  signal = null
} = {}) {
  const scopeEl = root.body || (root.getElementById ? root.getElementById('enquiry-wrap') : null);
  if (scopeEl && scopeEl.dataset && scopeEl.dataset.enquiryMounted === 'true') {
    return;
  }
  if (scopeEl && scopeEl.dataset) {
    scopeEl.dataset.enquiryMounted = 'true';
    scopeEl.dataset.enquiryInitialized = 'true';
  }

  const currentOp = operationId || ++activeEnquiryOp;

  let searchStr = search;
  if (!searchStr && url && typeof url === 'string') {
    const qIndex = url.indexOf('?');
    if (qIndex !== -1) searchStr = url.slice(qIndex);
  }
  if (!searchStr && typeof window !== 'undefined') {
    searchStr = window.location.search;
  }

  initEnquiryParams(searchStr || '', { root });
  setupEnquiryForm({ root, apiSubmit, trackEvent });

  if (!signal || !signal.aborted) {
    loadStudioContact({
      root,
      fetchContent: async () => {
        const data = await fetchContent();
        if (currentOp !== activeEnquiryOp || (signal && signal.aborted)) {
          return {}; // Stale operation
        }
        return data;
      }
    });
  }
}

/**
 * Phase 5C Stage G1: Route Lifecycle Contract — Unmount Enquiry Page.
 * Releases form listeners, invalidates in-flight requests, and resets idempotency flags.
 *
 * @param {object} [context]
 * @param {Document|HTMLElement} [context.root=document]
 */
export function unmountEnquiry({ root = document } = {}) {
  // Invalidate in-flight async operations
  activeEnquiryOp++;

  const scopeEl = root.body || (root.getElementById ? root.getElementById('enquiry-wrap') : null);
  if (scopeEl && scopeEl.dataset) {
    delete scopeEl.dataset.enquiryMounted;
    delete scopeEl.dataset.enquiryInitialized;
  }

  const form = root.getElementById ? root.getElementById('enquiry-form') : root.querySelector('#enquiry-form');
  if (form) {
    delete form.dataset.enquiryBound;
    if (form.parentNode) {
      form.replaceWith(form.cloneNode(true));
    }
  }
}

// Canonical lifecycle aliases for Global Coordinator
export { mountEnquiry as mount, unmountEnquiry as unmount };

/**
 * Orchestrator initializing the enquiry page features:
 * Preserved for backward compatibility with direct document loads.
 *
 * @param {object} [options]
 * @param {Document|HTMLElement} [options.root=document]
 * @param {Function} [options.fetchContent=loadPublicContent]
 * @param {Function} [options.apiSubmit=submitEnquiry]
 * @param {Function} [options.trackEvent=track]
 */
export function initEnquiryPage({
  root = document,
  fetchContent = loadPublicContent,
  apiSubmit = submitEnquiry,
  trackEvent = track
} = {}) {
  return mountEnquiry({ root, fetchContent, apiSubmit, trackEvent });
}
