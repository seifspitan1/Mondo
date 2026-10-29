import { isSupabaseConfigured } from '../config/supabase.js';
import { defaultProjects } from '../config/defaults.js';
import { projectSchema, firstError } from '../schemas/project.schema.js';
import { findAllProjects, upsertProject } from '../repositories/project.repository.js';

/**
 * Returns list of projects, merging database overrides onto defaults.
 * @param {boolean} includeHidden
 * @returns {Promise<Array<object>>}
 */
export async function getProjects(includeHidden = false) {
  const merged = new Map(defaultProjects.map((p) => [p.id, { ...p }]));

  if (isSupabaseConfigured()) {
    const overrides = await findAllProjects();
    for (const [id, project] of overrides) {
      merged.set(id, project);
    }
  }

  return [...merged.values()]
    .filter((p) => includeHidden || p.published)
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

/**
 * Finds a single project by its URL slug.
 * @param {string} slug
 * @param {boolean} includeHidden
 * @returns {Promise<object | null>}
 */
export async function getProjectBySlug(slug, includeHidden = false) {
  const list = await getProjects(includeHidden);
  return list.find((p) => p.slug === slug) || null;
}

/**
 * Validates and saves a project record to Supabase.
 * Enforces slug uniqueness and schema validation.
 * @param {object} projectInput
 * @returns {Promise<{ ok: boolean, project: object }>}
 */
export async function saveProject(projectInput) {
  if (!isSupabaseConfigured()) {
    const error = new Error('Database service is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    error.status = 503;
    throw error;
  }

  const parsed = projectSchema.safeParse(projectInput);
  if (!parsed.success) {
    const error = new Error(firstError(parsed.error));
    error.status = 400;
    throw error;
  }

  const project = parsed.data;
  const existing = await getProjects(true);
  if (existing.some((x) => x.slug === project.slug && x.id !== project.id)) {
    const error = new Error('This project URL is already in use.');
    error.status = 409;
    throw error;
  }

  const { error } = await upsertProject(project);

  if (error) {
    console.error('Failed to save project:', error);
    const err = new Error('Could not save the project. Please try again.');
    err.status = 500;
    throw err;
  }

  return { ok: true, project };
}
