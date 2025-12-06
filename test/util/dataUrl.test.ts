import { describe, expect, it } from 'vitest';
import { extractBase64FromDataUrl, isDataUrl, parseDataUrl } from '../../src/util/dataUrl';

describe('dataUrl utilities', () => {
  describe('isDataUrl', () => {
    it('should return true for valid data URLs', () => {
      expect(isDataUrl('data:image/jpeg;base64,/9j/4AAQSkZJRg')).toBe(true);
      expect(isDataUrl('data:image/png;base64,iVBORw0KGgo')).toBe(true);
      expect(isDataUrl('data:image/gif;base64,R0lGODlh')).toBe(true);
      expect(isDataUrl('data:image/webp;base64,UklGR')).toBe(true);
      expect(isDataUrl('data:text/plain;base64,SGVsbG8=')).toBe(true);
    });

    it('should return false for raw base64 strings', () => {
      expect(isDataUrl('/9j/4AAQSkZJRg')).toBe(false);
      expect(isDataUrl('iVBORw0KGgo')).toBe(false);
      expect(isDataUrl('R0lGODlh')).toBe(false);
    });

    it('should return false for HTTP URLs', () => {
      expect(isDataUrl('https://example.com/image.jpg')).toBe(false);
      expect(isDataUrl('http://example.com/image.png')).toBe(false);
    });

    it('should return false for file URLs', () => {
      expect(isDataUrl('file://path/to/image.jpg')).toBe(false);
    });

    it('should return false for empty or invalid strings', () => {
      expect(isDataUrl('')).toBe(false);
      expect(isDataUrl('not a url')).toBe(false);
      expect(isDataUrl('data')).toBe(false);
      expect(isDataUrl('data:')).toBe(false);
    });

    it('should return false for non-string values', () => {
      expect(isDataUrl(null as any)).toBe(false);
      expect(isDataUrl(undefined as any)).toBe(false);
      expect(isDataUrl(123 as any)).toBe(false);
      expect(isDataUrl({} as any)).toBe(false);
    });
  });

  describe('parseDataUrl', () => {
    it('should parse valid JPEG data URL', () => {
      const result = parseDataUrl('data:image/jpeg;base64,/9j/4AAQSkZJRg');
      expect(result).toEqual({
        mimeType: 'image/jpeg',
        base64Data: '/9j/4AAQSkZJRg',
      });
    });

    it('should parse valid PNG data URL', () => {
      const result = parseDataUrl('data:image/png;base64,iVBORw0KGgo');
      expect(result).toEqual({
        mimeType: 'image/png',
        base64Data: 'iVBORw0KGgo',
      });
    });

    it('should parse valid GIF data URL', () => {
      const result = parseDataUrl('data:image/gif;base64,R0lGODlh');
      expect(result).toEqual({
        mimeType: 'image/gif',
        base64Data: 'R0lGODlh',
      });
    });

    it('should parse valid WebP data URL', () => {
      const result = parseDataUrl('data:image/webp;base64,UklGR');
      expect(result).toEqual({
        mimeType: 'image/webp',
        base64Data: 'UklGR',
      });
    });

    it('should parse data URL with long base64 data', () => {
      const longBase64 =
        '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wgARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGgP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//aAAwDAQACAAMAAAAQ/wD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==';
      const result = parseDataUrl(`data:image/jpeg;base64,${longBase64}`);
      expect(result).toEqual({
        mimeType: 'image/jpeg',
        base64Data: longBase64,
      });
    });

    it('should return null for raw base64 strings', () => {
      expect(parseDataUrl('/9j/4AAQSkZJRg')).toBeNull();
      expect(parseDataUrl('iVBORw0KGgo')).toBeNull();
    });

    it('should return null for HTTP URLs', () => {
      expect(parseDataUrl('https://example.com/image.jpg')).toBeNull();
    });

    it('should return null for malformed data URLs', () => {
      expect(parseDataUrl('data:image/jpeg')).toBeNull();
      expect(parseDataUrl('data:image/jpeg;base64')).toBeNull();
      expect(parseDataUrl('data:image/jpeg;base64,')).toBeNull();
      expect(parseDataUrl('data:;base64,/9j/')).toBeNull(); // missing mime type
    });

    it('should return null for data URLs without base64 encoding', () => {
      expect(parseDataUrl('data:text/plain,Hello World')).toBeNull();
      expect(parseDataUrl('data:image/jpeg,not-base64')).toBeNull();
    });

    it('should return null for empty string', () => {
      expect(parseDataUrl('')).toBeNull();
    });

    it('should handle data URLs with special characters in MIME type', () => {
      const result = parseDataUrl('data:image/svg+xml;base64,PHN2Zz4=');
      expect(result).toEqual({
        mimeType: 'image/svg+xml',
        base64Data: 'PHN2Zz4=',
      });
    });
  });

  describe('edge cases', () => {
    it('should handle data URLs with charset parameter', () => {
      const result = parseDataUrl('data:image/jpeg;charset=utf-8;base64,/9j/test');
      expect(result).toEqual({
        mimeType: 'image/jpeg',
        base64Data: '/9j/test',
      });
    });

    it('should handle data URLs with multiple parameters', () => {
      const result = parseDataUrl('data:image/jpeg;name=photo.jpg;charset=utf-8;base64,/9j/test');
      expect(result).toEqual({
        mimeType: 'image/jpeg',
        base64Data: '/9j/test',
      });
    });

    it('should trim whitespace from base64 data', () => {
      const result = parseDataUrl('data:image/jpeg;base64, /9j/test ');
      expect(result?.base64Data).toBe('/9j/test');
    });

    it('should trim whitespace from MIME type', () => {
      const result = parseDataUrl('data: image/jpeg ;base64,/9j/test');
      expect(result?.mimeType).toBe('image/jpeg');
    });

    it('should handle empty base64 data gracefully', () => {
      const result = parseDataUrl('data:image/jpeg;base64,');
      expect(result).toBeNull();
    });

    it('should reject case-insensitive data URLs', () => {
      expect(isDataUrl('DATA:image/jpeg;base64,test')).toBe(false);
      expect(isDataUrl('Data:image/jpeg;base64,test')).toBe(false);
      expect(isDataUrl('dAtA:image/jpeg;base64,test')).toBe(false);
    });

    it('should reject data URLs with newlines in base64', () => {
      const result = parseDataUrl('data:image/jpeg;base64,/9j/\n4AAQ\ntest');
      expect(result).toBeNull();
    });

    it('should handle very short valid base64 (small GIFs)', () => {
      // Smallest valid 1x1 GIF is ~35 chars, we support down to 20
      const smallBase64 = 'R0lGODlhAQABAAAAACw='; // 20 chars
      const result = parseDataUrl(`data:image/gif;base64,${smallBase64}`);
      expect(result).toEqual({
        mimeType: 'image/gif',
        base64Data: smallBase64,
      });
    });

    it('should extract base64 from data URLs with charset parameter', () => {
      const base64 = '/9j/test';
      const dataUrl = `data:image/jpeg;charset=utf-8;base64,${base64}`;
      expect(extractBase64FromDataUrl(dataUrl)).toBe(base64);
    });

    it('should handle URL-encoded SVG (not supported, should fail gracefully)', () => {
      const urlEncodedSvg = 'data:image/svg+xml,%3Csvg%3E%3C/svg%3E';
      expect(parseDataUrl(urlEncodedSvg)).toBeNull();
      // Should pass through unchanged since it's not recognized as data URL
      expect(extractBase64FromDataUrl(urlEncodedSvg)).toBe(urlEncodedSvg);
    });
  });

  describe('extractBase64FromDataUrl', () => {
    it('should extract base64 from JPEG data URL', () => {
      const base64 = '/9j/4AAQSkZJRg';
      const dataUrl = `data:image/jpeg;base64,${base64}`;
      expect(extractBase64FromDataUrl(dataUrl)).toBe(base64);
    });

    it('should extract base64 from PNG data URL', () => {
      const base64 = 'iVBORw0KGgo';
      const dataUrl = `data:image/png;base64,${base64}`;
      expect(extractBase64FromDataUrl(dataUrl)).toBe(base64);
    });

    it('should extract base64 from GIF data URL', () => {
      const base64 = 'R0lGODlh';
      const dataUrl = `data:image/gif;base64,${base64}`;
      expect(extractBase64FromDataUrl(dataUrl)).toBe(base64);
    });

    it('should return unchanged raw base64 strings', () => {
      const base64 = '/9j/4AAQSkZJRg';
      expect(extractBase64FromDataUrl(base64)).toBe(base64);
    });

    it('should return unchanged HTTP URLs', () => {
      const url = 'https://example.com/image.jpg';
      expect(extractBase64FromDataUrl(url)).toBe(url);
    });

    it('should handle long base64 strings', () => {
      const longBase64 =
        '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wgARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGgP//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//aAAwDAQACAAMAAAAQ/wD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==';
      const dataUrl = `data:image/jpeg;base64,${longBase64}`;
      expect(extractBase64FromDataUrl(dataUrl)).toBe(longBase64);
    });

    it('should be idempotent - extracting from already extracted data returns same value', () => {
      const base64 = '/9j/4AAQSkZJRg';
      const extracted1 = extractBase64FromDataUrl(`data:image/jpeg;base64,${base64}`);
      const extracted2 = extractBase64FromDataUrl(extracted1);
      expect(extracted1).toBe(base64);
      expect(extracted2).toBe(base64);
    });

    it('should handle malformed data URLs by returning them unchanged', () => {
      const malformed = 'data:image/jpeg';
      expect(extractBase64FromDataUrl(malformed)).toBe(malformed);
    });

    it('should handle empty strings', () => {
      expect(extractBase64FromDataUrl('')).toBe('');
    });
  });

  describe('integration scenarios', () => {
    it('should handle Azure OpenAI use case (data URLs work natively)', () => {
      const base64 = '/9j/4AAQSkZJRg';
      const dataUrl = `data:image/jpeg;base64,${base64}`;

      // Azure accepts data URLs directly
      expect(isDataUrl(dataUrl)).toBe(true);
      // No conversion needed
    });

    it('should handle Anthropic use case (needs base64 extraction)', () => {
      const base64 = '/9j/4AAQSkZJRg';
      const dataUrl = `data:image/jpeg;base64,${base64}`;

      // Anthropic needs raw base64
      const extracted = extractBase64FromDataUrl(dataUrl);
      expect(extracted).toBe(base64);

      // And MIME type
      const parsed = parseDataUrl(dataUrl);
      expect(parsed?.mimeType).toBe('image/jpeg');
    });

    it('should handle Google Gemini use case (needs base64 extraction)', () => {
      const base64 = 'iVBORw0KGgo';
      const dataUrl = `data:image/png;base64,${base64}`;

      // Google needs raw base64 for inlineData.data
      const extracted = extractBase64FromDataUrl(dataUrl);
      expect(extracted).toBe(base64);

      // And MIME type for inlineData.mimeType
      const parsed = parseDataUrl(dataUrl);
      expect(parsed?.mimeType).toBe('image/png');
    });

    it('should handle raw base64 passthrough (backwards compatibility)', () => {
      const rawBase64 = '/9j/4AAQSkZJRg';

      // Should not be detected as data URL
      expect(isDataUrl(rawBase64)).toBe(false);

      // Should pass through unchanged
      expect(extractBase64FromDataUrl(rawBase64)).toBe(rawBase64);
    });

    it('should handle HTTP URL passthrough', () => {
      const httpUrl = 'https://example.com/image.jpg';

      // Should not be detected as data URL
      expect(isDataUrl(httpUrl)).toBe(false);

      // Should pass through unchanged
      expect(extractBase64FromDataUrl(httpUrl)).toBe(httpUrl);
    });
  });
});
