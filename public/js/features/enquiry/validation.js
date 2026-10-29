/**
 * MONDO Enquiry Validation & Payload Helpers
 * Pure functions with zero DOM dependency for testability.
 */

/**
 * Checks whether the spam honeypot field was filled.
 * @param {FormData} formData
 * @returns {boolean} True if honeypot was triggered (spam detected)
 */
export function isHoneypotTriggered(formData) {
  if (!formData || typeof formData.get !== 'function') return false;
  const val = formData.get('website');
  return Boolean(val && String(val).trim().length > 0);
}

/**
 * Builds the canonical enquiry payload object from form data and an idempotency request ID.
 * @param {FormData} formData
 * @param {string} requestId - UUID request idempotency token
 * @returns {object} Canonical payload object
 */
export function buildEnquiryPayload(formData, requestId) {
  const getStr = (name) => String((formData && formData.get(name)) || '').trim();
  const consentRaw = formData ? formData.get('consent') : null;
  const consent = consentRaw === 'on' || consentRaw === 'true' || consentRaw === true;

  return {
    id: requestId,
    name: getStr('name'),
    email: getStr('email'),
    discord: getStr('discord'),
    gameUrl: getStr('gameUrl'),
    service: getStr('service'),
    packageName: getStr('packageName'),
    goal: getStr('goal'),
    budget: getStr('budget'),
    deadline: getStr('deadline'),
    consent,
    website: ''
  };
}

/**
 * Validates the enquiry payload against business rules.
 * @param {object} payload
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateEnquiryPayload(payload) {
  if (!payload || !payload.consent) {
    return { valid: false, error: 'Please agree to the privacy notice.' };
  }
  if (!payload.name || payload.name.length < 2) {
    return { valid: false, error: 'Please add your name or studio.' };
  }
  if (!payload.email || !payload.email.includes('@')) {
    return { valid: false, error: 'Please use a valid email.' };
  }
  if (!payload.goal || payload.goal.length < 15) {
    return { valid: false, error: 'Tell us a little more about your game and goal.' };
  }
  return { valid: true };
}
