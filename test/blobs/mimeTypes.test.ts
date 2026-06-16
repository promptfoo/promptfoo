import { describe, expect, it } from 'vitest';
import { sanitizeBlobMimeType } from '../../src/blobs/mimeTypes';

describe('sanitizeBlobMimeType', () => {
  it('keeps allowlisted media types, normalizing case and whitespace', () => {
    expect(sanitizeBlobMimeType('image/png')).toBe('image/png');
    expect(sanitizeBlobMimeType('  IMAGE/PNG  ')).toBe('image/png');
    expect(sanitizeBlobMimeType('image/webp')).toBe('image/webp');
    expect(sanitizeBlobMimeType('video/mp4')).toBe('video/mp4');
    expect(sanitizeBlobMimeType('audio/mpeg')).toBe('audio/mpeg');
    expect(sanitizeBlobMimeType('audio/x-wav')).toBe('audio/x-wav');
  });

  it('downgrades active or unknown content types to octet-stream', () => {
    // These would be stored-XSS vectors if reflected back as Content-Type from our origin.
    expect(sanitizeBlobMimeType('text/html')).toBe('application/octet-stream');
    expect(sanitizeBlobMimeType('image/svg+xml')).toBe('application/octet-stream');
    expect(sanitizeBlobMimeType('application/javascript')).toBe('application/octet-stream');
    expect(sanitizeBlobMimeType('application/vnd.promptfoo.trace+json')).toBe(
      'application/octet-stream',
    );
    // Non-allowlisted image subtypes are downgraded too (consistent with portable imports).
    expect(sanitizeBlobMimeType('image/bmp')).toBe('application/octet-stream');
  });
});
