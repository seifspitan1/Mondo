/**
 * MONDO Admin authentication compatibility facade.
 * Re-exports authentication methods from src/services/auth.service.js.
 */

export {
  COOKIE_NAME,
  isAuthThrottled,
  recordFailedLogin,
  resetLoginAttempts,
  getClientIp,
  getJwtSecret,
  areAdminCredentialsConfigured,
  verifyAdminCredentials,
  signAdminToken,
  verifyAdminToken,
  getCookieHeader,
  getAdminUserFromRequest,
  isAdmin,
  setAuthCookie,
  clearAuthCookie
} from '../src/services/auth.service.js';
