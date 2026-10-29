import { getMediaPublicUrl } from '../../src/services/media.service.js';
import { isSupabaseConfigured } from '../../src/config/supabase.js';

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const key = req.query?.key || (req.url ? new URL(req.url, 'http://localhost').searchParams.get('key') : '');
  if (!key || !/^[a-f0-9-]+\.(jpg|png|webp|mp4|webm)$/i.test(key)) {
    return res.status(404).send('Not found');
  }

  if (!isSupabaseConfigured()) {
    return res.status(404).send('Media storage not configured');
  }

  try {
    const publicUrl = getMediaPublicUrl(key);
    if (!publicUrl) {
      return res.status(404).send('Not found');
    }

    res.setHeader('Location', publicUrl);
    return res.status(302).end();
  } catch (err) {
    console.error('Media handler error:', err);
    return res.status(500).send('Media retrieval error');
  }
}
