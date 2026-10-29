import busboy from 'busboy';
import crypto from 'node:crypto';
import { getSupabase, isSupabaseConfigured, STORAGE_BUCKET } from '../config/supabase.js';
import { allowedMediaTypes, matchesSignature } from '../utils/signatures.js';

/**
 * Handles multipart file upload using busboy and uploads to Supabase storage.
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<{ ok: boolean, url: string, key: string }>}
 */
export function handleFileUpload(req) {
  return new Promise((resolve, reject) => {
    const contentLength = Number(req.headers['content-length'] || 0);
    if (contentLength > 85 * 1024 * 1024) {
      const err = new Error('Choose a file smaller than 80 MB.');
      err.status = 413;
      return reject(err);
    }

    let bb;
    try {
      bb = busboy({
        headers: req.headers,
        limits: {
          files: 1,
          fileSize: 80 * 1024 * 1024
        }
      });
    } catch (e) {
      const err = new Error('Invalid multipart form data.');
      err.status = 400;
      return reject(err);
    }

    let fileFound = false;
    let fileTooLarge = false;
    let fileBufferChunks = [];
    let fileMimeType = '';
    let originalFilename = '';

    bb.on('file', (name, stream, info) => {
      fileFound = true;
      fileMimeType = (info.mimeType || '').toLowerCase();
      originalFilename = info.filename || '';

      const typeConfig = allowedMediaTypes[fileMimeType];
      if (!typeConfig) {
        stream.resume();
        const err = new Error('Choose a JPG, PNG, WebP, MP4, or WebM file.');
        err.status = 400;
        return reject(err);
      }

      let currentSize = 0;
      stream.on('data', (data) => {
        currentSize += data.length;
        if (currentSize > typeConfig.maxBytes) {
          fileTooLarge = true;
          stream.resume();
          const err = new Error(
            typeConfig.isImage
              ? 'Images must be under 12 MB.'
              : 'Videos must be under 80 MB.'
          );
          err.status = 413;
          return reject(err);
        }
        fileBufferChunks.push(data);
      });
    });

    bb.on('finish', async () => {
      if (!fileFound || fileBufferChunks.length === 0) {
        const err = new Error('No file was uploaded.');
        err.status = 400;
        return reject(err);
      }
      if (fileTooLarge) return;

      const fileBuffer = Buffer.concat(fileBufferChunks);
      const typeConfig = allowedMediaTypes[fileMimeType];
      if (!typeConfig) {
        const err = new Error('Choose a JPG, PNG, WebP, MP4, or WebM file.');
        err.status = 400;
        return reject(err);
      }

      // Check file signature / magic numbers
      const firstBytes = new Uint8Array(fileBuffer.subarray(0, 32));
      if (!matchesSignature(fileMimeType, firstBytes)) {
        const err = new Error('The file content does not match its type. Please export it again.');
        err.status = 400;
        return reject(err);
      }

      if (!isSupabaseConfigured()) {
        const err = new Error('Supabase storage is not configured. Please set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
        err.status = 503;
        return reject(err);
      }

      try {
        const supabase = getSupabase();
        const key = crypto.randomUUID() + '.' + typeConfig.ext;

        const { data, error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .upload(key, fileBuffer, {
            contentType: fileMimeType,
            cacheControl: 'public, max-age=31536000, immutable',
            upsert: true
          });

        if (error) {
          console.error('Supabase storage upload error:', error);
          const err = new Error('Upload failed. Please try again.');
          err.status = 500;
          return reject(err);
        }

        resolve({
          ok: true,
          url: '/media/' + key,
          key
        });
      } catch (uploadErr) {
        console.error('Upload exception:', uploadErr);
        const err = new Error('Upload failed. Please try again.');
        err.status = 500;
        reject(err);
      }
    });

    bb.on('error', (err) => {
      reject(err);
    });

    req.pipe(bb);
  });
}

/**
 * Resolves the public CDN delivery URL for a stored media key.
 * @param {string} key
 * @returns {string | null}
 */
export function getMediaPublicUrl(key) {
  if (!key || !/^[a-f0-9-]+\.(jpg|png|webp|mp4|webm)$/i.test(key)) {
    return null;
  }
  if (!isSupabaseConfigured()) {
    return null;
  }

  try {
    const supabase = getSupabase();
    const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(key);
    return data?.publicUrl || null;
  } catch {
    return null;
  }
}
