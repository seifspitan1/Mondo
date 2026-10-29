import { getSupabase } from '../config/supabase.js';
import { settingsSchema } from '../schemas/settings.schema.js';

/**
 * Fetches the singleton studio settings record from mondo_settings table.
 * Returns parsed settings object or null if not found or on error.
 * @returns {Promise<object | null>}
 */
export async function findStudioSettings() {
  const supabase = getSupabase();
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('mondo_settings')
      .select('data')
      .eq('key', 'studio')
      .maybeSingle();

    if (!error && data?.data) {
      const raw = typeof data.data === 'string' ? JSON.parse(data.data) : data.data;
      const parsed = settingsSchema.safeParse(raw);
      if (parsed.success) {
        return parsed.data;
      }
    }
  } catch (err) {
    console.error('Error fetching settings from Supabase:', err.message);
  }

  return null;
}

/**
 * Upserts the singleton studio settings row into mondo_settings.
 * @param {object} settings
 * @returns {Promise<{ error: any }>}
 */
export async function upsertStudioSettings(settings) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }

  return await supabase
    .from('mondo_settings')
    .upsert(
      {
        key: 'studio',
        data: settings,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'key' }
    );
}
