import { getSupabase } from '../config/supabase.js';
import { projectSchema } from '../schemas/project.schema.js';

/**
 * Fetches all persisted project records from mondo_projects table in Supabase.
 * Returns a map of id -> valid parsed project object, or empty map if unavailable/error.
 * @returns {Promise<Map<string, object>>}
 */
export async function findAllProjects() {
  const map = new Map();
  const supabase = getSupabase();
  if (!supabase) return map;

  try {
    const { data, error } = await supabase
      .from('mondo_projects')
      .select('*');

    if (!error && Array.isArray(data)) {
      for (const row of data) {
        const raw = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
        const parsed = projectSchema.safeParse(raw);
        if (parsed.success) {
          map.set(row.id, parsed.data);
        }
      }
    }
  } catch (err) {
    console.error('Error fetching projects from Supabase:', err.message);
  }

  return map;
}

/**
 * Upserts a project row in the mondo_projects table.
 * @param {object} project
 * @returns {Promise<{ error: any }>}
 */
export async function upsertProject(project) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new Error('Supabase client is not available');
  }

  const row = {
    id: project.id,
    slug: project.slug,
    data: project,
    updated_at: new Date().toISOString()
  };

  return await supabase
    .from('mondo_projects')
    .upsert(row, { onConflict: 'id' });
}
