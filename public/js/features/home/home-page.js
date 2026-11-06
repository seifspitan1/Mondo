import { icons } from '../../shared/icons.js';
import { escapeHtml } from '../../shared/dom.js';
import { loadPublicContent } from '../../shared/api.js';
import { renderPackages, setupPackageToggle } from '../packages/package-toggle.js';
import { setupWorkFilter } from '../work/filter.js';

/**
 * Updates dynamic footer social links and privacy link.
 * @param {object} settings - Studio settings object
 * @param {Document|HTMLElement} [root=document]
 */
export function updateFooterSocials(settings, root = document) {
  const footerLinks = root.querySelector('.footer-social-links');
  if (!footerLinks || !settings) return;

  let html = '';
  if (settings.discordUrl) {
    html += `<a href="${escapeHtml(settings.discordUrl)}" target="_blank" rel="noreferrer">Discord ${icons.arrowUpRight(14)}</a>`;
  }
  if (settings.xUrl) {
    html += `<a href="${escapeHtml(settings.xUrl)}" target="_blank" rel="noreferrer">X / Twitter ${icons.arrowUpRight(14)}</a>`;
  }
  if (settings.email) {
    html += `<a href="mailto:${escapeHtml(settings.email)}">Email ${icons.mail(14)}</a>`;
  }
  html += `<a href="/privacy">Privacy</a>`;
  footerLinks.innerHTML = html;
}

/**
 * Updates the hero section description text if provided.
 * @param {string} tagline
 * @param {Document|HTMLElement} [root=document]
 */
export function updateHeroTagline(tagline, root = document) {
  if (!tagline) return;
  const taglineEl = root.querySelector('.hero-description');
  if (taglineEl) {
    taglineEl.textContent = tagline;
  }
}

// Track active async operations for stale request cancellation
let activeHomeOp = 0;

/**
 * Phase 5C Stage G1: Route Lifecycle Contract — Mount Landing Page.
 * Mounts interactive features (package toggle, work filter, API hydration).
 * Safe, idempotent, and cancellation-aware.
 *
 * @param {object} [context]
 * @param {Document|HTMLElement} [context.root=document]
 * @param {Function} [context.fetchContent=loadPublicContent]
 * @param {number|string} [context.operationId]
 * @param {AbortSignal} [context.signal]
 * @param {Function} [context.registerCleanup]
 * @returns {Promise<void>}
 */
export async function mountHome({
  root = document,
  fetchContent = loadPublicContent,
  operationId = null,
  signal = null,
  registerCleanup = null
} = {}) {
  const scopeEl = root.body || (root.getElementById ? root.getElementById('packages-grid') : null);
  if (scopeEl && scopeEl.dataset && scopeEl.dataset.homeMounted === 'true') {
    return;
  }
  if (scopeEl && scopeEl.dataset) {
    scopeEl.dataset.homeMounted = 'true';
    scopeEl.dataset.homeInitialized = 'true';
  }

  const currentOp = operationId || ++activeHomeOp;

  let currentPackages = [];
  let isMonthly = false;

  const packagesContainer = root.getElementById ? root.getElementById('packages-grid') : root.querySelector('#packages-grid');

  setupPackageToggle({
    root,
    onToggle: (monthly) => {
      isMonthly = monthly;
      renderPackages(packagesContainer, currentPackages, isMonthly);
    }
  });

  try {
    if (signal && signal.aborted) return;
    const data = await fetchContent();
    if (currentOp !== activeHomeOp || (signal && signal.aborted)) {
      return; // Invalidate stale response
    }
    if (data.projects && Array.isArray(data.projects)) {
      setupWorkFilter(data.projects, { root });
    }
    if (data.settings?.packages) {
      currentPackages = data.settings.packages;
      renderPackages(packagesContainer, currentPackages, isMonthly);
    }
    if (data.settings?.tagline) {
      updateHeroTagline(data.settings.tagline, root);
    }
    if (data.settings) {
      updateFooterSocials(data.settings, root);
    }
  } catch (err) {
    if (currentOp === activeHomeOp) {
      console.warn('Using server-rendered home defaults:', err.message);
    }
  }
}

/**
 * Phase 5C Stage G1: Route Lifecycle Contract — Unmount Landing Page.
 * Releases event listeners, invalidates in-flight async operations, and clears idempotency flags.
 *
 * @param {object} [context]
 * @param {Document|HTMLElement} [context.root=document]
 */
export function unmountHome({ root = document } = {}) {
  // Invalidate in-flight async operations
  activeHomeOp++;

  const scopeEl = root.body || (root.getElementById ? root.getElementById('packages-grid') : null);
  if (scopeEl && scopeEl.dataset) {
    delete scopeEl.dataset.homeMounted;
    delete scopeEl.dataset.homeInitialized;
  }

  // Release package toggle listeners
  const toggleButtons = root.querySelectorAll('.segmented button');
  toggleButtons.forEach((btn) => {
    delete btn.dataset.toggleBound;
    if (btn.parentNode) {
      btn.replaceWith(btn.cloneNode(true));
    }
  });

  // Release work filter listeners
  const filterBtns = root.querySelectorAll('.selected-work .filter-list button');
  filterBtns.forEach((btn) => {
    delete btn.dataset.filterBound;
    if (btn.parentNode) {
      btn.replaceWith(btn.cloneNode(true));
    }
  });
}

// Canonical lifecycle aliases for Global Coordinator
export { mountHome as mount, unmountHome as unmount };

/**
 * Orchestrator initializing homepage features:
 * Preserved for backward compatibility with direct document loads.
 *
 * @param {object} [options]
 * @param {Document|HTMLElement} [options.root=document]
 * @param {Function} [options.fetchContent=loadPublicContent]
 * @returns {Promise<void>}
 */
export async function initHome({ root = document, fetchContent = loadPublicContent } = {}) {
  return mountHome({ root, fetchContent });
}
