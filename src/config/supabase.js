import { createClient } from '@supabase/supabase-js';

let supabaseClient = null;

/**
 * Returns true if both SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.
 */
export function isSupabaseConfigured() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Boolean(url && key && url.startsWith('http') && key.length > 10);
}

/**
 * Returns an authenticated Supabase client using the privileged service-role key.
 * Should only ever be called on the server side.
 */
export function getSupabase() {
  if (!isSupabaseConfigured()) {
    return null;
  }
  if (!supabaseClient) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    supabaseClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }
  return supabaseClient;
}

export const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'mondo-media';
