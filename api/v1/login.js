import {
  verifyAdminCredentials,
  signAdminToken,
  setAuthCookie,
  getClientIp,
  isAuthThrottled,
  recordFailedLogin,
  resetLoginAttempts
} from '../../src/services/auth.service.js';
import { sameOrigin } from '../../src/utils/csrf.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  if (!sameOrigin(req)) {
    return res.status(403).json({ error: 'Forbidden: Cross-origin request blocked.' });
  }

  const clientIp = getClientIp(req);
  if (isAuthThrottled(clientIp)) {
    return res.status(429).json({ error: 'Too many failed login attempts. Please try again in 15 minutes.' });
  }

  const body = req.body || {};
  const { username, password } = body;

  const result = verifyAdminCredentials(username, password);
  if (!result.ok) {
    recordFailedLogin(clientIp);
    const status = result.error.includes('not configured') ? 503 : 401;
    return res.status(status).json({ error: result.error });
  }

  resetLoginAttempts(clientIp);

  try {
    const token = signAdminToken(result.username);
    setAuthCookie(res, token);
    return res.status(200).json({ ok: true, username: result.username });
  } catch (err) {
    console.error('Failed to issue admin token:', err);
    return res.status(500).json({ error: 'Failed to issue authentication session.' });
  }
}
