import { initWorkPage } from './features/work/work-page.js';

export { initWorkPage };

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initWorkPage());
  } else {
    initWorkPage();
  }
}
