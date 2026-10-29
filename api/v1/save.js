import { isAdmin } from '../../src/services/auth.service.js';
import { sameOrigin } from '../../src/utils/csrf.js';
import { saveProject } from '../../src/services/project.service.js';
import { saveSettings } from '../../src/services/settings.service.js';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'PUT') {
    res.setHeader('Allow', 'POST, PUT');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  if (!sameOrigin(req) || !isAdmin(req)) {
    return res.status(403).json({ error: 'Admin access required.' });
  }

  const body = req.body || {};

  try {
    // Detect whether body is saving a project or studio settings
    const isExplicitProject = body.type === 'project';
    const isExplicitSettings = body.type === 'settings';

    const payload = body.data !== undefined ? body.data : body;

    const isSettings = isExplicitSettings || (payload && Array.isArray(payload.packages) && Array.isArray(payload.services));

    if (isSettings) {
      const result = await saveSettings(payload);
      return res.status(200).json(result);
    } else {
      const result = await saveProject(payload);
      return res.status(200).json(result);
    }
  } catch (err) {
    const status = err.status || 500;
    return res.status(status).json({ error: err.message || 'Could not save your changes.' });
  }
}
