/**
 * MONDO — Hybrid Navigation Pilot Gate & Host Evaluator (Phase 5D-C.2A)
 * Pure, lightweight feature-flag and environment evaluation module with zero
 * dependencies on coordinator, lifecycle adapters, page controllers, or readiness engines.
 *
 * Used by site.js to enforce DEFAULT_HYBRID_PILOT_ENABLED = false and prevent
 * dormant Hybrid Navigation bundles from downloading, parsing, or executing on ordinary
 * production navigation.
 */

/**
 * Default runtime feature gate (Option A: strictly disabled by default).
 */
export const DEFAULT_HYBRID_PILOT_ENABLED = false;

/**
 * Hard Gate 1 activation lock (transitioned to false for Stage G3.3-E-G2 Controlled Local Opt-In).
 * Note: No test-only bypass parameter (unlockGate1Lock) is permitted in isHybridPilotEnabled().
 */
export const GATE_1_ACTIVATION_LOCK = false;

/**
 * Explicit allowlist of local hostnames where the Gate 2 opt-in pilot may activate.
 * Production domains are strictly prohibited from activating Hybrid Navigation.
 */
export const ALLOWED_LOCAL_PILOT_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

/**
 * Verifies that the active window environment is a local host.
 * Prevents accidental activation on any non-local or production origin.
 *
 * @param {Window|object|null} win
 * @returns {boolean}
 */
export function isAllowedLocalPilotHost(win) {
  if (!win || !win.location) return false;
  let hostname = typeof win.location.hostname === 'string' ? win.location.hostname.trim().toLowerCase() : '';
  if (!hostname) {
    const candidateUrl = win.location.origin || win.location.href || '';
    if (candidateUrl) {
      try {
        hostname = new URL(candidateUrl).hostname.toLowerCase();
      } catch (_) {
        return false;
      }
    }
  }
  return ALLOWED_LOCAL_PILOT_HOSTS.has(hostname);
}

/**
 * Evaluates whether the Hybrid Navigation Pilot is authorized to initialize.
 *
 * Enforces:
 * 1. Runtime kill-switch (__MONDO_HYBRID_NAV_DISABLED__)
 * 2. URL opt-out (?hybrid=0 / ?hybrid=false) & session opt-out (mondo_hybrid_nav_disabled=1)
 * 3. Gate 1 activation lock (GATE_1_ACTIVATION_LOCK)
 * 4. Local origin restriction (isAllowedLocalPilotHost) — Production activation is strictly prohibited
 * 5. Gate 2 controlled local opt-in (?hybrid=1 / sessionStorage.mondo_hybrid_nav_pilot=1 / forceEnable)
 * 6. Fallback to DEFAULT_HYBRID_PILOT_ENABLED (false)
 *
 * @param {object} [options={}]
 * @param {Window} [options.window]
 * @param {boolean} [options.forceEnable=false]
 * @param {boolean} [options.forceDisable=false]
 * @returns {boolean}
 */
export function isHybridPilotEnabled(options = {}) {
  if (options.forceDisable === true) return false;

  const win = options.window || (typeof window !== 'undefined' ? window : null);

  // 1. Immediate runtime kill-switch always wins
  if (win && win.__MONDO_HYBRID_NAV_DISABLED__ === true) {
    return false;
  }

  try {
    if (win && win.location && typeof win.location.search === 'string') {
      const params = new URLSearchParams(win.location.search);
      const flag = params.get('hybrid');
      if (flag === '0' || flag === 'false') return false;
    }
  } catch (_) {}

  try {
    if (win && win.sessionStorage && win.sessionStorage.getItem('mondo_hybrid_nav_disabled') === '1') {
      return false;
    }
  } catch (_) {}

  // 2. Hard Gate 1 Lock (no test-only bypass parameter allowed)
  if (GATE_1_ACTIVATION_LOCK) {
    return false;
  }

  // 3. Strict local environment guard (Production Activation is STRICTLY PROHIBITED)
  if (!isAllowedLocalPilotHost(win)) {
    return false;
  }

  // 4. Controlled Gate 2 explicit opt-in evaluation
  if (options.forceEnable === true) return true;
  if (win && win.__MONDO_ENABLE_HYBRID_NAV__ === true) return true;

  try {
    if (win && win.location && typeof win.location.search === 'string') {
      const params = new URLSearchParams(win.location.search);
      const flag = params.get('hybrid');
      if (flag === '1' || flag === 'true') return true;
    }
  } catch (_) {}

  try {
    if (win && win.sessionStorage && win.sessionStorage.getItem('mondo_hybrid_nav_pilot') === '1') {
      return true;
    }
  } catch (_) {}

  return DEFAULT_HYBRID_PILOT_ENABLED;
}

