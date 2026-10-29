/**
 * MONDO Admin Dialog & Confirmation Guards
 * Encapsulates modal confirmations for consistent behavior and test mocking.
 */

export function confirmCloseEditor() {
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return window.confirm('Close this project without saving?');
  }
  return true;
}

export function confirmCloseEditorOnTabSwitch() {
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return window.confirm('Close this project editor without saving your changes?');
  }
  return true;
}

export function confirmDeleteEnquiry() {
  if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
    return window.confirm('Permanently delete this enquiry and its contact details?');
  }
  return true;
}
