import { initWorkPage, mountWork, unmountWork, mount, unmount } from './features/work/work-page.js';

export { initWorkPage, mountWork, unmountWork, mount, unmount };

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initWorkPage());
  } else {
    initWorkPage();
  }
}
