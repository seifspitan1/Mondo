/**
 * Validates same-origin request for CSRF protection.
 * Supports standard Fetch/Web API Request objects and Express/Node req objects.
 * @param {object} req
 * @returns {boolean}
 */
export function sameOrigin(req) {
  const getHeader = (name) => {
    if (!req) return null;
    if (typeof req.headers?.get === 'function') {
      return req.headers.get(name);
    }
    return req.headers?.[name.toLowerCase()] || null;
  };

  const origin = getHeader('origin');
  if (!origin) {
    // If no origin header, check sec-fetch-site or referer
    const fetchSite = getHeader('sec-fetch-site');
    if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
      return false;
    }
    return true;
  }

  try {
    const originUrl = new URL(origin);
    const hostHeader = getHeader('x-forwarded-host') || getHeader('host');
    if (hostHeader) {
      const cleanHost = hostHeader.split(':')[0].toLowerCase();
      const originHost = originUrl.hostname.toLowerCase();
      return cleanHost === originHost;
    }
    if (req.url && req.url.startsWith('http')) {
      const targetUrl = new URL(req.url);
      return originUrl.origin === targetUrl.origin;
    }
    return true;
  } catch {
    return false;
  }
}
