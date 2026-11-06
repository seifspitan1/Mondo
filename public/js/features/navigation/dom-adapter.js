/**
 * MONDO — Navigation DOM Adapter (Stage G3.3-D)
 * Manages DOM swapping, route resource integrity, rendered route identity,
 * metadata synchronization, and in-situ error presentation for Option C Hybrid Navigation.
 *
 * MANDATORY GOVERNANCE & AMENDMENT COMPLIANCE:
 * - Amendment D-01 (Route Resource Integrity):
 *   Swaps landmark container <main id="main">, updates route attributes,
 *   and purges stale route classes from documentElement.
 * - Amendment D-03 (Rendered Route Identity):
 *   Maintains an independent internal identity of the currently rendered route.
 *   Initializes from DOM attributes or initial path; updates strictly upon successful DOM swap.
 *   Never silently substitutes window.location.pathname when divergent.
 * - Amendment D-04 (Commit and Recovery Integrity):
 *   Safely renders in-situ error states into designated non-destructive hosts
 *   with safe text escaping to guarantee visual and structural consistency.
 * - STRICT DORMANCY:
 *   Pure instance factory createDomAdapter(). Zero import-time side effects,
 *   zero automatic timers, zero unsolicited event listener registration.
 */

/**
 * Escapes HTML characters to prevent XSS during in-situ error card rendering.
 *
 * @param {string} [str='']
 * @returns {string} Sanitized string
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Creates an instance of the Navigation DOM Adapter.
 *
 * @param {object} [options={}] Configuration and dependency injections
 * @param {Document} [options.document] Document context
 * @param {Window} [options.window] Window context
 * @param {string} [options.initialPath] Explicit initial pathname override
 * @param {string} [options.initialType] Explicit initial route type override
 * @returns {object} DOM adapter instance satisfying coordinator domAdapter contract
 */
export function createDomAdapter(options = {}) {
  const doc = options.document || (typeof document !== 'undefined' ? document : null);
  const win = options.window || (typeof window !== 'undefined' ? window : null);

  // Initialize renderedRoute independently of window.location
  let initialPath = options.initialPath || '';
  let initialType = options.initialType || '';

  if (!initialPath && doc) {
    const mainEl = doc.querySelector ? (doc.querySelector('main#main') || doc.querySelector('#main')) : null;
    if (mainEl && typeof mainEl.getAttribute === 'function') {
      initialPath = mainEl.getAttribute('data-route-path') || '';
      initialType = mainEl.getAttribute('data-route-type') || '';
    }
  }

  if (!initialPath && win && win.location) {
    initialPath = win.location.pathname || '/';
  }

  if (!initialPath) {
    initialPath = '/';
  }

  if (!initialType) {
    if (initialPath === '/work') {
      initialType = 'work';
    } else if (initialPath.startsWith('/work/')) {
      initialType = 'project';
    } else {
      initialType = 'unknown';
    }
  }

  // Internal independent rendered route state (Amendment D-03)
  let renderedRoute = Object.freeze({
    pathname: initialPath,
    id: initialType,
    type: initialType
  });

  /**
   * Returns the pathname of the currently rendered route.
   * STRICT CONTRACT: Never returns window.location.pathname if different from rendered DOM.
   *
   * @returns {string} Rendered pathname
   */
  function getRenderedPath() {
    return renderedRoute ? renderedRoute.pathname : '/';
  }

  /**
   * Returns the descriptor of the currently rendered route.
   *
   * @returns {object} Rendered route descriptor
   */
  function getRenderedRoute() {
    return renderedRoute;
  }

  /**
   * Manually sets the rendered route descriptor (used during initial hydration or testing).
   *
   * @param {object} route - Route descriptor
   */
  function setRenderedRoute(route) {
    if (route && typeof route === 'object') {
      renderedRoute = Object.freeze({
        pathname: route.pathname || route.path || '/',
        id: route.id || route.type || 'unknown',
        type: route.type || route.id || 'unknown',
        slug: route.slug || undefined
      });
    }
  }

  /**
   * Swaps the landmark container's inner content with the incoming HTML,
   * stamps route attributes, purges stale classes from documentElement,
   * and updates the internal renderedRoute identity.
   *
   * @param {string} html - Extracted main landmark HTML
   * @param {object} targetRoute - Destination route descriptor
   * @returns {boolean} True if swap succeeded, false if landmark missing
   */
  function swapMainContent(html, targetRoute = {}) {
    if (!doc) return false;
    const mainEl = doc.querySelector ? (doc.querySelector('main#main') || doc.querySelector('#main')) : null;
    if (!mainEl) {
      return false;
    }

    // Perform DOM replacement
    mainEl.innerHTML = typeof html === 'string' ? html : '';

    const targetPath = targetRoute.pathname || targetRoute.url || '';
    const targetType = targetRoute.id || targetRoute.type || '';

    if (typeof mainEl.setAttribute === 'function') {
      if (targetPath) {
        mainEl.setAttribute('data-route-path', targetPath);
      }
      if (targetType) {
        mainEl.setAttribute('data-route-type', targetType);
      }
    }

    // Clean up stale classes on documentElement (Amendment D-01)
    const docEl = doc.documentElement;
    if (docEl && docEl.classList && typeof docEl.classList.remove === 'function') {
      docEl.classList.remove(
        'is-project-pilot-guard',
        'is-project-pilot-active',
        'is-project-pilot-status',
        'is-project-pilot-error',
        'is-project-css-pending',
        'is-project-css-ready'
      );
    }

    if (targetType === 'work' && win && win.__MONDO_PILOT_GUARD__ && typeof win.__MONDO_PILOT_GUARD__.dismiss === 'function') {
      try {
        win.__MONDO_PILOT_GUARD__.dismiss();
      } catch (_) {}
    }

    // Update internal renderedRoute strictly upon successful DOM swap (Amendment D-03)
    renderedRoute = Object.freeze({
      pathname: targetPath || renderedRoute.pathname,
      id: targetType || renderedRoute.id,
      type: targetType || renderedRoute.type,
      slug: targetRoute.slug || undefined
    });

    return true;
  }

  /**
   * Updates document title.
   *
   * @param {string} title - Document title string
   */
  function updateTitle(title) {
    if (doc && typeof title === 'string') {
      doc.title = title;
    }
  }

  /**
   * Updates document title and meta description.
   *
   * @param {object} [meta={}]
   * @param {string} [meta.title] Title string
   * @param {string} [meta.metaDescription] Meta description content
   */
  function updateMetadata({ title, metaDescription } = {}) {
    if (doc) {
      if (typeof title === 'string') {
        doc.title = title;
      }
      if (typeof metaDescription === 'string' && doc.querySelector) {
        let metaEl = doc.querySelector('meta[name="description"]');
        if (metaEl && typeof metaEl.setAttribute === 'function') {
          metaEl.setAttribute('content', metaDescription);
        } else if (doc.head && typeof doc.createElement === 'function') {
          metaEl = doc.createElement('meta');
          metaEl.setAttribute('name', 'description');
          metaEl.setAttribute('content', metaDescription);
          if (typeof doc.head.appendChild === 'function') {
            doc.head.appendChild(metaEl);
          }
        }
      }
    }
  }

  /**
   * Verifies the presence of the expected landmark container for the destination route.
   *
   * @param {string} routeType - Route type identifier ('work' | 'project')
   * @returns {boolean} True if landmark exists
   */
  function hasExpectedLandmark(routeType) {
    if (!doc || typeof doc.querySelector !== 'function') return true;
    if (routeType === 'work') {
      return Boolean(doc.querySelector('#work-grid') || doc.querySelector('.work-page-grid'));
    }
    if (routeType === 'project') {
      return Boolean(doc.querySelector('#project-main'));
    }
    return true;
  }

  /**
   * Safely renders an in-situ error card into the destination route's container
   * without destroying surrounding landmark structure.
   *
   * @param {string} routeType - Route identifier ('project' | 'work')
   * @param {object} [errorInfo={}] - Error descriptor
   * @returns {boolean} True if rendered successfully
   */
  function renderInSituError(routeType, errorInfo = {}) {
    if (!doc || typeof doc.querySelector !== 'function') return false;

    const message = escapeHtml(errorInfo?.message || 'An unexpected error occurred while loading content.');

    if (routeType === 'project') {
      const projectMain = doc.querySelector('#project-main');
      let host = doc.querySelector('#project-error-host');
      if (!host && projectMain && typeof doc.createElement === 'function') {
        host = doc.createElement('div');
        host.id = 'project-error-host';
        host.className = 'project-error-host';
        if (typeof projectMain.insertBefore === 'function') {
          projectMain.insertBefore(host, projectMain.firstChild || null);
        } else if (typeof projectMain.appendChild === 'function') {
          projectMain.appendChild(host);
        }
      }
      if (!host) {
        host = projectMain || doc.querySelector('main#main');
      }
      if (!host) return false;

      if (projectMain && projectMain.classList && typeof projectMain.classList.add === 'function') {
        projectMain.classList.add('has-project-error');
      }

      host.hidden = false;
      host.innerHTML = `
<div class="project-error-boundary" role="alert">
  <h2 class="project-error-title">Unable to Load Project</h2>
  <p class="project-error-message">${message}</p>
  <div class="project-error-actions">
    <a href="/work" class="back-link">Return to Work Portfolio</a>
  </div>
</div>`.trim();
      return true;
    }

    if (routeType === 'work') {
      const host = doc.querySelector('#work-grid') || doc.querySelector('main#main');
      if (!host) return false;

      host.innerHTML = `
<div class="work-error-boundary" role="alert">
  <h2 class="work-error-title">Unable to Load Portfolio</h2>
  <p class="work-error-message">${message}</p>
  <div class="work-error-actions">
    <a href="/" class="back-link">Return to Home</a>
  </div>
</div>`.trim();
      return true;
    }

    return false;
  }

  return {
    getRenderedPath,
    getRenderedRoute,
    setRenderedRoute,
    swapMainContent,
    updateTitle,
    updateMetadata,
    hasExpectedLandmark,
    renderInSituError
  };
}
