import { icons } from '../../shared/icons.js';
import { escapeHtml } from '../../shared/dom.js';
import { adminLogin as defaultAdminLogin, adminLogout as defaultAdminLogout } from '../../shared/api.js';

/**
 * Generates HTML for the Admin Login screen.
 * @param {string} errorMsg
 * @returns {string}
 */
export function generateLoginHtml(errorMsg = '') {
  return `
    <div style="min-height: 85vh; display: grid; place-items: center; padding: 20px;">
      <div style="width: 100%; max-width: 420px; background: #121417; border: 1px solid #2d3239; border-radius: 10px; padding: 36px 32px;">
        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 26px;">
          <a class="brand" href="/">
            <img src="/assets/mondo-mark.webp" alt="MONDO Mark" class="brand-mark" width="28" height="42" />
            <span class="brand-divider" aria-hidden="true"></span>
            <img src="/assets/mondo-wordmark.svg" alt="MONDO" class="brand-wordmark" width="95" height="20" />
          </a>
        </div>
        <p class="eyebrow" style="margin-bottom: 12px;">STUDIO ACCESS</p>
        <h2 style="font-size: 26px; margin-bottom: 8px; letter-spacing: -0.04em;">Sign in to workspace</h2>
        <p class="muted" style="font-size: 11px; margin-bottom: 24px;">Enter your configured studio credentials to continue.</p>

        ${errorMsg ? `<div class="admin-notice admin-error" style="margin-bottom: 18px;" role="alert">${escapeHtml(errorMsg)}</div>` : ''}

        <form id="login-form" style="display: flex; flex-direction: column; gap: 16px;">
          <label style="font-size: 11px; color: #d0d4da;">
            Username
            <input name="username" type="text" required autocomplete="username" autofocus placeholder="admin" style="margin-top: 6px;" />
          </label>
          <label style="font-size: 11px; color: #d0d4da;">
            Password
            <input name="password" type="password" required autocomplete="current-password" placeholder="••••••••••••" style="margin-top: 6px;" />
          </label>

          <button class="button" id="login-btn" type="submit" style="margin-top: 10px; justify-content: center;">
            Sign in ${icons.arrowUpRight(16)}
          </button>
        </form>
      </div>
    </div>
  `;
}

/**
 * Renders the Login view and binds submission events.
 * @param {HTMLElement|string} target
 * @param {string} errorMsg
 * @param {Object} context
 */
export function renderLogin(target, errorMsg = '', context = {}) {
  const container = typeof target === 'string' ? document.getElementById(target) : target;
  if (!container) return;

  container.innerHTML = generateLoginHtml(errorMsg);

  const form = container.querySelector('#login-form');
  const btn = container.querySelector('#login-btn');
  const loginFn = context.adminLogin || defaultAdminLogin;

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const u = fd.get('username');
      const p = fd.get('password');

      if (btn) {
        btn.disabled = true;
        btn.innerHTML = `${icons.spinner(16)} Signing in…`;
      }

      try {
        await loginFn(u, p);
        if (typeof context.onLoginSuccess === 'function') {
          await context.onLoginSuccess();
        }
      } catch (err) {
        renderLogin(container, err.message || 'Login failed.', context);
      }
    });
  }
}

/**
 * Handles administrator sign out action.
 * @param {Object} context
 */
export async function handleLogout(context = {}) {
  const logoutFn = context.adminLogout || defaultAdminLogout;
  try {
    await logoutFn();
  } catch (err) {
    console.warn('Logout notification failed:', err);
  }
  if (context.store) {
    context.store.reset();
  }
  if (typeof context.onLogoutSuccess === 'function') {
    context.onLogoutSuccess();
  }
}
