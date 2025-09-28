import { describe, it, expect } from 'vitest';
import { isValidUrl } from './urlValidation';

describe('isValidUrl', () => {
  it('should return true for valid http URLs', () => {
    expect(isValidUrl('http://example.com')).toBe(true);
    expect(isValidUrl('http://www.example.com/path')).toBe(true);
  });

  it('should return true for valid https URLs', () => {
    expect(isValidUrl('https://example.com')).toBe(true);
    expect(isValidUrl('https://www.example.com/path')).toBe(true);
  });

  it('should return false for invalid URLs', () => {
    expect(isValidUrl('not-a-url')).toBe(false);
    expect(isValidUrl('just text')).toBe(false);
    expect(isValidUrl('')).toBe(false);
  });

  it('should return false for dangerous protocols for security', () => {
    expect(isValidUrl('javascript:alert("xss")')).toBe(false);
    expect(isValidUrl('data:text/html,<script>alert("xss")</script>')).toBe(false);
    expect(isValidUrl('vbscript:msgbox("xss")')).toBe(false);
    expect(isValidUrl('file:///etc/passwd')).toBe(false);
  });

  it('should return false for protocol-less URLs', () => {
    expect(isValidUrl('example.com')).toBe(false);
    expect(isValidUrl('www.example.com')).toBe(false);
  });

  it('should handle URLs with special characters', () => {
    expect(isValidUrl('https://example.com/path with spaces?query=value')).toBe(true);
    expect(isValidUrl('https://example.com/path?query=value&other=test')).toBe(true);
  });
});
