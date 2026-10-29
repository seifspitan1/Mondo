import crypto from 'node:crypto';
import { isSupabaseConfigured } from '../config/supabase.js';
import { enquirySchema, enquiryStatuses, firstError } from '../schemas/enquiry.schema.js';
import {
  findEnquiryById,
  insertEnquiry,
  findEnquiries,
  updateEnquiryStatusInDb,
  deleteEnquiryFromDb
} from '../repositories/enquiry.repository.js';
import {
  getRateLimit,
  upsertRateLimit,
  deleteExpiredRateLimits
} from '../repositories/rate-limit.repository.js';
import { insertEvent } from '../repositories/event.repository.js';

/**
 * Validates, rate-limits, and submits a client brief.
 * Handles idempotent retries and completion event tracking.
 * @param {object} enquiryInput
 * @param {string} clientIp
 * @returns {Promise<{ ok: boolean, id: string, status: number }>}
 */
export async function submitEnquiry(enquiryInput, clientIp = '127.0.0.1') {
  if (!isSupabaseConfigured()) {
    const error = new Error('Database service is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    error.status = 503;
    throw error;
  }

  const parsed = enquirySchema.safeParse(enquiryInput);
  if (!parsed.success) {
    const error = new Error(firstError(parsed.error));
    error.status = 400;
    throw error;
  }

  const { id, name, email, discord, gameUrl, service, packageName, goal, budget, deadline } = parsed.data;

  // 1. Idempotency / Retry Protection: check if enquiry already exists
  const { data: existing } = await findEnquiryById(id);

  if (existing) {
    if (existing.email === email && existing.goal === goal) {
      return { ok: true, id, status: 200 };
    }
    const conflictErr = new Error('Please refresh and try again.');
    conflictErr.status = 409;
    throw conflictErr;
  }

  // 2. Submission Rate Limiting (5 requests per 15 minutes)
  const now = Date.now();
  const bucket = Math.floor(now / 900000); // 15-minute window
  const digest = crypto.createHash('sha256').update(`mondo-enquiry:${clientIp}:${bucket}`).digest('hex');

  const { data: rateData } = await getRateLimit(digest);

  if (rateData && rateData.count >= 5) {
    const limitErr = new Error('Too many requests. Please try again in 15 minutes.');
    limitErr.status = 429;
    throw limitErr;
  }

  const newCount = (rateData?.count || 0) + 1;
  await upsertRateLimit(digest, newCount, now + 900000);

  // 3. Persist Enquiry and Completion Event
  const createdAt = new Date().toISOString();
  const { error: insertErr } = await insertEnquiry({
    id,
    name,
    email,
    discord: discord || '',
    game_url: gameUrl || '',
    service,
    package_name: packageName || '',
    goal,
    budget: budget || '',
    deadline: deadline || '',
    status: 'New',
    created_at: createdAt
  });

  if (insertErr) {
    console.error('Failed to insert enquiry:', insertErr);
    const err = new Error('We couldn’t save your brief. Please try again; your details are still in the form.');
    err.status = 500;
    throw err;
  }

  // Record completion event
  await insertEvent({
    id: 'enquiry-' + id,
    type: 'enquiry_submitted',
    slug: '',
    created_at: createdAt
  });

  // Background cleanup of expired rate limits
  try {
    await deleteExpiredRateLimits(now - 86400000);
  } catch {}

  return { ok: true, id, status: 201 };
}

/**
 * Loads recent enquiry records for admin review.
 * @param {number} limit
 * @returns {Promise<Array<object>>}
 */
export async function getEnquiries(limit = 500) {
  if (!isSupabaseConfigured()) {
    return [];
  }
  return await findEnquiries(limit);
}

/**
 * Updates the workflow status of an enquiry.
 * @param {string} id
 * @param {string} status
 * @returns {Promise<{ ok: boolean }>}
 */
export async function updateEnquiryStatus(id, status) {
  if (!isSupabaseConfigured()) {
    const error = new Error('Database service is not configured.');
    error.status = 503;
    throw error;
  }

  if (!enquiryStatuses.includes(status)) {
    const error = new Error('Choose a valid status.');
    error.status = 400;
    throw error;
  }

  const { data, error } = await updateEnquiryStatusInDb(id, status);

  if (error || !data || data.length === 0) {
    const err = new Error(error ? 'Could not update the enquiry.' : 'Enquiry not found.');
    err.status = error ? 500 : 404;
    throw err;
  }

  return { ok: true };
}

/**
 * Deletes an enquiry record by id.
 * @param {string} id
 * @returns {Promise<{ ok: boolean }>}
 */
export async function deleteEnquiry(id) {
  if (!isSupabaseConfigured()) {
    const error = new Error('Database service is not configured.');
    error.status = 503;
    throw error;
  }

  const { error } = await deleteEnquiryFromDb(id);

  if (error) {
    const err = new Error('Could not delete the enquiry.');
    err.status = 500;
    throw err;
  }

  return { ok: true };
}
