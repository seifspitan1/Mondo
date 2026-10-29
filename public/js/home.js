import { initHome } from './features/home/home-page.js';

export { initHome };

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initHome());
  } else {
    initHome();
  }
}
