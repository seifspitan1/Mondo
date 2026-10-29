import { getSupabase } from '../config/supabase.js';

/**
 * Inserts an analytics or completion event into mondo_events table.
 * @param {object} eventRecord
 * @returns {Promise<{ error: any }>}
 */
export async function insertEvent(eventRecord) {
  const supabase = getSupabase();
  if (!supabase) return { error: new Error('Supabase unconfigured') };

  return await supabase
    .from('mondo_events')
    .insert(eventRecord);
}

/**
 * Queries all recorded event types for activity metric aggregation.
 * @returns {Promise<{ data: Array<{ type: string }> | null, error: any }>}
 */
export async function findAllEventTypes() {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: new Error('Supabase unconfigured') };

  return await supabase
    .from('mondo_events')
    .select('type');
}
