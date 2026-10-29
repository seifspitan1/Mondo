import { icons } from '../../../shared/icons.js';
import { escapeHtml } from '../../../shared/dom.js';
import { confirmDeleteEnquiry } from '../ui/dialogs.js';
import {
  updateEnquiryStatus as defaultUpdateEnquiryStatus,
  deleteEnquiry as defaultDeleteEnquiry
} from '../../../shared/api.js';

export const INBOX_STATUSES = ['New', 'Contacted', 'Quoted', 'Won', 'Closed'];

/**
 * Filters enquiries list by status filter and search query string.
 * @param {Array} enquiries
 * @param {string} statusFilter
 * @param {string} search
 * @returns {Array}
 */
export function filterEnquiries(enquiries = [], statusFilter = 'All', search = '') {
  const q = String(search || '').toLowerCase();
  return enquiries.filter((l) => {
    const matchStatus = statusFilter === 'All' || l.status === statusFilter;
    const matchSearch = [l.name, l.email, l.service, l.goal].join(' ').toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });
}

/**
 * Generates HTML for the Inbox tab workspace.
 * @param {Object} state
 * @returns {string}
 */
export function generateInboxTabHtml(state) {
  const filtered = filterEnquiries(state.enquiries, state.statusFilter, state.search);

  return `
    <div class="inbox-toolbar">
      <input type="search" id="lead-search" value="${escapeHtml(state.search)}" placeholder="Search names, email, or briefs" aria-label="Search enquiries" />
      <select id="lead-status-filter" aria-label="Filter enquiry status">
        <option ${state.statusFilter === 'All' ? 'selected' : ''}>All</option>
        ${INBOX_STATUSES.map((s) => `<option ${state.statusFilter === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
    </div>

    ${
      !filtered.length
        ? `
      <div class="admin-empty">
        ${icons.inbox(31)}
        <h3>${state.enquiries?.length ? 'No matching enquiries.' : 'Room for your next big project.'}</h3>
        <p>${state.enquiries?.length ? 'Try a different search or status.' : 'New project briefs will appear here after they’re received.'}</p>
      </div>
    `
        : `
      <div class="enquiry-list">
        ${filtered
          .map((l) => {
            const isOpen = state.openLeadId === l.id;
            const dateStr = new Date(l.createdAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric'
            });

            return `
            <article class="enquiry-item">
              <button class="enquiry-summary" data-lead-id="${escapeHtml(l.id)}" aria-expanded="${isOpen}">
                <span>
                  <strong>${escapeHtml(l.name)}</strong>
                  <small>${dateStr} · ${escapeHtml(l.email)}</small>
                </span>
                <span>${escapeHtml(l.packageName || l.service)}</span>
                <span class="tag ${l.status === 'New' ? 'tag-green' : ''}">${escapeHtml(l.status)}</span>
                ${icons.chevronDown(15)}
              </button>

              ${
                isOpen
                  ? `
                <div class="enquiry-detail">
                  <dl>
                    <div><dt>Service</dt><dd>${escapeHtml(l.service)}</dd></div>
                    <div><dt>Package</dt><dd>${escapeHtml(l.packageName || 'Custom scope')}</dd></div>
                    <div><dt>Email</dt><dd>${escapeHtml(l.email)}</dd></div>
                    <div><dt>Discord</dt><dd>${escapeHtml(l.discord || '—')}</dd></div>
                    <div><dt>Game link</dt><dd>${
                      l.gameUrl
                        ? `<a href="${escapeHtml(l.gameUrl)}" target="_blank" rel="noreferrer">${escapeHtml(l.gameUrl)}</a>`
                        : 'Not provided'
                    }</dd></div>
                    <div><dt>Budget</dt><dd>${escapeHtml(l.budget || 'To discuss')}</dd></div>
                    <div><dt>Ideal deadline</dt><dd>${escapeHtml(l.deadline || 'To discuss')}</dd></div>
                    <div><dt>Reference</dt><dd>${escapeHtml(l.id.slice(0, 8).toUpperCase())}</dd></div>
                  </dl>

                  <p class="brief-text">${escapeHtml(l.goal)}</p>

                  <div class="enquiry-actions">
                    <select class="lead-status-select" data-id="${escapeHtml(l.id)}" aria-label="Enquiry status">
                      ${INBOX_STATUSES.map((s) => `<option ${l.status === s ? 'selected' : ''}>${s}</option>`).join('')}
                    </select>
                    <a class="button button-outline" href="mailto:${escapeHtml(l.email)}?subject=${encodeURIComponent('Your MONDO project · ' + l.id.slice(0, 8).toUpperCase())}">
                      ${icons.mail(13)} Reply by email
                    </a>
                    <button class="danger-button delete-lead-btn" data-id="${escapeHtml(l.id)}">
                      Delete enquiry
                    </button>
                  </div>
                </div>
              `
                  : ''
              }
            </article>
          `;
          })
          .join('')}
      </div>
    `
    }
  `;
}

/**
 * Renders the Inbox tab workspace and attaches interaction listeners.
 *
 * @param {HTMLElement|string} target
 * @param {Object} store
 * @param {Object} context
 */
export function renderInboxTab(target, store, context = {}) {
  const container = typeof target === 'string' ? document.getElementById(target) : target;
  if (!container) return;

  const updateStatusFn = context.updateEnquiryStatus || defaultUpdateEnquiryStatus;
  const deleteFn = context.deleteEnquiry || defaultDeleteEnquiry;

  const state = store.getState();
  container.innerHTML = generateInboxTabHtml(state);

  // Search input: preserve focus and cursor position across re-renders
  const searchInput = container.querySelector('#lead-search');
  searchInput?.addEventListener('input', (ev) => {
    const val = ev.target.value;
    const cursor = ev.target.selectionStart;
    store.setSearch(val);
    renderInboxTab(container, store, context);
    const refreshedInput = container.querySelector('#lead-search');
    if (refreshedInput) {
      refreshedInput.focus();
      refreshedInput.setSelectionRange(cursor, cursor);
    }
  });

  // Status filter dropdown
  container.querySelector('#lead-status-filter')?.addEventListener('change', (ev) => {
    store.setStatusFilter(ev.target.value);
    renderInboxTab(container, store, context);
  });

  // Lead accordion toggles
  container.querySelectorAll('.enquiry-summary').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-lead-id');
      const currentOpenId = store.getState().openLeadId;
      store.setOpenLeadId(currentOpenId === id ? '' : id);
      renderInboxTab(container, store, context);
    });
  });

  // Lead status update dropdowns
  container.querySelectorAll('.lead-status-select').forEach((sel) => {
    sel.addEventListener('change', async (ev) => {
      const id = sel.getAttribute('data-id');
      const next = ev.target.value;
      try {
        await updateStatusFn(id, next);
        const currentEnquiries = store.getState().enquiries;
        const item = currentEnquiries.find((x) => x.id === id);
        if (item) {
          item.status = next;
          store.setEnquiries([...currentEnquiries]);
        }
        store.notice('Enquiry status updated.');
      } catch (err) {
        store.notice(err.message || 'Could not update enquiry status.', true);
      }
      renderInboxTab(container, store, context);
    });
  });

  // Delete enquiry buttons
  container.querySelectorAll('.delete-lead-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      if (!confirmDeleteEnquiry()) return;

      try {
        await deleteFn(id);
        const currentEnquiries = store.getState().enquiries;
        store.setEnquiries(currentEnquiries.filter((x) => x.id !== id));
        if (store.getState().openLeadId === id) {
          store.setOpenLeadId('');
        }
        store.notice('Enquiry deleted.');
      } catch (err) {
        store.notice(err.message || 'Could not delete enquiry.', true);
      }
      renderInboxTab(container, store, context);
    });
  });
}
