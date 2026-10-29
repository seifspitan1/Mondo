import { escapeHtml } from './shared/dom.js';
import { initNavigation } from './features/navigation/navigation.js';
import { renderProjectCard } from './features/work/card.js';
import { icons } from './shared/icons.js';
import { track } from './shared/api.js';

export { escapeHtml, initNavigation, renderProjectCard, icons, track };

// Auto-run initNavigation on DOMContentLoaded
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initNavigation());
  } else {
    initNavigation();
  }
}
