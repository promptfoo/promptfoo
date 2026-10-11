import { describe, expect, it } from 'vitest';
import { isValidUrl } from './isValidUrl';

describe('isValidUrl', () => {
  it.each([
    'https://example.com/document#section',
    's3://bucket/file',
    'file:///document',
    'mailto:user@example.com',
  ])('recognizes absolute URLs: %s', (value) => {
    expect(isValidUrl(value)).toBe(true);
  });
  it.each(['', 'document.pdf', '/relative/path', 'https://', 'https://exa mple.com'])(
    'rejects invalid or relative URLs: %s',
    (value) => {
      expect(isValidUrl(value)).toBe(false);
    },
  );
});
