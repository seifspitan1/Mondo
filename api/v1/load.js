import { getProjects } from '../../src/services/project.service.js';
import { getSettings } from '../../src/services/settings.service.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  try {
    const [projects, settings] = await Promise.all([
      getProjects(false), // only published projects
      getSettings()
    ]);

    // Public cache header: 60s max-age, stale-while-revalidate 300s
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json({
      ok: true,
      projects,
      settings
    });
  } catch (err) {
    console.error('API load error:', err);
    return res.status(500).json({ error: 'Failed to load studio content.' });
  }
}
