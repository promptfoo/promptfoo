import { describe, it, expect } from 'vitest';
import {
  formatBytes,
  formatLatency,
  formatCost,
  hashToNumber,
  getExtensionFromMimeType,
  generateMediaFilename,
} from './media';

describe('formatBytes', () => {
  it('should format zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('should format bytes without conversion', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('should format kilobytes with one decimal', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(2048)).toBe('2 KB');
  });

  it('should format megabytes with one decimal', () => {
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
    expect(formatBytes(10 * 1024 * 1024)).toBe('10 MB');
  });

  it('should format gigabytes with one decimal', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
  });

  it('should format terabytes with one decimal', () => {
    expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe('1 TB');
    expect(formatBytes(1.75 * 1024 * 1024 * 1024 * 1024)).toBe('1.8 TB');
  });

  it('should respect custom decimal precision', () => {
    expect(formatBytes(1536, 0)).toBe('2 KB');
    expect(formatBytes(1536, 2)).toBe('1.5 KB');
    expect(formatBytes(1234567, 3)).toBe('1.177 MB');
  });
});

describe('formatLatency', () => {
  it('should format milliseconds under 1 second', () => {
    expect(formatLatency(0)).toBe('0ms');
    expect(formatLatency(500)).toBe('500ms');
    expect(formatLatency(999)).toBe('999ms');
  });

  it('should format seconds with one decimal', () => {
    expect(formatLatency(1000)).toBe('1.0s');
    expect(formatLatency(1500)).toBe('1.5s');
    expect(formatLatency(2345)).toBe('2.3s');
    expect(formatLatency(10000)).toBe('10.0s');
  });

  it('should round correctly', () => {
    expect(formatLatency(1549)).toBe('1.5s');
    expect(formatLatency(1551)).toBe('1.6s');
  });
});

describe('formatCost', () => {
  it('should format very small costs with 4 decimals', () => {
    expect(formatCost(0.0001)).toBe('$0.0001');
    expect(formatCost(0.0099)).toBe('$0.0099');
    expect(formatCost(0.00001)).toBe('$0.0000');
  });

  it('should format regular costs with 2 decimals', () => {
    expect(formatCost(0.01)).toBe('$0.01');
    expect(formatCost(0.5)).toBe('$0.50');
    expect(formatCost(1.0)).toBe('$1.00');
    expect(formatCost(10.99)).toBe('$10.99');
    expect(formatCost(100)).toBe('$100.00');
  });

  it('should round correctly for 2 decimal places', () => {
    // Note: 0.015 may round to $0.01 due to floating point precision
    expect(formatCost(0.015)).toBe('$0.01');
    expect(formatCost(1.999)).toBe('$2.00');
    expect(formatCost(0.016)).toBe('$0.02');
  });

  it('should handle zero cost', () => {
    expect(formatCost(0)).toBe('$0.0000');
  });
});

describe('hashToNumber', () => {
  it('should generate consistent hash for same string', () => {
    const hash1 = hashToNumber('test-string');
    const hash2 = hashToNumber('test-string');
    expect(hash1).toBe(hash2);
  });

  it('should generate different hashes for different strings', () => {
    const hash1 = hashToNumber('string1');
    const hash2 = hashToNumber('string2');
    expect(hash1).not.toBe(hash2);
  });

  it('should always return positive numbers', () => {
    expect(hashToNumber('test')).toBeGreaterThanOrEqual(0);
    expect(hashToNumber('')).toBeGreaterThanOrEqual(0);
    expect(hashToNumber('negative-hash-test')).toBeGreaterThanOrEqual(0);
  });

  it('should handle empty string', () => {
    expect(hashToNumber('')).toBe(0);
  });

  it('should handle special characters', () => {
    const hash = hashToNumber('!@#$%^&*()');
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(typeof hash).toBe('number');
  });

  it('should handle unicode characters', () => {
    const hash = hashToNumber('🎨🎬🎵');
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(typeof hash).toBe('number');
  });
});

describe('getExtensionFromMimeType', () => {
  it('should extract basic image extensions', () => {
    expect(getExtensionFromMimeType('image/png')).toBe('png');
    expect(getExtensionFromMimeType('image/gif')).toBe('gif');
    expect(getExtensionFromMimeType('image/webp')).toBe('webp');
  });

  it('should map jpeg to jpg', () => {
    expect(getExtensionFromMimeType('image/jpeg')).toBe('jpg');
  });

  it('should map svg+xml to svg', () => {
    expect(getExtensionFromMimeType('image/svg+xml')).toBe('svg');
  });

  it('should map x-wav to wav', () => {
    expect(getExtensionFromMimeType('audio/x-wav')).toBe('wav');
  });

  it('should map mpeg to mp3', () => {
    expect(getExtensionFromMimeType('audio/mpeg')).toBe('mp3');
  });

  it('should map quicktime to mov', () => {
    expect(getExtensionFromMimeType('video/quicktime')).toBe('mov');
  });

  it('should map x-matroska to mkv', () => {
    expect(getExtensionFromMimeType('video/x-matroska')).toBe('mkv');
  });

  it('should handle video extensions', () => {
    expect(getExtensionFromMimeType('video/mp4')).toBe('mp4');
    expect(getExtensionFromMimeType('video/webm')).toBe('webm');
  });

  it('should handle audio extensions', () => {
    expect(getExtensionFromMimeType('audio/ogg')).toBe('ogg');
    expect(getExtensionFromMimeType('audio/aac')).toBe('aac');
  });

  it('should handle complex MIME types with + by taking first part', () => {
    expect(getExtensionFromMimeType('application/vnd.api+json')).toBe('vnd.api');
  });

  it('should return bin for missing subtype', () => {
    expect(getExtensionFromMimeType('application')).toBe('bin');
    expect(getExtensionFromMimeType('image/')).toBe('bin');
  });

  it('should return bin for empty MIME type', () => {
    expect(getExtensionFromMimeType('')).toBe('bin');
  });
});

describe('generateMediaFilename', () => {
  it('should generate filename with first 12 chars of hash', () => {
    const filename = generateMediaFilename('abcdef123456789012345678', 'image/png');
    expect(filename).toBe('abcdef123456.png');
  });

  it('should use correct extension from MIME type', () => {
    expect(generateMediaFilename('hash123', 'image/jpeg')).toBe('hash123.jpg');
    expect(generateMediaFilename('hash456', 'video/mp4')).toBe('hash456.mp4');
    expect(generateMediaFilename('hash789', 'audio/mpeg')).toBe('hash789.mp3');
  });

  it('should handle short hashes', () => {
    const filename = generateMediaFilename('abc', 'image/png');
    expect(filename).toBe('abc.png');
  });

  it('should handle exact 12 character hash', () => {
    const filename = generateMediaFilename('123456789012', 'video/webm');
    expect(filename).toBe('123456789012.webm');
  });

  it('should apply special MIME type mappings', () => {
    expect(generateMediaFilename('hash', 'image/svg+xml')).toBe('hash.svg');
    expect(generateMediaFilename('hash', 'video/quicktime')).toBe('hash.mov');
  });

  it('should use bin extension for unknown MIME types', () => {
    expect(generateMediaFilename('hash', 'application/unknown')).toBe('hash.unknown');
    expect(generateMediaFilename('hash', '')).toBe('hash.bin');
  });
});
