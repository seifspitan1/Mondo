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

/**
 * Orchestrator initializing homepage features:
 * - Segmented package cadence toggle (One-off / Monthly)
 * - Selected work filtering (All, Thumbnails, Trailers)
 * - Public content hydration via /api/v1/load
 * - Hero tagline and footer socials update
 *
 * Idempotent and safe against duplicate initialization.
 * @param {object} [options]
 * @param {Document|HTMLElement} [options.root=document]
 * @param {Function} [options.fetchContent=loadPublicContent]
 * @returns {Promise<void>}
 */
export async function initHome({ root = document, fetchContent = loadPublicContent } = {}) {
  const scopeEl = root.body || (root.getElementById ? root.getElementById('packages-grid') : null);
  if (scopeEl && scopeEl.dataset && scopeEl.dataset.homeInitialized === 'true') {
    return;
  }
  if (scopeEl && scopeEl.dataset) {
    scopeEl.dataset.homeInitialized = 'true';
  }

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
    const data = await fetchContent();
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
    console.warn('Using server-rendered home defaults:', err.message);
  }
}
