import jwt from 'jsonwebtoken';
import cookie from 'cookie';
import crypto from 'node:crypto';

export const COOKIE_NAME = 'mondo_admin_token';
const TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days

// In-memory login throttling map: ip -> { count, expiresAt }
const loginAttempts = new Map();

/**
 * Checks if authentication attempts from an IP address are throttled.
 * @param {string} ip
 * @returns {boolean}
 */
export function isAuthThrottled(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record) return false;
  if (now > record.expiresAt) {
    loginAttempts.delete(ip);
    return false;
  }
  return record.count >= 5;
}

/**
 * Records a failed login attempt for an IP address.
 * Throttles after 5 failed attempts for 15 minutes.
 * @param {string} ip
 */
export function recordFailedLogin(ip) {
  const now = Date.now();
  const record = loginAttempts.get(ip);
  if (!record || now > record.expiresAt) {
    loginAttempts.set(ip, { count: 1, expiresAt: now + 15 * 60 * 1000 });
  } else {
    record.count += 1;
  }
}

/**
 * Resets failed login attempts for an IP address upon successful authentication.
 * @param {string} ip
 */
export function resetLoginAttempts(ip) {
  loginAttempts.delete(ip);
}

/**
 * Extracts client IP address across Express, Node HTTP, and reverse proxies.
 * @param {object} req
 * @returns {string}
 */
export function getClientIp(req) {
  if (!req) return '127.0.0.1';
  if (typeof req.headers?.get === 'function') {
    return (
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('cf-connecting-ip') ||
      '127.0.0.1'
    );
  }
  return (
    req.headers?.['x-forwarded-for']?.split(',')[0].trim() ||
    req.headers?.['cf-connecting-ip'] ||
    req.socket?.remoteAddress ||
    '127.0.0.1'
  );
}

/**
 * Reads JWT secret from environment, ensuring minimum length requirements.
 * @returns {string | null}
 */
export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim().length < 16) {
    return null;
  }
  return secret.trim();
}

/**
 * Checks if admin password credentials are configured.
 * There is NO default password.
 * @returns {boolean}
 */
export function areAdminCredentialsConfigured() {
  const pass = process.env.ADMIN_PASSWORD;
  const hash = process.env.ADMIN_PASSWORD_HASH;
  const secret = getJwtSecret();
  return Boolean((pass && pass.trim().length > 0) || (hash && hash.trim().length > 0)) && Boolean(secret);
}

/**
 * Verifies submitted admin username and password against configured secrets.
 * Employs timingSafeEqual to guard against timing attacks.
 * @param {string} username
 * @param {string} password
 * @returns {{ ok: boolean, username?: string, error?: string }}
 */
export function verifyAdminCredentials(username, password) {
  if (!areAdminCredentialsConfigured()) {
    return { ok: false, error: 'Admin credentials are not configured on the server.' };
  }

  const expectedUser = (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase();
  const providedUser = String(username || '').trim().toLowerCase();

  if (providedUser !== expectedUser) {
    return { ok: false, error: 'Invalid username or password.' };
  }

  const expectedPass = process.env.ADMIN_PASSWORD ? process.env.ADMIN_PASSWORD.trim() : null;
  const expectedHash = process.env.ADMIN_PASSWORD_HASH ? process.env.ADMIN_PASSWORD_HASH.trim() : null;

  const providedPass = String(password || '');

  let passwordMatches = false;

  if (expectedHash) {
    const providedHash = crypto.createHash('sha256').update(providedPass).digest('hex');
    const b1 = Buffer.from(providedHash);
    const b2 = Buffer.from(expectedHash);
    if (b1.length === b2.length && crypto.timingSafeEqual(b1, b2)) {
      passwordMatches = true;
    }
  } else if (expectedPass) {
    const b1 = crypto.createHash('sha256').update(providedPass).digest();
    const b2 = crypto.createHash('sha256').update(expectedPass).digest();
    if (crypto.timingSafeEqual(b1, b2)) {
      passwordMatches = true;
    }
  }

  if (!passwordMatches) {
    return { ok: false, error: 'Invalid username or password.' };
  }

  return { ok: true, username: expectedUser };
}

/**
 * Issues a signed admin JWT token.
 * @param {string} username
 * @returns {string}
 */
export function signAdminToken(username) {
  const secret = getJwtSecret();
  if (!secret) throw new Error('JWT_SECRET is not configured.');
  return jwt.sign(
    {
      sub: username,
      role: 'admin',
      iss: 'mondo-creative-studio'
    },
    secret,
    { expiresIn: `${TOKEN_EXPIRY_SECONDS}s` }
  );
}

/**
 * Validates and decodes an admin JWT token. Returns null if invalid or expired.
 * @param {string} token
 * @returns {object | null}
 */
export function verifyAdminToken(token) {
  const secret = getJwtSecret();
  if (!secret || !token) return null;
  try {
    return jwt.verify(token, secret, { issuer: 'mondo-creative-studio' });
  } catch {
    return null;
  }
}

/**
 * Extracts raw cookie header from request.
 * @param {object} req
 * @returns {string}
 */
export function getCookieHeader(req) {
  if (!req) return '';
  if (typeof req.headers?.get === 'function') {
    return req.headers.get('cookie') || '';
  }
  return req.headers?.cookie || '';
}

/**
 * Extracts and verifies the authenticated admin user from the request cookie.
 * @param {object} req
 * @returns {object | null}
 */
export function getAdminUserFromRequest(req) {
  const rawCookie = getCookieHeader(req);
  if (!rawCookie) return null;
  const parsed = cookie.parse(rawCookie);
  const token = parsed[COOKIE_NAME];
  if (!token) return null;
  return verifyAdminToken(token);
}

/**
 * Authorization guard: returns true if request carries a valid admin session token.
 * @param {object} req
 * @returns {boolean}
 */
export function isAdmin(req) {
  return Boolean(getAdminUserFromRequest(req));
}

/**
 * Sets HttpOnly, SameSite=Lax admin authentication cookie on the response.
 * @param {object} res
 * @param {string} token
 */
export function setAuthCookie(res, token) {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieString = cookie.serialize(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    maxAge: TOKEN_EXPIRY_SECONDS
  });

  if (typeof res.setHeader === 'function') {
    res.setHeader('Set-Cookie', cookieString);
  } else if (res.headers && typeof res.headers.set === 'function') {
    res.headers.set('Set-Cookie', cookieString);
  }
}

/**
 * Clears the admin authentication cookie on the response.
 * @param {object} res
 */
export function clearAuthCookie(res) {
  const isProd = process.env.NODE_ENV === 'production';
  const cookieString = cookie.serialize(COOKIE_NAME, '', {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
    maxAge: 0
  });

  if (typeof res.setHeader === 'function') {
    res.setHeader('Set-Cookie', cookieString);
  } else if (res.headers && typeof res.headers.set === 'function') {
    res.headers.set('Set-Cookie', cookieString);
  }
}
