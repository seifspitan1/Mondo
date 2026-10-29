import { getSupabase } from '../config/supabase.js';

/**
 * Finds an enquiry record by id to support idempotency checks.
 * @param {string} id
 * @returns {Promise<{ data: object | null, error: any }>}
 */
export async function findEnquiryById(id) {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: new Error('Supabase unconfigured') };

  return await supabase
    .from('mondo_enquiries')
    .select('id, email, goal')
    .eq('id', id)
    .maybeSingle();
}

/**
 * Inserts a new customer brief record into mondo_enquiries.
 * @param {object} row
 * @returns {Promise<{ error: any }>}
 */
export async function insertEnquiry(row) {
  const supabase = getSupabase();
  if (!supabase) return { error: new Error('Supabase unconfigured') };

  return await supabase
    .from('mondo_enquiries')
    .insert(row);
}

/**
 * Loads recent enquiry records ordered by newest first.
 * @param {number} limit
 * @returns {Promise<Array<object>>}
 */
export async function findEnquiries(limit = 500) {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('mondo_enquiries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Failed to load enquiries:', error);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    discord: row.discord || '',
    gameUrl: row.game_url || '',
    service: row.service,
    packageName: row.package_name || '',
    goal: row.goal,
    budget: row.budget || '',
    deadline: row.deadline || '',
    status: row.status,
    createdAt: row.created_at
  }));
}

/**
 * Updates the workflow status of an enquiry.
 * @param {string} id
 * @param {string} status
 * @returns {Promise<{ data: any, error: any }>}
 */
export async function updateEnquiryStatusInDb(id, status) {
  const supabase = getSupabase();
  if (!supabase) return { data: null, error: new Error('Supabase unconfigured') };

  return await supabase
    .from('mondo_enquiries')
    .update({ status })
    .eq('id', id)
    .select('id');
}

/**
 * Deletes an enquiry record by id.
 * @param {string} id
 * @returns {Promise<{ error: any }>}
 */
export async function deleteEnquiryFromDb(id) {
  const supabase = getSupabase();
  if (!supabase) return { error: new Error('Supabase unconfigured') };

  return await supabase
    .from('mondo_enquiries')
    .delete()
    .eq('id', id);
}
