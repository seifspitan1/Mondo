import { clearAuthCookie } from '../../src/services/auth.service.js';
import { sameOrigin } from '../../src/utils/csrf.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  if (!sameOrigin(req)) {
    return res.status(403).json({ error: 'Forbidden: Cross-origin request blocked.' });
  }

  clearAuthCookie(res);
  return res.status(200).json({ ok: true });
}
