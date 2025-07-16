import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  getAssetsDirectory,
  getExtensionFromMimeType,
  getAssetType,
  saveBase64Asset,
  getAssetPath,
  deleteAsset,
  cleanupOldAssets,
} from '../../src/util/assetStorage';
import logger from '../../src/logger';
import * as configManage from '../../src/util/config/manage';

jest.mock('fs');
jest.mock('../../src/logger');
jest.mock('uuid');
jest.mock('../../src/util/config/manage');

describe('assetStorage', () => {
  const mockConfigPath = '/home/user/.promptfoo';
  const mockAssetsDir = '/home/user/.promptfoo/cache/assets';
  const mockUuid = '12345678-1234-1234-1234-123456789012';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(uuidv4).mockReturnValue(mockUuid as any);
    jest.mocked(configManage.getConfigDirectoryPath).mockReturnValue(mockConfigPath);
    jest.mocked(fs.existsSync).mockReturnValue(false);
    jest.mocked(fs.mkdirSync).mockImplementation(() => undefined);
    jest.mocked(fs.writeFileSync).mockImplementation(() => undefined);
  });

  describe('getAssetsDirectory', () => {
    it('should create assets directory if it does not exist', () => {
      const result = getAssetsDirectory();

      expect(result).toBe(mockAssetsDir);
      expect(fs.mkdirSync).toHaveBeenCalledWith(mockAssetsDir, { recursive: true });
      expect(logger.debug).toHaveBeenCalledWith(`Created assets directory: ${mockAssetsDir}`);
    });

    it('should not create directory if it already exists', () => {
      jest.mocked(fs.existsSync).mockReturnValue(true);

      const result = getAssetsDirectory();

      expect(result).toBe(mockAssetsDir);
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should use custom cache path from environment', () => {
      const customPath = '/custom/cache';
      jest.mocked(fs.existsSync).mockReturnValue(false);

      // Mock getEnvString by mocking the environment variable
      process.env.PROMPTFOO_CACHE_PATH = customPath;

      const result = getAssetsDirectory();

      expect(result).toBe(path.join(customPath, 'assets'));

      delete process.env.PROMPTFOO_CACHE_PATH;
    });
  });

  describe('getExtensionFromMimeType', () => {
    it('should return correct extensions for known MIME types', () => {
      expect(getExtensionFromMimeType('image/png')).toBe('.png');
      expect(getExtensionFromMimeType('image/jpeg')).toBe('.jpg');
      expect(getExtensionFromMimeType('image/jpg')).toBe('.jpg');
      expect(getExtensionFromMimeType('image/webp')).toBe('.webp');
      expect(getExtensionFromMimeType('image/gif')).toBe('.gif');
      expect(getExtensionFromMimeType('video/mp4')).toBe('.mp4');
      expect(getExtensionFromMimeType('audio/mpeg')).toBe('.mp3');
      expect(getExtensionFromMimeType('application/pdf')).toBe('.pdf');
    });

    it('should return .bin for unknown MIME types', () => {
      expect(getExtensionFromMimeType('application/unknown')).toBe('.bin');
      expect(getExtensionFromMimeType('foo/bar')).toBe('.bin');
    });
  });

  describe('getAssetType', () => {
    it('should correctly identify asset types', () => {
      expect(getAssetType('image/png')).toBe('image');
      expect(getAssetType('image/jpeg')).toBe('image');
      expect(getAssetType('video/mp4')).toBe('video');
      expect(getAssetType('audio/mpeg')).toBe('audio');
      expect(getAssetType('application/pdf')).toBe('document');
      expect(getAssetType('text/plain')).toBe('document');
      expect(getAssetType('application/octet-stream')).toBe('other');
    });
  });

  describe('saveBase64Asset', () => {
    const base64Data =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const base64WithPrefix = `data:image/png;base64,${base64Data}`;

    it('should save base64 data as a file', () => {
      const result = saveBase64Asset(base64Data, 'image/png', 'test-image.png');

      expect(result).toEqual({
        id: mockUuid,
        path: `${mockAssetsDir}/${mockUuid}.png`,
        url: `/assets/${mockUuid}.png`,
        mimeType: 'image/png',
        originalName: 'test-image.png',
        createdAt: expect.any(Date),
        type: 'image',
      });

      expect(fs.writeFileSync).toHaveBeenCalledWith(
        `${mockAssetsDir}/${mockUuid}.png`,
        expect.any(Buffer),
      );

      const savedBuffer = (fs.writeFileSync as jest.Mock).mock.calls[0][1];
      expect(savedBuffer.toString('base64')).toBe(base64Data);
    });

    it('should handle base64 data with data URL prefix', () => {
      saveBase64Asset(base64WithPrefix, 'image/png');

      const savedBuffer = (fs.writeFileSync as jest.Mock).mock.calls[0][1];
      expect(savedBuffer.toString('base64')).toBe(base64Data);
    });

    it('should use default MIME type if not provided', () => {
      const result = saveBase64Asset(base64Data);

      expect(result.mimeType).toBe('image/png');
      expect(result.url).toContain('.png');
    });
  });

  describe('getAssetPath', () => {
    it('should return full path if asset exists', () => {
      const filename = 'test-asset.png';
      jest.mocked(fs.existsSync).mockReturnValue(true);

      const result = getAssetPath(filename);

      expect(result).toBe(`${mockAssetsDir}/${filename}`);
      expect(fs.existsSync).toHaveBeenCalledWith(`${mockAssetsDir}/${filename}`);
    });

    it('should return null if asset does not exist', () => {
      const filename = 'non-existent.png';
      jest.mocked(fs.existsSync).mockReturnValue(false);

      const result = getAssetPath(filename);

      expect(result).toBeNull();
    });
  });

  describe('deleteAsset', () => {
    it('should delete existing asset', () => {
      const filename = 'test-asset.png';
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest.mocked(fs.unlinkSync).mockImplementation(() => undefined);

      const result = deleteAsset(filename);

      expect(result).toBe(true);
      expect(fs.unlinkSync).toHaveBeenCalledWith(`${mockAssetsDir}/${filename}`);
      expect(logger.debug).toHaveBeenCalledWith(`Deleted asset: ${mockAssetsDir}/${filename}`);
    });

    it('should return false if asset does not exist', () => {
      const filename = 'non-existent.png';
      jest.mocked(fs.existsSync).mockReturnValue(false);

      const result = deleteAsset(filename);

      expect(result).toBe(false);
      expect(fs.unlinkSync).not.toHaveBeenCalled();
    });

    it('should handle deletion errors', () => {
      const filename = 'test-asset.png';
      const error = new Error('Permission denied');
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest.mocked(fs.unlinkSync).mockImplementation(() => {
        throw error;
      });

      const result = deleteAsset(filename);

      expect(result).toBe(false);
      expect(logger.error).toHaveBeenCalledWith(
        `Failed to delete asset: ${mockAssetsDir}/${filename}: ${error}`,
      );
    });
  });

  describe('cleanupOldAssets', () => {
    const mockFiles = ['old-file.png', 'new-file.png', 'very-old-file.jpg'];
    const now = Date.now();
    const hourInMs = 60 * 60 * 1000;

    beforeEach(() => {
      jest.mocked(fs.readdirSync).mockReturnValue(mockFiles as any);
      jest.spyOn(Date, 'now').mockReturnValue(now);
    });

    it('should delete files older than maxAge', () => {
      jest.mocked(fs.statSync).mockImplementation((filePath) => {
        const pathStr = String(filePath);
        if (pathStr.includes('old-file')) {
          return { mtimeMs: now - 2 * hourInMs } as any; // 2 hours old
        } else if (pathStr.includes('very-old-file')) {
          return { mtimeMs: now - 25 * hourInMs } as any; // 25 hours old
        }
        return { mtimeMs: now - 0.5 * hourInMs } as any; // 30 minutes old
      });

      jest.mocked(fs.unlinkSync).mockImplementation(() => undefined);

      const result = cleanupOldAssets(hourInMs); // Delete files older than 1 hour

      expect(result).toBe(2);
      expect(fs.unlinkSync).toHaveBeenCalledTimes(2);
      expect(fs.unlinkSync).toHaveBeenCalledWith(`${mockAssetsDir}/old-file.png`);
      expect(fs.unlinkSync).toHaveBeenCalledWith(`${mockAssetsDir}/very-old-file.jpg`);
      expect(logger.info).toHaveBeenCalledWith('Cleaned up 2 old assets');
    });

    it('should handle errors during cleanup', () => {
      jest.mocked(fs.statSync).mockImplementation(() => {
        throw new Error('Stat error');
      });

      const result = cleanupOldAssets(hourInMs);

      expect(result).toBe(0);
      expect(logger.error).toHaveBeenCalledTimes(mockFiles.length);
    });

    it('should not log info message if no files were deleted', () => {
      jest.mocked(fs.statSync).mockReturnValue({ mtimeMs: now } as any);

      const result = cleanupOldAssets(hourInMs);

      expect(result).toBe(0);
      expect(logger.info).not.toHaveBeenCalled();
    });
  });
});
