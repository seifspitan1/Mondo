/**
 * MONDO — Safe Destination HTML Loader (Stage G3.2-R3)
 * Isolated, explicitly invoked utility for fetching and validating
 * candidate destination HTML for Option C Hybrid Navigation.
 *
 * MANDATORY SECURITY & DORMANCY SAFEGUARDS:
 * - NO insertion into live DOM; operates strictly in memory.
 * - NO script execution (W3C DOMParser inert parsing).
 * - Strict Same-Origin enforcement.
 * - Strict Pilot Route Allowlisting (/work <-> /work/:slug).
 * - Rejects HTTP errors (404, 500), non-HTML content, and cross-origin redirects.
 * - Bounded streaming response reading (prevents memory exhaustion).
 * - Fails closed on non-streaming responses (zero response.text() / arrayBuffer() buffering).
 * - Strict redirect identity preservation (rejects route family / project identity drift).
 * - Zero import-time network requests or DOM modifications.
 */

import { normalizePath, parsePilotRoute, isEligiblePilotPair } from './route-eligibility.js';

// Maximum allowed HTML response size: 500 KB (MONDO HTML templates are ~15-45 KB)
export const MAX_RESPONSE_BYTES = 500 * 1024;

/**
 * Validates a target URL against same-origin and pilot route allowlists.
 *
 * @param {string|URL} targetUrl - Target URL to validate
 * @param {object} options
 * @param {string} options.trustedOrigin - Expected same-origin (e.g. "http://localhost:3005")
 * @param {string} [options.sourcePath] - Optional current path to enforce pair eligibility
 * @returns {{ ok: boolean, url?: URL, pathname?: string, route?: object, error?: string }}
 */
export function validateTargetUrl(targetUrl, { trustedOrigin, sourcePath } = {}) {
  if (!targetUrl) {
    return { ok: false, error: 'Target URL is missing or empty' };
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(targetUrl, trustedOrigin);
  } catch (err) {
    return { ok: false, error: `Invalid URL format: ${err.message}` };
  }

  // 1. Strict Protocol check
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return { ok: false, error: `Unsupported protocol: ${parsedUrl.protocol}` };
  }

  // 2. Strict Same-Origin check
  if (trustedOrigin) {
    try {
      const originUrl = new URL(trustedOrigin);
      if (parsedUrl.origin !== originUrl.origin) {
        return { ok: false, error: `Cross-origin target rejected: ${parsedUrl.origin} !== ${originUrl.origin}` };
      }
    } catch (_) {
      return { ok: false, error: 'Invalid trustedOrigin provided' };
    }
  }

  const normalized = normalizePath(parsedUrl.pathname);

  // 3. Reject Admin, API, and static media paths
  if (normalized.startsWith('/admin') || normalized.startsWith('/api') || normalized.startsWith('/media')) {
    return { ok: false, error: `Restricted route path rejected: ${normalized}` };
  }

  // 4. Pilot Route Allowlist check
  const routeDesc = parsePilotRoute(normalized);
  if (!routeDesc) {
    return { ok: false, error: `Non-pilot route rejected: ${normalized}` };
  }

  // 5. Enforce route pair eligibility if sourcePath provided
  if (sourcePath) {
    const isPairAllowed = isEligiblePilotPair(sourcePath, normalized);
    if (!isPairAllowed) {
      return { ok: false, error: `Ineligible route pair transition: ${sourcePath} -> ${normalized}` };
    }
  }

  return {
    ok: true,
    url: parsedUrl,
    pathname: normalized,
    route: routeDesc
  };
}

/**
 * Validates the structural integrity of a parsed HTML document for pilot routes.
 *
 * @param {Document|object} doc - Parsed HTML Document or mock DOM object
 * @param {string} expectedRouteType - 'work' or 'project'
 * @returns {{ ok: boolean, error?: string, mainHtml?: string, title?: string, metaDescription?: string }}
 */
export function validateRouteDocument(doc, expectedRouteType) {
  if (!doc || typeof doc.querySelector !== 'function') {
    return { ok: false, error: 'Invalid or empty parsed document' };
  }

  // 1. Find the primary landmark <main id="main">
  const mains = doc.querySelectorAll ? doc.querySelectorAll('main') : [];
  if (mains.length === 0) {
    return { ok: false, error: 'Missing <main> element in destination HTML' };
  }
  if (mains.length > 1) {
    return { ok: false, error: `Duplicate <main> elements detected (${mains.length})` };
  }

  const mainEl = doc.querySelector('main#main') || (doc.getElementById ? doc.getElementById('main') : null);
  if (!mainEl) {
    return { ok: false, error: 'Main element missing required id="main"' };
  }

  // 2. Validate expected interior route structure
  if (expectedRouteType === 'work') {
    const workGrid = mainEl.querySelector
      ? (mainEl.querySelector('#work-grid') || mainEl.querySelector('.work-page-grid') || mainEl.querySelector('.work-grid'))
      : null;
    if (!workGrid) {
      return { ok: false, error: 'Destination Work HTML missing expected #work-grid landmark' };
    }
  } else if (expectedRouteType === 'project') {
    const projectMain = mainEl.querySelector ? mainEl.querySelector('#project-main') : null;
    if (!projectMain) {
      return { ok: false, error: 'Destination Project HTML missing expected #project-main container' };
    }
  }

  // 3. Extract title and metadata safely
  const titleEl = doc.querySelector ? doc.querySelector('title') : null;
  const title = titleEl ? titleEl.textContent.trim() : '';

  const metaDescEl = doc.querySelector ? doc.querySelector('meta[name="description"]') : null;
  const metaDescription = metaDescEl && typeof metaDescEl.getAttribute === 'function'
    ? (metaDescEl.getAttribute('content') || '').trim()
    : '';

  return {
    ok: true,
    mainHtml: mainEl.innerHTML,
    title,
    metaDescription
  };
}

/**
 * Safely reads a response body up to maxBytes using streams where available,
 * counting actual bytes and rejecting payloads that exceed the ceiling.
 *
 * @param {Response|object} response - Fetch Response or mock response object
 * @param {number} maxBytes - Maximum allowed payload in bytes
 * @param {AbortSignal|null} signal - Cancellation signal
 * @returns {Promise<{ ok: boolean, text?: string, bytes?: number, error?: string }>}
 */
async function readBoundedResponseBody(response, maxBytes, signal) {
  // Check Content-Length header if declared
  const declaredHeader = (response.headers && typeof response.headers.get === 'function')
    ? response.headers.get('content-length')
    : null;
  if (declaredHeader) {
    const declaredBytes = parseInt(declaredHeader, 10);
    if (!isNaN(declaredBytes) && declaredBytes > maxBytes) {
      return { ok: false, error: `Response exceeds size ceiling: ${declaredBytes} > ${maxBytes} bytes` };
    }
  }

  // Strategy 1: Standard ReadableStream reader
  if (response.body && typeof response.body.getReader === 'function') {
    const reader = response.body.getReader();
    const chunks = [];
    let receivedBytes = 0;
    const decoder = new TextDecoder('utf-8');

    try {
      while (true) {
        if (signal && signal.aborted) {
          try { await reader.cancel(); } catch (_) {}
          return { ok: false, error: 'Fetch aborted during streaming' };
        }

        const { done, value } = await reader.read();
        if (done) break;

        if (value) {
          const chunkLen = value.byteLength !== undefined ? value.byteLength : value.length || 0;
          receivedBytes += chunkLen;
          if (receivedBytes > maxBytes) {
            try { await reader.cancel(); } catch (_) {}
            return { ok: false, error: `Response exceeds maximum allowed size: ${receivedBytes} > ${maxBytes} bytes` };
          }
          chunks.push(value);
        }
      }
    } catch (err) {
      try { await reader.cancel(); } catch (_) {}
      return { ok: false, error: `Stream read error: ${err.message}` };
    }

    let htmlText = '';
    for (const chunk of chunks) {
      htmlText += decoder.decode(chunk, { stream: true });
    }
    htmlText += decoder.decode(); // flush final bytes
    return { ok: true, text: htmlText, bytes: receivedBytes };
  }

  // Non-streaming response: fail closed.
  // A declared Content-Length cannot be trusted to bound actual network accumulation
  // without an incremental stream reader. Calling response.text() or response.arrayBuffer()
  // on unstreamed responses is prohibited to prevent memory exhaustion.
  return {
    ok: false,
    error: 'Streaming unavailable: cannot safely bound response without a ReadableStream reader'
  };
}

/**
 * Default HTML parser fallback for browser or mock DOM environments.
 *
 * @param {string} html - Raw HTML string
 * @returns {Document} Inert Document object
 */
function defaultParseHtml(html) {
  if (typeof DOMParser !== 'undefined') {
    return new DOMParser().parseFromString(html, 'text/html');
  }
  throw new Error('No DOMParser available. Please inject parseHtmlImpl in non-browser environments.');
}

/**
 * Fetches, verifies, and validates candidate destination HTML without live mounting.
 *
 * @param {string|URL} targetUrl - Target pilot URL
 * @param {object} [options={}]
 * @param {Function} [options.fetchImpl] - Injected fetch implementation
 * @param {Function} [options.parseHtmlImpl] - Injected HTML parser
 * @param {AbortSignal} [options.signal] - Caller-owned cancellation signal
 * @param {string} [options.trustedOrigin] - Base origin for security validation
 * @param {string} [options.sourcePath] - Current path for route-pair validation
 * @param {number} [options.maxResponseBytes=MAX_RESPONSE_BYTES] - Size safety ceiling
 * @returns {Promise<{ ok: boolean, data?: object, error?: string, status?: number }>}
 */
export async function fetchRouteHtml(targetUrl, {
  fetchImpl = (typeof fetch !== 'undefined' ? fetch : null),
  parseHtmlImpl = defaultParseHtml,
  signal = null,
  trustedOrigin = (typeof location !== 'undefined' ? location.origin : 'http://localhost:3005'),
  sourcePath = null,
  maxResponseBytes = MAX_RESPONSE_BYTES
} = {}) {
  // 1. Validate Target URL & Eligibility
  const urlValidation = validateTargetUrl(targetUrl, { trustedOrigin, sourcePath });
  if (!urlValidation.ok) {
    return { ok: false, error: urlValidation.error };
  }

  if (typeof fetchImpl !== 'function') {
    return { ok: false, error: 'No fetch implementation available' };
  }

  if (signal && signal.aborted) {
    return { ok: false, error: 'Fetch aborted before dispatch' };
  }

  let response;
  try {
    response = await fetchImpl(urlValidation.url.href, {
      method: 'GET',
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'X-Requested-With': 'MondoHybridLoader'
      },
      signal
    });
  } catch (err) {
    return { ok: false, error: `Network fetch failed: ${err.message}` };
  }

  // 2. Validate HTTP Status
  if (!response || !response.ok) {
    const status = response ? response.status : 0;
    return { ok: false, status, error: `HTTP ${status} loading destination HTML` };
  }

  // 3. Validate Content-Type
  const contentType = (response.headers && typeof response.headers.get === 'function')
    ? response.headers.get('content-type') || ''
    : '';
  if (!contentType.includes('text/html')) {
    return { ok: false, error: `Invalid Content-Type: expected text/html but received '${contentType}'` };
  }

  // 4. Validate Redirect URL and Enforce Route Identity Preservation
  let activeValidation = urlValidation;

  if (response.redirected) {
    if (!response.url || typeof response.url !== 'string') {
      return { ok: false, error: 'Destination redirected but final response URL is missing or unverifiable' };
    }

    const redirectedValidation = validateTargetUrl(response.url, { trustedOrigin });
    if (!redirectedValidation.ok) {
      return { ok: false, error: `Destination redirected to unauthorized path: ${redirectedValidation.error}` };
    }

    // Enforce identity preservation: redirect must not change route family
    if (redirectedValidation.route.type !== urlValidation.route.type) {
      return {
        ok: false,
        error: `Redirect changed route family from ${urlValidation.route.type} to ${redirectedValidation.route.type}`
      };
    }

    // Enforce project slug identity preservation
    if (urlValidation.route.type === 'project' && redirectedValidation.route.slug !== urlValidation.route.slug) {
      return {
        ok: false,
        error: `Redirect changed project identity: ${urlValidation.route.slug} -> ${redirectedValidation.route.slug}`
      };
    }

    activeValidation = redirectedValidation;
  }

  // 5. Bounded Response Size Check & Stream Reading
  const readResult = await readBoundedResponseBody(response, maxResponseBytes, signal);
  if (!readResult.ok) {
    return { ok: false, error: readResult.error };
  }

  // 6. Parse inert document
  let doc;
  try {
    doc = parseHtmlImpl(readResult.text);
  } catch (err) {
    return { ok: false, error: `HTML parsing failed: ${err.message}` };
  }

  // 7. Validate Document Structure against final active route type
  const docValidation = validateRouteDocument(doc, activeValidation.route.type);
  if (!docValidation.ok) {
    return { ok: false, error: docValidation.error };
  }

  return {
    ok: true,
    data: {
      url: activeValidation.url.href,
      pathname: activeValidation.pathname,
      route: activeValidation.route.type,
      slug: activeValidation.route.slug || null,
      title: docValidation.title,
      metaDescription: docValidation.metaDescription,
      mainHtml: docValidation.mainHtml
    }
  };
}
