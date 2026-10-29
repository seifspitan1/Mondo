import { sameOrigin } from '../../src/utils/csrf.js';
import { recordEvent } from '../../src/services/activity.service.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  if (!sameOrigin(req)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const body = req.body || {};

  try {
    await recordEvent(body.type, body.slug);
    return res.status(204).end();
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Could not record event.' });
  }
}
