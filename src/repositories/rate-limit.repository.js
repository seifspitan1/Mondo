import { getSupabase } from '../config/supabase.js';

/**
 * Retrieves the current rate limit record for a hashed digest key.
 * @param {string} key
 * @returns {Promise<{ data: object | null, error: any }>}
 */
export async function getRateLimit(key) {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: new Error('Supabase unconfigured') };

  return await supabase
    .from('mondo_rate_limits')
    .select('key, count')
    .eq('key', key)
    .maybeSingle();
}

/**
 * Upserts a rate limit bucket record with updated count and expiration.
 * @param {string} key
 * @param {number} count
 * @param {number} expiresAt
 * @returns {Promise<{ error: any }>}
 */
export async function upsertRateLimit(key, count, expiresAt) {
  const supabase = getSupabase();
  if (!supabase) return { error: new Error('Supabase unconfigured') };

  return await supabase
    .from('mondo_rate_limits')
    .upsert({
      key,
      count,
      expires_at: expiresAt
    }, { onConflict: 'key' });
}

/**
 * Deletes expired rate limits older than cutoff timestamp.
 * @param {number} cutoffTimestamp
 * @returns {Promise<{ error: any }>}
 */
export async function deleteExpiredRateLimits(cutoffTimestamp) {
  const supabase = getSupabase();
  if (!supabase) return { error: new Error('Supabase unconfigured') };

  return await supabase
    .from('mondo_rate_limits')
    .delete()
    .lt('expires_at', cutoffTimestamp);
}
