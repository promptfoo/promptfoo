import {
  validateMimeType,
  getExtensionFromMimeType,
  detectMimeType,
  ALLOWED_IMAGE_MIME_TYPES,
  ALLOWED_AUDIO_MIME_TYPES,
} from '../../src/util/mimeTypes';

describe('MIME Type Validation', () => {
  describe('validateMimeType', () => {
    describe('image types', () => {
      it('should validate common image MIME types', () => {
        const validTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
        
        for (const mimeType of validTypes) {
          const result = validateMimeType(mimeType, 'image');
          expect(result.valid).toBe(true);
          expect(result.normalized).toBe(mimeType);
        }
      });

      it('should normalize MIME type case', () => {
        const result = validateMimeType('IMAGE/PNG', 'image');
        expect(result.valid).toBe(true);
        expect(result.normalized).toBe('image/png');
      });

      it('should strip charset and parameters', () => {
        const result = validateMimeType('image/svg+xml; charset=utf-8', 'image');
        expect(result.valid).toBe(true);
        expect(result.normalized).toBe('image/svg+xml');
      });

      it('should reject invalid image MIME types', () => {
        const invalidTypes = ['text/plain', 'audio/mp3', 'video/mp4', 'application/pdf'];
        
        for (const mimeType of invalidTypes) {
          const result = validateMimeType(mimeType, 'image');
          expect(result.valid).toBe(false);
          expect(result.error).toContain('Invalid image MIME type');
        }
      });
    });

    describe('audio types', () => {
      it('should validate common audio MIME types', () => {
        const validTypes = ['audio/wav', 'audio/mpeg', 'audio/ogg', 'audio/flac'];
        
        for (const mimeType of validTypes) {
          const result = validateMimeType(mimeType, 'audio');
          expect(result.valid).toBe(true);
          expect(result.normalized).toBe(mimeType);
        }
      });

      it('should handle multiple WAV MIME type variants', () => {
        const wavTypes = ['audio/wav', 'audio/wave', 'audio/x-wav'];
        
        for (const mimeType of wavTypes) {
          const result = validateMimeType(mimeType, 'audio');
          expect(result.valid).toBe(true);
          expect(result.normalized).toBe(mimeType);
        }
      });

      it('should reject invalid audio MIME types', () => {
        const invalidTypes = ['image/png', 'text/plain', 'video/mp4'];
        
        for (const mimeType of invalidTypes) {
          const result = validateMimeType(mimeType, 'audio');
          expect(result.valid).toBe(false);
          expect(result.error).toContain('Invalid audio MIME type');
        }
      });
    });

    describe('edge cases', () => {
      it('should handle empty or invalid input', () => {
        expect(validateMimeType('', 'image').valid).toBe(false);
        expect(validateMimeType('', 'image').error).toContain('MIME type is required');
        
        // @ts-expect-error - testing invalid input
        expect(validateMimeType(null, 'image').valid).toBe(false);
        // @ts-expect-error - testing invalid input
        expect(validateMimeType(undefined, 'image').valid).toBe(false);
        // @ts-expect-error - testing invalid input
        expect(validateMimeType(123, 'image').valid).toBe(false);
      });

      it('should trim whitespace', () => {
        const result = validateMimeType('  image/png  ', 'image');
        expect(result.valid).toBe(true);
        expect(result.normalized).toBe('image/png');
      });
    });
  });

  describe('getExtensionFromMimeType', () => {
    it('should return correct extensions for image types', () => {
      expect(getExtensionFromMimeType('image/png')).toBe('.png');
      expect(getExtensionFromMimeType('image/jpeg')).toBe('.jpg');
      expect(getExtensionFromMimeType('image/gif')).toBe('.gif');
      expect(getExtensionFromMimeType('image/webp')).toBe('.webp');
      expect(getExtensionFromMimeType('image/svg+xml')).toBe('.svg');
    });

    it('should return correct extensions for audio types', () => {
      expect(getExtensionFromMimeType('audio/wav')).toBe('.wav');
      expect(getExtensionFromMimeType('audio/mpeg')).toBe('.mp3');
      expect(getExtensionFromMimeType('audio/ogg')).toBe('.ogg');
      expect(getExtensionFromMimeType('audio/flac')).toBe('.flac');
    });

    it('should handle case insensitive input', () => {
      expect(getExtensionFromMimeType('IMAGE/PNG')).toBe('.png');
      expect(getExtensionFromMimeType('AUDIO/WAV')).toBe('.wav');
    });

    it('should return empty string for unknown types', () => {
      expect(getExtensionFromMimeType('text/plain')).toBe('');
      expect(getExtensionFromMimeType('invalid/type')).toBe('');
    });
  });

  describe('detectMimeType', () => {
    it('should detect PNG files', () => {
      const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      expect(detectMimeType(pngHeader)).toBe('image/png');
    });

    it('should detect JPEG files', () => {
      const jpegHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
      expect(detectMimeType(jpegHeader)).toBe('image/jpeg');
    });

    it('should detect GIF files', () => {
      const gifHeader = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
      expect(detectMimeType(gifHeader)).toBe('image/gif');
    });

    it('should detect WAV files', () => {
      const wavHeader = Buffer.from([
        0x52, 0x49, 0x46, 0x46, // RIFF
        0x00, 0x00, 0x00, 0x00, // size
        0x57, 0x41, 0x56, 0x45, // WAVE
      ]);
      expect(detectMimeType(wavHeader)).toBe('audio/wav');
    });

    it('should detect MP3 files', () => {
      // ID3v2 header
      const id3Header = Buffer.from([0x49, 0x44, 0x33, 0x04]);
      expect(detectMimeType(id3Header)).toBe('audio/mpeg');
      
      // MPEG frame sync
      const mpegHeader = Buffer.from([0xFF, 0xFB, 0x90, 0x00]);
      expect(detectMimeType(mpegHeader)).toBe('audio/mpeg');
    });

    it('should return null for unknown formats', () => {
      const unknownData = Buffer.from([0x00, 0x01, 0x02, 0x03]);
      expect(detectMimeType(unknownData)).toBe(null);
    });

    it('should handle small buffers', () => {
      expect(detectMimeType(Buffer.from([]))).toBe(null);
      expect(detectMimeType(Buffer.from([0x89]))).toBe(null);
      expect(detectMimeType(Buffer.from([0x89, 0x50]))).toBe(null);
    });
  });

  describe('Constants', () => {
    it('should have expected image MIME types', () => {
      expect(ALLOWED_IMAGE_MIME_TYPES.has('image/png')).toBe(true);
      expect(ALLOWED_IMAGE_MIME_TYPES.has('image/jpeg')).toBe(true);
      expect(ALLOWED_IMAGE_MIME_TYPES.has('image/gif')).toBe(true);
      expect(ALLOWED_IMAGE_MIME_TYPES.has('image/webp')).toBe(true);
    });

    it('should have expected audio MIME types', () => {
      expect(ALLOWED_AUDIO_MIME_TYPES.has('audio/wav')).toBe(true);
      expect(ALLOWED_AUDIO_MIME_TYPES.has('audio/mpeg')).toBe(true);
      expect(ALLOWED_AUDIO_MIME_TYPES.has('audio/ogg')).toBe(true);
      expect(ALLOWED_AUDIO_MIME_TYPES.has('audio/flac')).toBe(true);
    });
  });
});