/**
 * MONDO Shared DOM Utilities
 */

/**
 * Safely escapes XML/HTML control characters to prevent XSS.
 * @param {*} str - Input value to escape
 * @returns {string} Escaped HTML string
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
