import { isAdmin } from '../../src/services/auth.service.js';
import { sameOrigin } from '../../src/utils/csrf.js';
import { handleFileUpload } from '../../src/services/media.service.js';

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  if (!sameOrigin(req) || !isAdmin(req)) {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  try {
    const result = await handleFileUpload(req);
    return res.status(200).json(result);
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Upload failed. Please try again.' });
  }
}
