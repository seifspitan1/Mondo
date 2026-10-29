import { icons } from '../../shared/icons.js';

/**
 * Initializes the header navigation drawer, hamburger button state, and dynamic footer year.
 * Idempotent: safe to invoke multiple times without attaching duplicate event listeners.
 * @param {object} [options]
 * @param {Document|HTMLElement} [options.root=document]
 * @returns {Function|void} Optional cleanup function
 */
export function initNavigation({ root = document } = {}) {
  const toggleBtn = root.querySelector('.menu-toggle');
  const mainNav = root.querySelector('.main-nav');

  if (toggleBtn && mainNav) {
    if (toggleBtn.dataset.navInitialized !== 'true') {
      toggleBtn.dataset.navInitialized = 'true';

      const handleToggle = () => {
        const isOpen = mainNav.classList.toggle('is-open');
        toggleBtn.setAttribute('aria-expanded', String(isOpen));
        toggleBtn.innerHTML = isOpen ? icons.close(22) : icons.menu(22);
      };

      toggleBtn.addEventListener('click', handleToggle);

      // Close mobile nav when clicking a nav link
      const links = mainNav.querySelectorAll('a');
      const handleLinkClick = () => {
        mainNav.classList.remove('is-open');
        toggleBtn.setAttribute('aria-expanded', 'false');
        toggleBtn.innerHTML = icons.menu(22);
      };

      links.forEach((link) => {
        link.addEventListener('click', handleLinkClick);
      });
    }
  }

  // Update footer year dynamically if element exists
  const yearEl = root.getElementById ? root.getElementById('footer-year') : root.querySelector('#footer-year');
  if (yearEl) {
    yearEl.textContent = String(new Date().getFullYear());
  }
}
