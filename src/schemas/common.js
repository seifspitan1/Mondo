import { z } from 'zod';

/**
 * Validates a web URL safely, rejecting credentials (username/password)
 * and optionally requiring HTTPS.
 */
export function webUrl(value, httpsOnly = false) {
  try {
    const url = new URL(value);
    return !!url.hostname && !url.username && !url.password && (url.protocol === 'https:' || (!httpsOnly && url.protocol === 'http:'));
  } catch {
    return false;
  }
}

export const safeUrl = z
  .string()
  .trim()
  .max(1000)
  .refine((v) => !v || webUrl(v), 'Use a full https:// link.');

export const mediaUrl = z
  .string()
  .trim()
  .max(1000)
  .refine(
    (v) => !v || /^\/(assets|media)\/[a-zA-Z0-9_.-]+$/.test(v) || webUrl(v, true),
    'Use an uploaded file or a full HTTPS media link.'
  );

export function firstError(error) {
  return error?.issues?.[0]?.message || 'Please check the form.';
}
