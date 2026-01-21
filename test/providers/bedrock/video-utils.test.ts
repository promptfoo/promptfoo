import * as fs from 'fs';
import * as path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detectImageFormat,
  getImageMimeType,
  loadImageData,
} from '../../../src/providers/bedrock/video-utils';

// Mock fs module
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return {
    ...actual,
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };
});

describe('video-utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('loadImageData', () => {
    it('should load image from file:// path', () => {
      const mockImageData = Buffer.from('fake image data');
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(mockImageData);

      const result = loadImageData('file:///path/to/image.png');

      expect(result.data).toBe(mockImageData.toString('base64'));
      expect(result.error).toBeUndefined();
    });

    it('should return base64 data as-is', () => {
      const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk';

      const result = loadImageData(base64Data);

      expect(result.data).toBe(base64Data);
      expect(result.error).toBeUndefined();
    });

    it('should return error when file with path traversal does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = loadImageData('file://../../../etc/passwd');

      // Path traversal attempts that resolve to non-existent files return file not found error
      expect(result.error).toContain('Image file not found');
      expect(result.data).toBeUndefined();
    });

    it('should return error when file does not exist', () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const result = loadImageData('file:///nonexistent/image.png');

      expect(result.error).toContain('Image file not found');
      expect(result.data).toBeUndefined();
    });
  });

  describe('detectImageFormat', () => {
    it('should detect PNG from file extension', () => {
      expect(detectImageFormat('/path/to/image.png')).toBe('png');
      expect(detectImageFormat('/path/to/IMAGE.PNG')).toBe('png');
    });

    it('should detect PNG from base64 magic bytes', () => {
      // PNG base64 starts with 'iVBORw'
      expect(detectImageFormat('iVBORw0KGgoAAAANSUhEUg')).toBe('png');
    });

    it('should default to JPEG for unknown formats', () => {
      expect(detectImageFormat('/path/to/image.jpg')).toBe('jpeg');
      expect(detectImageFormat('/path/to/image.jpeg')).toBe('jpeg');
      expect(detectImageFormat('/path/to/image.bmp')).toBe('jpeg');
      expect(detectImageFormat('randomBase64Data')).toBe('jpeg');
    });
  });

  describe('getImageMimeType', () => {
    it('should return image/png for png format', () => {
      expect(getImageMimeType('png')).toBe('image/png');
    });

    it('should return image/jpeg for jpeg format', () => {
      expect(getImageMimeType('jpeg')).toBe('image/jpeg');
    });
  });
});
