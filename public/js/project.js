import {
  initProjectPage,
  getSlugFromPath,
  renderProject,
  renderErrorState,
  mountProject,
  unmountProject,
  mount,
  unmount,
  areProjectsEquivalent,
  areRelatedProjectsEquivalent,
  trackProjectView,
  resetProjectTrackingState
} from './features/project/project-page.js';

export {
  initProjectPage,
  getSlugFromPath,
  renderProject,
  renderErrorState,
  mountProject,
  unmountProject,
  mount,
  unmount,
  areProjectsEquivalent,
  areRelatedProjectsEquivalent,
  trackProjectView,
  resetProjectTrackingState
};

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initProjectPage());
  } else {
    initProjectPage();
  }
}
