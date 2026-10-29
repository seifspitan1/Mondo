/**
 * MONDO Admin Rendering & String Utilities
 */

/**
 * Generates a clean URL slug from a title string.
 * Preserves exact behavior from original admin.js.
 * @param {*} val
 * @returns {string}
 */
export const slugify = (val) =>
  String(val || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
