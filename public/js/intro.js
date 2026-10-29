import { initIntro, shouldShowIntro, markShown, prefersReducedMotion } from './features/intro/intro.js';

export { initIntro, shouldShowIntro, markShown, prefersReducedMotion };

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initIntro());
  } else {
    initIntro();
  }
}
