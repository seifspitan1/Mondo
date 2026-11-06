/**
 * MONDO — Pure Route Registry (Stage G3.2)
 * Declarative route specifications, metadata, and pattern matching
 * for the Option C Hybrid Navigation Pilot.
 *
 * STRICT DORMANCY RULES:
 * - NO feature module imports or lifecycle execution in G3.2.
 * - NO lifecycle function binding in G3.2 (deferred to G3.3).
 * - Immutable route metadata definitions only.
 * - Zero live DOM access, zero side effects on import.
 */

import { parsePilotRoute, normalizePath, isValidSlug } from './route-eligibility.js';

/**
 * Immutable route metadata definitions for the initial G3 pilot routes.
 */
export const PILOT_ROUTE_DEFINITIONS = Object.freeze({
  work: Object.freeze({
    id: 'work',
    pattern: '/work',
    title: 'Our work — MONDO',
    hasParams: false,
    landmarkSelector: '#main',
    expectedContentSelector: '#work-grid'
  }),
  project: Object.freeze({
    id: 'project',
    pattern: '/work/:slug',
    titleTemplate: 'Project Details — MONDO',
    hasParams: true,
    paramName: 'slug',
    landmarkSelector: '#main',
    expectedContentSelector: '#project-main'
  })
});

/**
 * Matches a pathname against the pilot route definitions.
 *
 * @param {string|URL} pathOrUrl - Raw path or URL
 * @returns {{ id: 'work'|'project', definition: object, params: { slug?: string } }|null}
 */
export function matchPilotRoute(pathOrUrl) {
  const parsed = parsePilotRoute(pathOrUrl);
  if (!parsed) return null;

  if (parsed.type === 'work') {
    return {
      id: 'work',
      definition: PILOT_ROUTE_DEFINITIONS.work,
      params: {}
    };
  }

  if (parsed.type === 'project' && parsed.slug) {
    return {
      id: 'project',
      definition: PILOT_ROUTE_DEFINITIONS.project,
      params: { slug: parsed.slug }
    };
  }

  return null;
}

/**
 * Extracts a valid, normalized project slug from a path string or URL.
 *
 * @param {string|URL} pathOrUrl - Path or URL candidate
 * @returns {string|null} Extracted slug or null if not a project route
 */
export function extractProjectSlug(pathOrUrl) {
  const norm = normalizePath(pathOrUrl);
  if (!norm || !norm.startsWith('/work/')) return null;

  const parts = norm.split('/').filter(Boolean);
  if (parts.length === 2 && parts[0] === 'work' && isValidSlug(parts[1])) {
    return parts[1];
  }

  return null;
}

/**
 * Checks whether a given path matches any supported pilot route definition.
 *
 * @param {string|URL} pathOrUrl - Path or URL candidate
 * @returns {boolean} True if matching /work or /work/:slug
 */
export function isSupportedPilotRoute(pathOrUrl) {
  return matchPilotRoute(pathOrUrl) !== null;
}

/**
 * Returns an array of all registered pilot route IDs.
 *
 * @returns {string[]} ['work', 'project']
 */
export function getRegisteredRouteIds() {
  return Object.keys(PILOT_ROUTE_DEFINITIONS);
}
