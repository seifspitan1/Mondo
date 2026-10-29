import crypto from 'node:crypto';
import { isSupabaseConfigured } from '../config/supabase.js';
import { eventSchema } from '../schemas/event.schema.js';
import { insertEvent, findAllEventTypes } from '../repositories/event.repository.js';

/**
 * Validates and records a public engagement event.
 * @param {string} type
 * @param {string} slug
 * @returns {Promise<{ ok: boolean }>}
 */
export async function recordEvent(type, slug = '') {
  const parsed = eventSchema.safeParse({ type, slug });
  if (!parsed.success) {
    const error = new Error('Invalid event payload.');
    error.status = 400;
    throw error;
  }

  if (!isSupabaseConfigured()) {
    return { ok: true };
  }

  const { error } = await insertEvent({
    id: crypto.randomUUID(),
    type: parsed.data.type,
    slug: parsed.data.slug,
    created_at: new Date().toISOString()
  });

  if (error) {
    console.error('Failed to record event:', error);
  }

  return { ok: true };
}

/**
 * Aggregates lifetime activity event counts for the studio administration workspace.
 * @returns {Promise<{ project_open: number, trailer_play: number, form_start: number, enquiry_submitted: number }>}
 */
export async function getActivityMetrics() {
  const metrics = {
    project_open: 0,
    trailer_play: 0,
    form_start: 0,
    enquiry_submitted: 0
  };

  if (!isSupabaseConfigured()) {
    return metrics;
  }

  try {
    const { data, error } = await findAllEventTypes();

    if (!error && Array.isArray(data)) {
      for (const row of data) {
        if (typeof metrics[row.type] === 'number') {
          metrics[row.type] += 1;
        }
      }
    }
  } catch (err) {
    console.error('Error fetching activity metrics:', err.message);
  }

  return metrics;
}
