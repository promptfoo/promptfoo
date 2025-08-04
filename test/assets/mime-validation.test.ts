import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { AssetStore } from '../../src/assets';

jest.mock('../../src/envars', () => ({
  getEnvBool: jest.fn((key: string, defaultValue: boolean) => {
    if (key === 'PROMPTFOO_USE_ASSET_STORAGE') return true;
    if (key === 'PROMPTFOO_ASSET_DEDUPLICATION') return false;
    return defaultValue;
  }),
  getEnvInt: jest.fn((key, defaultValue) => defaultValue),
}));

jest.mock('../../src/util/config/manage', () => ({
  getConfigDirectoryPath: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
  __esModule: true,
  default: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('Asset Store MIME Type Validation', () => {
  let tempDir: string;
  let assetStore: AssetStore;
  
  const mockGetConfigDirectoryPath = jest.requireMock(
    '../../src/util/config/manage',
  ).getConfigDirectoryPath;
  const mockLogger = jest.requireMock('../../src/logger').default;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-mime-test-'));
    mockGetConfigDirectoryPath.mockReturnValue(tempDir);
    assetStore = new AssetStore({ baseDir: path.join(tempDir, 'assets') });
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Valid MIME types', () => {
    it('should accept valid image MIME types', async () => {
      const imageData = Buffer.from('fake image data');
      const validImageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
      
      for (const mimeType of validImageTypes) {
        const result = await assetStore.save(
          imageData,
          'image',
          mimeType,
          'eval-123',
          'result-456'
        );
        expect(result.mimeType).toBe(mimeType);
      }
    });

    it('should accept valid audio MIME types', async () => {
      const audioData = Buffer.from('fake audio data');
      const validAudioTypes = ['audio/wav', 'audio/mpeg', 'audio/ogg', 'audio/flac'];
      
      for (const mimeType of validAudioTypes) {
        const result = await assetStore.save(
          audioData,
          'audio',
          mimeType,
          'eval-789',
          `result-${mimeType.replace('/', '-')}`
        );
        expect(result.mimeType).toBe(mimeType);
      }
    });

    it('should normalize MIME type case', async () => {
      const imageData = Buffer.from('fake image data');
      
      const result = await assetStore.save(
        imageData,
        'image',
        'IMAGE/PNG',
        'eval-case',
        'result-case'
      );
      
      expect(result.mimeType).toBe('image/png');
    });

    it('should strip MIME type parameters', async () => {
      const imageData = Buffer.from('fake svg data');
      
      const result = await assetStore.save(
        imageData,
        'image',
        'image/svg+xml; charset=utf-8',
        'eval-params',
        'result-params'
      );
      
      expect(result.mimeType).toBe('image/svg+xml');
    });
  });

  describe('Invalid MIME types', () => {
    it('should reject image types when saving as audio', async () => {
      const data = Buffer.from('fake data');
      
      await expect(
        assetStore.save(data, 'audio', 'image/png', 'eval-1', 'result-1')
      ).rejects.toThrow('Invalid audio MIME type: image/png');
    });

    it('should reject audio types when saving as image', async () => {
      const data = Buffer.from('fake data');
      
      await expect(
        assetStore.save(data, 'image', 'audio/wav', 'eval-2', 'result-2')
      ).rejects.toThrow('Invalid image MIME type: audio/wav');
    });

    it('should reject completely invalid MIME types', async () => {
      const data = Buffer.from('fake data');
      
      await expect(
        assetStore.save(data, 'image', 'text/plain', 'eval-3', 'result-3')
      ).rejects.toThrow('Invalid image MIME type: text/plain');
      
      await expect(
        assetStore.save(data, 'image', 'application/pdf', 'eval-4', 'result-4')
      ).rejects.toThrow('Invalid image MIME type: application/pdf');
      
      await expect(
        assetStore.save(data, 'audio', 'video/mp4', 'eval-5', 'result-5')
      ).rejects.toThrow('Invalid audio MIME type: video/mp4');
    });

    it('should reject empty MIME type', async () => {
      const data = Buffer.from('fake data');
      
      await expect(
        assetStore.save(data, 'image', '', 'eval-6', 'result-6')
      ).rejects.toThrow('MIME type is required');
    });
  });

  describe('MIME type detection', () => {
    it('should warn on MIME type mismatch for PNG', async () => {
      // Real PNG header
      const pngData = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52
      ]);
      
      await assetStore.save(
        pngData,
        'image',
        'image/jpeg', // Wrong MIME type
        'eval-detect',
        'result-detect'
      );
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'MIME type mismatch: declared image/jpeg, detected image/png'
      );
    });

    it('should warn on MIME type mismatch for JPEG', async () => {
      // Real JPEG header
      const jpegData = Buffer.from([
        0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46,
        0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01
      ]);
      
      await assetStore.save(
        jpegData,
        'image',
        'image/png', // Wrong MIME type
        'eval-jpeg',
        'result-jpeg'
      );
      
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'MIME type mismatch: declared image/png, detected image/jpeg'
      );
    });

    it('should not warn when MIME type matches detected type', async () => {
      // Real PNG header
      const pngData = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52
      ]);
      
      await assetStore.save(
        pngData,
        'image',
        'image/png', // Correct MIME type
        'eval-correct',
        'result-correct'
      );
      
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });

    it('should not warn when detection fails', async () => {
      // Unknown data format
      const unknownData = Buffer.from('unknown format data');
      
      await assetStore.save(
        unknownData,
        'image',
        'image/png',
        'eval-unknown',
        'result-unknown'
      );
      
      expect(mockLogger.warn).not.toHaveBeenCalled();
    });
  });
});