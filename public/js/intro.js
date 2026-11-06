import {
  initIntro,
  shouldShowIntro,
  markShown,
  prefersReducedMotion,
  DUR_MS,
  MAX_WAIT_MS,
  ASSET_PATHS
} from './features/intro/intro.js';

export {
  initIntro,
  shouldShowIntro,
  markShown,
  prefersReducedMotion,
  DUR_MS,
  MAX_WAIT_MS,
  ASSET_PATHS
};

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initIntro());
  } else {
    initIntro();
  }
}
