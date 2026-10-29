import { initProjectPage, getSlugFromPath, renderProject } from './features/project/project-page.js';

export { initProjectPage, getSlugFromPath, renderProject };

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initProjectPage());
  } else {
    initProjectPage();
  }
}
