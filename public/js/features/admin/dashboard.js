import { icons } from '../../shared/icons.js';
import { escapeHtml } from '../../shared/dom.js';
import { renderNotices } from './ui/notices.js';
import { renderSaveBarHtml } from './ui/form-state.js';
import { bindNavigationEvents } from './navigation.js';
import { renderProjectsTab } from './projects/projects-tab.js';
import { renderInboxTab } from './inbox/inbox-tab.js';
import { renderPackagesTab } from './packages/packages-tab.js';
import { renderStudioTab } from './studio/studio-tab.js';

export const TAB_HEADERS = {
  Projects: {
    title: 'Make your mark.',
    description: 'Your creative collection, all in one place.'
  },
  Inbox: {
    title: 'Your next projects.',
    description: 'Every saved brief starts a new conversation.'
  },
  Packages: {
    title: 'Set the next move.',
    description: 'Edit your offers, deliverables, and pricing.'
  },
  Studio: {
    title: 'Behind the creative.',
    description: 'Keep your studio’s voice and contact details up to date.'
  }
};

/**
 * Generates the full HTML markup for the dashboard authenticated shell.
 * @param {Object} state
 * @returns {string}
 */
export function generateDashboardShellHtml(state) {
  const hasNewLeads = Array.isArray(state.enquiries) && state.enquiries.some((l) => l.status === 'New');
  const publishedCount = Array.isArray(state.projects)
    ? state.projects.filter((p) => p.published).length.toString().padStart(2, '0')
    : '00';
  const newLeadsCount = Array.isArray(state.enquiries)
    ? state.enquiries.filter((l) => l.status === 'New').length.toString().padStart(2, '0')
    : '00';
  const projectOpensCount = state.activity?.project_open || 0;
  const briefsCount = state.activity?.enquiry_submitted || 0;

  const headerMeta = TAB_HEADERS[state.tab] || TAB_HEADERS.Projects;

  return `
    <div class="admin-shell">
      <aside class="admin-sidebar">
        <a class="brand" href="/" target="_blank">
          <img src="/assets/mondo-mark.webp" alt="MONDO Mark" class="brand-mark" width="25" height="37" />
          <span class="brand-divider" aria-hidden="true"></span>
          <img src="/assets/mondo-wordmark.svg" alt="MONDO" class="brand-wordmark" width="85" height="18" />
        </a>
        <p class="eyebrow">THE STUDIO WORKSPACE</p>

        <nav class="admin-nav" aria-label="Studio sections">
          <button data-tab="Projects" class="${state.tab === 'Projects' ? 'active' : ''}">
            ${icons.folderOpen(16)} Projects
          </button>
          <button data-tab="Inbox" class="${state.tab === 'Inbox' ? 'active' : ''}">
            ${icons.inbox(16)} Inbox
            ${hasNewLeads ? '<span class="lime-dot"></span>' : ''}
          </button>
          <button data-tab="Packages" class="${state.tab === 'Packages' ? 'active' : ''}">
            ${icons.layers(16)} Packages
          </button>
          <button data-tab="Studio" class="${state.tab === 'Studio' ? 'active' : ''}">
            ${icons.settings(16)} Studio
          </button>
        </nav>

        <div class="admin-sidebar-bottom">
          <a href="/" target="_blank">Open website ${icons.arrowUpRight(14)}</a>
          <button id="sign-out-btn" style="background: none; border: 0; color: inherit; padding: 0; display: flex; align-items: center; gap: 8px; font-size: inherit; text-align: left;">
            Sign out ${icons.arrowUpRight(13)}
          </button>
          <span>${escapeHtml(state.user?.username || 'Studio Administrator')}</span>
        </div>
      </aside>

      <main id="main" class="admin-content">
        <header class="admin-header">
          <div>
            <p class="eyebrow">MONDO / STUDIO ACCESS</p>
            <h1>${headerMeta.title}</h1>
            <p>${headerMeta.description}</p>
          </div>
          <a class="button button-outline button-small" href="/" target="_blank">
            View website ${icons.arrowUpRight(14)}
          </a>
        </header>

        <div class="admin-metrics">
          <div>
            <span>Published projects</span>
            <strong>${publishedCount}</strong>
          </div>
          <div>
            <span>New enquiries</span>
            <strong>${newLeadsCount}</strong>
          </div>
          <div>
            <span>Project opens · all time</span>
            <strong>${projectOpensCount}</strong>
          </div>
          <div>
            <span>Briefs received · all time</span>
            <strong>${briefsCount}</strong>
          </div>
        </div>

        <div id="admin-notices"></div>

        <div id="tab-content"></div>

        ${renderSaveBarHtml(state)}
      </main>
    </div>
  `;
}

/**
 * Dispatches tab rendering to the appropriate workspace controller.
 * @param {HTMLElement} tabContent
 * @param {Object} store
 * @param {Object} context
 */
export function renderCurrentTab(tabContent, store, context = {}) {
  if (!tabContent) return;

  const currentTab = store.getState().tab;
  if (currentTab === 'Projects') {
    renderProjectsTab(tabContent, store, context);
  } else if (currentTab === 'Inbox') {
    renderInboxTab(tabContent, store, context);
  } else if (currentTab === 'Packages') {
    renderPackagesTab(tabContent, store, context);
  } else if (currentTab === 'Studio') {
    renderStudioTab(tabContent, store, context);
  }
}

/**
 * Renders the full authenticated admin dashboard.
 * @param {HTMLElement|string} target
 * @param {Object} store
 * @param {Object} context
 */
export function renderDashboard(target, store, context = {}) {
  const container = typeof target === 'string' ? document.getElementById(target) : target;
  if (!container) return;

  const state = store.getState();
  container.innerHTML = generateDashboardShellHtml(state);

  const noticesEl = container.querySelector('#admin-notices');
  if (noticesEl) {
    renderNotices(noticesEl, state);
  }

  const tabContent = container.querySelector('#tab-content');
  renderCurrentTab(tabContent, store, context);

  bindNavigationEvents(container, store, {
    ...context,
    renderDashboard: () => renderDashboard(container, store, context)
  });
}
