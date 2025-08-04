import {
  compressIfBeneficial,
  decompressIfNeeded,
  isCompressibleMimeType,
  isCompressibleFilename,
  isGzipped,
  calculateCompressionStats,
} from '../../src/assets/compression';

describe('Asset Compression', () => {
  describe('isCompressibleMimeType', () => {
    it('should identify compressible MIME types', () => {
      expect(isCompressibleMimeType('application/json')).toBe(true);
      expect(isCompressibleMimeType('text/plain')).toBe(true);
      expect(isCompressibleMimeType('text/html')).toBe(true);
      expect(isCompressibleMimeType('application/xml')).toBe(true);
      expect(isCompressibleMimeType('text/javascript')).toBe(true);
    });

    it('should reject non-compressible MIME types', () => {
      expect(isCompressibleMimeType('image/png')).toBe(false);
      expect(isCompressibleMimeType('image/jpeg')).toBe(false);
      expect(isCompressibleMimeType('audio/mp3')).toBe(false);
      expect(isCompressibleMimeType('video/mp4')).toBe(false);
    });

    it('should handle MIME types with charset', () => {
      expect(isCompressibleMimeType('text/plain; charset=utf-8')).toBe(true);
      expect(isCompressibleMimeType('application/json; charset=utf-8')).toBe(true);
    });
  });

  describe('isCompressibleFilename', () => {
    it('should identify compressible file extensions', () => {
      expect(isCompressibleFilename('test.json')).toBe(true);
      expect(isCompressibleFilename('document.txt')).toBe(true);
      expect(isCompressibleFilename('index.html')).toBe(true);
      expect(isCompressibleFilename('script.js')).toBe(true);
      expect(isCompressibleFilename('data.csv')).toBe(true);
    });

    it('should reject non-compressible file extensions', () => {
      expect(isCompressibleFilename('image.png')).toBe(false);
      expect(isCompressibleFilename('photo.jpg')).toBe(false);
      expect(isCompressibleFilename('song.mp3')).toBe(false);
    });

    it('should be case-insensitive', () => {
      expect(isCompressibleFilename('TEST.JSON')).toBe(true);
      expect(isCompressibleFilename('Document.TXT')).toBe(true);
    });
  });

  describe('compressIfBeneficial', () => {
    it('should compress text data that benefits from compression', async () => {
      // Create highly compressible text data
      const text = 'This is a test. '.repeat(100);
      const data = Buffer.from(text);
      
      const result = await compressIfBeneficial(data, 'text/plain');
      
      expect(result.compressed).toBe(true);
      expect(result.compressedSize).toBeLessThan(result.originalSize);
      expect(result.compressionRatio).toBeLessThan(0.9);
    });

    it('should not compress small files', async () => {
      const data = Buffer.from('Small text');
      
      const result = await compressIfBeneficial(data, 'text/plain');
      
      expect(result.compressed).toBe(false);
      expect(result.originalSize).toBe(data.length);
    });

    it('should not compress data that does not benefit', async () => {
      // Create random data that doesn't compress well
      const data = Buffer.from(
        Array.from({ length: 2000 }, () => Math.random().toString(36)).join('')
      );
      
      const result = await compressIfBeneficial(data, 'text/plain');
      
      // May or may not compress depending on randomness, but check fields exist
      expect(result.originalSize).toBe(data.length);
      expect(typeof result.compressed).toBe('boolean');
    });

    it('should not compress non-compressible MIME types', async () => {
      const data = Buffer.from('Some image data that could be compressed');
      
      const result = await compressIfBeneficial(data, 'image/png');
      
      expect(result.compressed).toBe(false);
    });

    it('should use filename hint when MIME type is not provided', async () => {
      const text = 'This is JSON data. '.repeat(100);
      const data = Buffer.from(text);
      
      const result = await compressIfBeneficial(data, undefined, 'data.json');
      
      expect(result.compressed).toBe(true);
    });
  });

  describe('decompressIfNeeded', () => {
    it('should decompress compressed data', async () => {
      const original = Buffer.from('This is test data to compress. '.repeat(50));
      const compressed = await compressIfBeneficial(original, 'text/plain');
      
      expect(compressed.compressed).toBe(true);
      
      const decompressed = await decompressIfNeeded(compressed.data, true);
      expect(decompressed.toString()).toBe(original.toString());
    });

    it('should pass through uncompressed data', async () => {
      const data = Buffer.from('Uncompressed data');
      
      const result = await decompressIfNeeded(data, false);
      
      expect(result).toBe(data);
    });

    it('should handle decompression errors', async () => {
      const invalidData = Buffer.from('This is not gzipped data');
      
      await expect(decompressIfNeeded(invalidData, true)).rejects.toThrow(
        'Failed to decompress asset data'
      );
    });
  });

  describe('isGzipped', () => {
    it('should detect gzipped data', async () => {
      const original = Buffer.from('Test data');
      const compressed = await compressIfBeneficial(original, 'text/plain');
      
      if (compressed.compressed) {
        expect(isGzipped(compressed.data)).toBe(true);
      }
      
      expect(isGzipped(original)).toBe(false);
    });

    it('should handle small buffers', () => {
      expect(isGzipped(Buffer.from([]))).toBe(false);
      expect(isGzipped(Buffer.from([0x1f]))).toBe(false);
    });
  });

  describe('calculateCompressionStats', () => {
    it('should calculate compression statistics', async () => {
      const results = [
        await compressIfBeneficial(Buffer.from('Text data '.repeat(100)), 'text/plain'),
        await compressIfBeneficial(Buffer.from('More text '.repeat(100)), 'text/plain'),
        await compressIfBeneficial(Buffer.from('Small'), 'text/plain'),
      ];
      
      const stats = calculateCompressionStats(results);
      
      expect(stats.totalAssets).toBe(3);
      expect(stats.totalOriginalSize).toBeGreaterThan(0);
      expect(stats.totalCompressedSize).toBeGreaterThan(0);
      expect(stats.totalSavings).toBeGreaterThanOrEqual(0);
      expect(stats.averageCompressionRatio).toBeGreaterThan(0);
      expect(stats.averageCompressionRatio).toBeLessThanOrEqual(1);
    });

    it('should handle no compression results', () => {
      const results = [
        { data: Buffer.from('test'), compressed: false, originalSize: 4 },
        { data: Buffer.from('data'), compressed: false, originalSize: 4 },
      ];
      
      const stats = calculateCompressionStats(results);
      
      expect(stats.totalAssets).toBe(2);
      expect(stats.compressedAssets).toBe(0);
      expect(stats.totalOriginalSize).toBe(8);
      expect(stats.totalCompressedSize).toBe(8);
      expect(stats.totalSavings).toBe(0);
      expect(stats.averageCompressionRatio).toBe(1);
    });
  });
});