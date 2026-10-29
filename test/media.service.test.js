import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesSignature, allowedMediaTypes } from '../src/utils/signatures.js';
import { getMediaPublicUrl, handleFileUpload } from '../src/services/media.service.js';

test('Signatures Utility: matchesSignature detects genuine binary headers and rejects spoofed headers', () => {
  // JPEG: FF D8 FF
  assert.equal(matchesSignature('image/jpeg', new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0, 16, 74, 70, 73, 70, 0, 1])), true);
  assert.equal(matchesSignature('image/jpeg', new Uint8Array([0x00, 0x00, 0x00, 0x00, 0, 0, 0, 0, 0, 0, 0, 0])), false);

  // PNG: 137 'PNG' 13 10 26 10
  assert.equal(matchesSignature('image/png', new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])), true);
  assert.equal(matchesSignature('image/png', new Uint8Array([60, 104, 116, 109, 108, 62, 0, 0, 0, 0, 0, 0])), false);

  // WebP: RIFF....WEBP
  assert.equal(matchesSignature('image/webp', new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 87, 69, 66, 80])), true);
  assert.equal(matchesSignature('image/webp', new Uint8Array([82, 73, 70, 70, 0, 0, 0, 0, 65, 86, 73, 32])), false);

  // MP4: ....ftyp
  assert.equal(matchesSignature('video/mp4', new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109])), true);
  assert.equal(matchesSignature('video/mp4', new Uint8Array([0, 0, 0, 24, 109, 111, 111, 118, 105, 115, 111, 109])), false);

  // WebM: 1A 45 DF A3
  assert.equal(matchesSignature('video/webm', new Uint8Array([0x1A, 0x45, 0xDF, 0xA3, 0, 0, 0, 0, 0, 0, 0, 0])), true);
  assert.equal(matchesSignature('video/webm', new Uint8Array([0x00, 0x45, 0xDF, 0xA3, 0, 0, 0, 0, 0, 0, 0, 0])), false);

  // Too short
  assert.equal(matchesSignature('image/jpeg', new Uint8Array([0xFF, 0xD8])), false);
});

test('Signatures Utility: allowedMediaTypes defines accurate size limits and file extensions', () => {
  assert.equal(allowedMediaTypes['image/jpeg'].maxBytes, 12 * 1024 * 1024);
  assert.equal(allowedMediaTypes['image/png'].maxBytes, 12 * 1024 * 1024);
  assert.equal(allowedMediaTypes['image/webp'].maxBytes, 12 * 1024 * 1024);
  assert.equal(allowedMediaTypes['video/mp4'].maxBytes, 80 * 1024 * 1024);
  assert.equal(allowedMediaTypes['video/webm'].maxBytes, 80 * 1024 * 1024);
});

test('Media Service: getMediaPublicUrl enforces strict key formatting and fails gracefully if unconfigured', () => {
  // Invalid key patterns
  assert.equal(getMediaPublicUrl(''), null);
  assert.equal(getMediaPublicUrl('../../test.png'), null);
  assert.equal(getMediaPublicUrl('malicious.sh'), null);
  assert.equal(getMediaPublicUrl('non-uuid.jpg'), null);

  // Valid uuid format but unconfigured
  assert.equal(getMediaPublicUrl('12345678-1234-1234-1234-123456789abc.webp'), null);
});

test('Media Service: handleFileUpload rejects oversized payload and invalid multipart requests', async () => {
  // Content-Length > 85 MB
  const fakeReqOversized = {
    headers: { 'content-length': `${86 * 1024 * 1024}` }
  };
  await assert.rejects(
    async () => {
      await handleFileUpload(fakeReqOversized);
    },
    (err) => {
      assert.equal(err.status, 413);
      assert.match(err.message, /smaller than 80 MB/);
      return true;
    }
  );

  // Non-multipart request
  const fakeReqBad = {
    headers: { 'content-type': 'application/json' }
  };
  await assert.rejects(
    async () => {
      await handleFileUpload(fakeReqBad);
    },
    (err) => {
      assert.equal(err.status, 400);
      assert.match(err.message, /Invalid multipart form data/);
      return true;
    }
  );
});
