import { initHome, mountHome, unmountHome, mount, unmount } from './features/home/home-page.js';

export { initHome, mountHome, unmountHome, mount, unmount };

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initHome());
  } else {
    initHome();
  }
}
