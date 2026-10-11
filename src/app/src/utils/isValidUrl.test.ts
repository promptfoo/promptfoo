import { describe, expect, it } from 'vitest';
import { isSafeExternalUrl, isValidUrl } from './isValidUrl';

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

describe('isSafeExternalUrl', () => {
  it.each(['https://example.com', 'http://example.org/path?q=x'])(
    'allows web links: %s',
    (value) => expect(isSafeExternalUrl(value)).toBe(true),
  );

  it.each([
    'javascript:alert(document.domain)',
    'data:text/html,<script>alert(1)</script>',
    'file:///private/file',
    's3://bucket/key',
    'mailto:user@example.com',
    '//example.com',
    'not a url',
  ])('does not make untrusted metadata clickable: %s', (value) => {
    expect(isSafeExternalUrl(value)).toBe(false);
  });
});
