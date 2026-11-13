
import { icons } from '../../shared/icons.js';

export function scrollToAnchor(target, { smooth = true, updateHistory = false, clearance = null } = {}) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false;
  const id = typeof target === 'string' ? target.replace(/^#/, '') : target?.id;
  const sectionEl = id ? (document.getElementById(id) || document.querySelector('[name="' + CSS.escape(id) + '"]')) : target;
  if (!sectionEl) return false;

  const visibleEl = sectionEl.querySelector ? (sectionEl.querySelector('.eyebrow, .section-heading, h1, h2, h3') || sectionEl) : sectionEl;
  const isMobile = window.innerWidth <= 820;
  const effClearance = typeof clearance === 'number' ? clearance : (isMobile ? 20 : 28);
  const hH = document.querySelector('.site-header')?.offsetHeight || (isMobile ? 73 : 87);
  const scrollY = window.pageYOffset || document.documentElement?.scrollTop || 0;
  const targetTop = visibleEl.getBoundingClientRect().top + scrollY;
  const destY = Math.max(0, Math.round(targetTop - hH - effClearance));
  const isRed = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  if (updateHistory && id && window.location.hash !== '#' + id) {
    if (history?.pushState) history.pushState(null, '', '#' + id);
    else window.location.hash = '#' + id;
  }

  window.scrollTo({ top: destY, behavior: isRed ? 'instant' : (smooth ? 'smooth' : 'auto') });
  return true;
}

if (typeof window !== 'undefined') {
  window.__MONDO_SCROLL_TO_ANCHOR__ = scrollToAnchor;
}

export function initNavigation({ root = document } = {}) {
  const toggleBtn = root.querySelector('.menu-toggle');
  const mainNav = root.querySelector('.main-nav');

  if (toggleBtn && mainNav && toggleBtn.dataset.navInitialized !== 'true') {
    toggleBtn.dataset.navInitialized = 'true';

    toggleBtn.addEventListener('click', () => {
      const isOpen = mainNav.classList.toggle('is-open');
      toggleBtn.setAttribute('aria-expanded', String(isOpen));
      toggleBtn.innerHTML = isOpen ? icons.close(22) : icons.menu(22);
    });

    mainNav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', (e) => {
        const href = (e.currentTarget.getAttribute('href') || '').trim();
        mainNav.classList.remove('is-open');
        toggleBtn.setAttribute('aria-expanded', 'false');
        toggleBtn.innerHTML = icons.menu(22);

        if ((href.startsWith('#') || href.startsWith('/#')) && (location.pathname === '/' || location.pathname === '/index.html' || !location.pathname)) {
          e.preventDefault();
          scrollToAnchor(href.replace('/#', '#'), { smooth: true, updateHistory: true });
        }
      });
    });
  }

  const yearEl = root.getElementById ? root.getElementById('footer-year') : root.querySelector('#footer-year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  if (typeof window !== 'undefined' && window.location.hash) {
    const docEl = document.documentElement;
    if (!docEl.classList.contains('has-intro') && !docEl.classList.contains('is-quiet-mark-inbound')) {
      setTimeout(() => scrollToAnchor(window.location.hash, { smooth: false }), 20);
    }
  }
}
