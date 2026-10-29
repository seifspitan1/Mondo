import { isSupabaseConfigured } from '../config/supabase.js';
import { defaultSettings } from '../config/defaults.js';
import { settingsSchema, firstError } from '../schemas/settings.schema.js';
import { findStudioSettings, upsertStudioSettings } from '../repositories/settings.repository.js';

/**
 * Returns studio settings, falling back to canonical defaults if unconfigured.
 * @returns {Promise<object>}
 */
export async function getSettings() {
  if (isSupabaseConfigured()) {
    const settings = await findStudioSettings();
    if (settings) {
      return settings;
    }
  }

  return defaultSettings;
}

/**
 * Validates and persists studio settings into Supabase.
 * @param {object} settingsInput
 * @returns {Promise<{ ok: boolean, settings: object }>}
 */
export async function saveSettings(settingsInput) {
  if (!isSupabaseConfigured()) {
    const error = new Error('Database service is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    error.status = 503;
    throw error;
  }

  const parsed = settingsSchema.safeParse(settingsInput);
  if (!parsed.success) {
    const error = new Error(firstError(parsed.error));
    error.status = 400;
    throw error;
  }

  const { error } = await upsertStudioSettings(parsed.data);

  if (error) {
    console.error('Failed to save settings:', error);
    const err = new Error('Could not save your changes.');
    err.status = 500;
    throw err;
  }

  return { ok: true, settings: parsed.data };
}
