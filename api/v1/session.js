import { getAdminUserFromRequest } from '../../src/services/auth.service.js';
import { getProjects } from '../../src/services/project.service.js';
import { getSettings } from '../../src/services/settings.service.js';
import { getEnquiries } from '../../src/services/enquiry.service.js';
import { getActivityMetrics } from '../../src/services/activity.service.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const user = getAdminUserFromRequest(req);
  if (!user) {
    return res.status(200).json({ authenticated: false });
  }

  try {
    const [projects, settings, enquiries, activity] = await Promise.all([
      getProjects(true), // include hidden drafts for admin
      getSettings(),
      getEnquiries(500),
      getActivityMetrics()
    ]);

    return res.status(200).json({
      authenticated: true,
      user: {
        username: user.sub,
        role: user.role
      },
      projects,
      settings,
      enquiries,
      activity
    });
  } catch (err) {
    console.error('Session load error:', err);
    return res.status(500).json({ error: 'Failed to load studio administration workspace.' });
  }
}
