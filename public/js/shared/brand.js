/**
 * MONDO — Brand Logo System
 * Reusable shared markup for the authentic MONDO mark (/assets/mondo-mark.webp).
 *
 * Four emphasis levels:
 * - compact:    ~24-28px — eyebrows, small actions
 * - signature:  ~36-44px — section headings, card info
 * - persistent: ~48-56px — header brand lockup
 * - moment:     ~220-280px — intro reveal, closing footer area
 *
 * All instances use the authentic source asset: /assets/mondo-mark.webp
 * Decorative instances are aria-hidden and pointer-events: none.
 */

/**
 * Returns an HTML string for the MONDO mark at the given emphasis level.
 * @param {'compact'|'signature'|'persistent'|'moment'} level
 * @param {object} [opts]
 * @param {number} [opts.size] - Override height in px
 * @param {string} [opts.cls] - Additional CSS class
 * @param {boolean} [opts.decorative] - If true, aria-hidden + role="presentation" (default: true)
 * @returns {string}
 */
export function mondoMark(level = 'signature', opts = {}) {
  const sizes = {
    compact: 24,
    signature: 40,
    persistent: 52,
    moment: 260
  };

  const height = opts.size || sizes[level] || sizes.signature;
  // Authentic mark aspect ratio is ~0.735 (633 / 861)
  const width = Math.round(height * (633 / 861));
  const decorative = opts.decorative !== false;
  const cls = `mondo-mark mondo-mark--${level}${opts.cls ? ' ' + opts.cls : ''}`;

  const ariaAttrs = decorative
    ? 'aria-hidden="true" role="presentation"'
    : 'alt="MONDO"';

  const altAttr = decorative ? 'alt=""' : 'alt="MONDO"';

  return `<img
    src="/assets/mondo-mark.webp"
    ${altAttr}
    class="${cls}"
    width="${width}"
    height="${height}"
    loading="lazy"
    decoding="async"
    ${ariaAttrs}
  />`;
}

/**
 * Returns the section signature: authentic logo mark for section headings.
 * @param {string} [cls] - additional CSS class
 * @returns {string}
 */
export function sectionSignature(cls = '') {
  return `<span class="section-signature${cls ? ' ' + cls : ''}" aria-hidden="true">${mondoMark('signature', { size: 38 })}</span>`;
}
