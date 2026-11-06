/**
 * MONDO — Route Eligibility (Stage G3.2-R2)
 * Pure, deterministic functions classifying route pairs for the future
 * Option C Hybrid Navigation Pilot.
 *
 * GOVERNANCE RULES:
 * - Approved pilot pairs strictly: /work <-> /work/:slug
 * - Project-to-project (/work/:slugA -> /work/:slugB) is INELIGIBLE (deferred per G3-D02).
 * - Landing (/), Start (/start), Privacy (/privacy), and Admin (/admin) are INELIGIBLE.
 * - Pure syntactic route validation decoupled from project catalog existence.
 * - Zero live event listeners, zero DOM access, zero side effects on import.
 */

// Slugs matching physical HTML filenames or reserved words that cannot be projects
const RESERVED_SLUGS = Object.freeze([
  'index',
  'index.html',
  'project',
  'project.html',
  'admin',
  'api',
  'start',
  'privacy'
]);

// Trusted local origins recognized by MONDO runtime
const TRUSTED_LOCAL_ORIGINS = Object.freeze([
  'http://localhost:3005',
  'http://localhost:3000',
  'http://127.0.0.1:3005',
  'http://127.0.0.1:3000'
]);

// Regex for well-formed project slugs: strictly lowercase letters, digits, and single hyphens
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Normalizes a pathname string or URL instance into a clean, canonical path string.
 * Strips query strings, hashes, duplicate slashes, and trailing slashes (except root).
 * Rejects external origins, unsupported protocols, and path traversal attempts.
 *
 * @param {string|URL} pathOrUrl - Raw path or URL instance
 * @returns {string} Normalized pathname (e.g. "/work" or "/work/rainbow-orchard") or empty string if invalid
 */
export function normalizePath(pathOrUrl) {
  if (!pathOrUrl) return '';

  let pathname = '';
  if (typeof pathOrUrl === 'object' && pathOrUrl !== null && typeof pathOrUrl.pathname === 'string') {
    // If URL instance was passed, check origin
    if (typeof pathOrUrl.origin === 'string') {
      if (typeof location !== 'undefined' && location.origin) {
        if (pathOrUrl.origin !== location.origin) return '';
      } else if (!TRUSTED_LOCAL_ORIGINS.includes(pathOrUrl.origin)) {
        return '';
      }
    }
    pathname = pathOrUrl.pathname;
  } else if (typeof pathOrUrl === 'string') {
    const raw = pathOrUrl.trim();

    // Reject non-http protocols (javascript:, mailto:, data:, tel:, file:)
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !raw.startsWith('http://') && !raw.startsWith('https://')) {
      return '';
    }

    // If full HTTP/HTTPS URL string was passed, validate origin
    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      try {
        const parsed = new URL(raw);
        if (typeof location !== 'undefined' && location.origin) {
          if (parsed.origin !== location.origin) return '';
        } else if (!TRUSTED_LOCAL_ORIGINS.includes(parsed.origin)) {
          return ''; // Reject external origin
        }
        pathname = parsed.pathname;
      } catch (_) {
        return '';
      }
    } else {
      // Relative path: strip query string and hash
      pathname = raw.split(/[?#]/)[0];
    }
  } else {
    return '';
  }

  // Reject malformed percent escapes or path traversal attempts
  if (pathname.includes('%') || pathname.includes('\\')) {
    try {
      pathname = decodeURIComponent(pathname);
    } catch (_) {
      return ''; // Reject corrupt percent encoding
    }
    // Block path traversal after decode
    if (pathname.includes('\\') || pathname.includes('..')) {
      return '';
    }
  }

  // Must begin with '/'
  if (!pathname.startsWith('/')) {
    pathname = `/${pathname}`;
  }

  // Collapse multiple slashes into single slash
  pathname = pathname.replace(/\/+/g, '/');

  // Strip trailing slash unless root '/'
  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  return pathname;
}

/**
 * Validates whether a string constitutes a structurally valid project slug.
 * Slugs must be non-empty, strictly lowercase, matching ^[a-z0-9]+(?:-[a-z0-9]+)*$.
 *
 * @param {string} slug - Raw slug candidate
 * @returns {boolean} True if well-formed and non-reserved
 */
export function isValidSlug(slug) {
  if (typeof slug !== 'string' || !slug) return false;
  const clean = slug.trim();
  if (!clean || clean.length > 100) return false;
  if (RESERVED_SLUGS.includes(clean.toLowerCase())) return false;
  if (clean.endsWith('.html') || clean.endsWith('.htm')) return false;
  // Strict pattern check: uppercase letters will fail SLUG_PATTERN
  return SLUG_PATTERN.test(clean);
}

/**
 * Parses a pathname into its pilot route descriptor, or returns null if not a pilot route.
 *
 * @param {string|URL} pathOrUrl - Pathname to parse
 * @returns {{ type: 'work'|'project', slug?: string }|null} Parsed descriptor or null
 */
export function parsePilotRoute(pathOrUrl) {
  const norm = normalizePath(pathOrUrl);
  if (!norm) return null;

  // 1. Work Portfolio page
  if (norm === '/work') {
    return { type: 'work' };
  }

  // 2. Project Details route: /work/:slug
  if (norm.startsWith('/work/')) {
    const segments = norm.split('/').filter(Boolean);
    // Must be exactly 2 segments: ['work', ':slug']
    if (segments.length === 2 && segments[0] === 'work') {
      const candidateSlug = segments[1];
      if (isValidSlug(candidateSlug)) {
        return { type: 'project', slug: candidateSlug };
      }
    }
  }

  return null;
}

/**
 * Determines whether an isolated pathname is an eligible pilot route.
 *
 * @param {string|URL} pathOrUrl - Pathname to evaluate
 * @returns {boolean} True if /work or valid /work/:slug
 */
export function isPilotRoute(pathOrUrl) {
  return parsePilotRoute(pathOrUrl) !== null;
}

/**
 * Authoritative pilot route pair eligibility matcher (Option C G3.2 Core).
 *
 * Enforces strict Owner Decision G3-D02:
 * Eligible transitions:
 *   - /work -> /work/:slug
 *   - /work/:slug -> /work
 *
 * Ineligible transitions:
 *   - /work/:slugA -> /work/:slugB (Project-to-project deferred)
 *   - /work -> /work (Same-route)
 *   - /work/:slugA -> /work/:slugA (Same-route)
 *   - Non-pilot routes (/, /start, /privacy, /admin)
 *   - External URLs or malformed paths
 *
 * @param {string|URL} currentPathOrUrl - Current active pathname
 * @param {string|URL} targetPathOrUrl - Desired destination pathname
 * @returns {boolean} True if the pair qualifies for hybrid interception
 */
export function isEligiblePilotPair(currentPathOrUrl, targetPathOrUrl) {
  const current = parsePilotRoute(currentPathOrUrl);
  const target = parsePilotRoute(targetPathOrUrl);

  // Both endpoints must be valid pilot routes
  if (!current || !target) {
    return false;
  }

  // Case 1: /work -> /work/:slug
  if (current.type === 'work' && target.type === 'project') {
    return Boolean(target.slug);
  }

  // Case 2: /work/:slug -> /work
  if (current.type === 'project' && target.type === 'work') {
    return true;
  }

  // Case 3: Project-to-project (/work/:slugA -> /work/:slugB)
  // DEFERRED per Owner Decision G3-D02: retains native MPA navigation
  if (current.type === 'project' && target.type === 'project') {
    return false;
  }

  // Case 4: Same-route (/work -> /work)
  if (current.type === 'work' && target.type === 'work') {
    return false;
  }

  return false;
}
