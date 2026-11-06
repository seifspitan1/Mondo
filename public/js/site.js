import { escapeHtml } from './shared/dom.js';
import { initNavigation } from './features/navigation/navigation.js';
import { renderProjectCard } from './features/work/card.js';
import { icons } from './shared/icons.js';
import { track } from './shared/api.js';
import { initQuietMark } from './features/transitions/quiet-mark.js';
import { initOfflinePreparation } from './shared/offline-preparation.js';
import {
  isHybridPilotEnabled,
  DEFAULT_HYBRID_PILOT_ENABLED,
  isAllowedLocalPilotHost,
  GATE_1_ACTIVATION_LOCK
} from './features/navigation/pilot-gate.js';

/**
 * Feature-gated Hybrid Navigation Pilot bootstrap (Phase 5D-C.2A).
 * Under default production navigation (DEFAULT_HYBRID_PILOT_ENABLED = false),
 * immediately returns disabled status without downloading, parsing, or executing
 * dormant hybrid coordinator or duplicated page runtime modules.
 * Only if explicit local opt-in is authorized on an allowed host does it dynamically
 * load the hybrid runtime module.
 *
 * @param {object} [options={}]
 * @returns {object|Promise<object>}
 */
export function initHybridNavigationPilot(options = {}) {
  const win = options.window || (typeof window !== 'undefined' ? window : null);
  if (!isHybridPilotEnabled({ ...options, window: win })) {
    const reason = GATE_1_ACTIVATION_LOCK
      ? 'gate_1_locked'
      : (!isAllowedLocalPilotHost(win) ? 'non_local_host_prohibited' : 'feature_flag_disabled');
    return {
      active: false,
      status: 'disabled',
      reason
    };
  }

  // Explicitly authorized local pilot: dynamically import coordinator binding
  const hybridSpecifier = typeof window !== 'undefined'
    ? '/js/features/navigation/coordinator-binding.js'
    : './features/navigation/coordinator-binding.js';

  return import(hybridSpecifier)
    .then((mod) => mod.initHybridNavigationPilot(options))
    .catch((err) => {
      console.error('[MONDO] Failed to load Hybrid Navigation runtime:', err);
      return {
        active: false,
        status: 'disabled',
        reason: 'dynamic_import_failed',
        error: err
      };
    });
}

/**
 * Programmatically disables the hybrid pilot if active.
 *
 * @param {object} [options={}]
 * @returns {object}
 */
export function disableHybridNavigationPilot(options = {}) {
  const win = options.window || (typeof window !== 'undefined' ? window : null);
  if (win) {
    win.__MONDO_HYBRID_NAV_DISABLED__ = true;
  }
  if (win && win.__MONDO_HYBRID_PILOT__ && typeof win.__MONDO_HYBRID_PILOT__.disable === 'function') {
    return win.__MONDO_HYBRID_PILOT__.disable(options.reason || 'manual_disable');
  }
  return {
    active: false,
    status: 'disabled',
    teardownStatus: 'finalized',
    deferred: false,
    reason: options.reason || 'manual_disable'
  };
}

export {
  escapeHtml,
  initNavigation,
  renderProjectCard,
  icons,
  track,
  initQuietMark,
  initOfflinePreparation,
  isHybridPilotEnabled,
  DEFAULT_HYBRID_PILOT_ENABLED
};

// Auto-run initNavigation + feature-gated Hybrid Navigation Pilot (dormant by default) + Quiet Mark + background offline preparation on DOMContentLoaded
if (typeof document !== 'undefined') {
  const bootstrap = () => {
    initNavigation();
    initHybridNavigationPilot();
    initQuietMark();
    initOfflinePreparation();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }
}
