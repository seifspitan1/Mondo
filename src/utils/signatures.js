/**
 * Allowed media formats with maximum size bounds and extensions.
 */
export const allowedMediaTypes = {
  'image/jpeg': { ext: 'jpg', isImage: true, maxBytes: 12 * 1024 * 1024 },
  'image/png': { ext: 'png', isImage: true, maxBytes: 12 * 1024 * 1024 },
  'image/webp': { ext: 'webp', isImage: true, maxBytes: 12 * 1024 * 1024 },
  'video/mp4': { ext: 'mp4', isImage: false, maxBytes: 80 * 1024 * 1024 },
  'video/webm': { ext: 'webm', isImage: false, maxBytes: 80 * 1024 * 1024 }
};

/**
 * Validates binary file magic numbers to ensure actual content matches claimed MIME type.
 * Protects against extension/MIME spoofing attacks.
 * @param {string} type
 * @param {Uint8Array} bytes
 * @returns {boolean}
 */
export function matchesSignature(type, bytes) {
  if (!bytes || bytes.length < 12) return false;
  const text = (start, end) => String.fromCharCode(...bytes.slice(start, end));

  if (type === 'image/jpeg') {
    return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  }
  if (type === 'image/png') {
    return (
      bytes[0] === 137 &&
      text(1, 4) === 'PNG' &&
      bytes[4] === 13 &&
      bytes[5] === 10 &&
      bytes[6] === 26 &&
      bytes[7] === 10
    );
  }
  if (type === 'image/webp') {
    return text(0, 4) === 'RIFF' && text(8, 12) === 'WEBP';
  }
  if (type === 'video/mp4') {
    return text(4, 8) === 'ftyp';
  }
  if (type === 'video/webm') {
    return bytes[0] === 26 && bytes[1] === 69 && bytes[2] === 223 && bytes[3] === 163;
  }
  return false;
}
