import express from 'express';
import request from 'supertest';
import { assetsRouter } from '../../../src/server/routes/assets';
import * as assetStorage from '../../../src/util/assetStorage';
import logger from '../../../src/logger';

jest.mock('../../../src/util/assetStorage');
jest.mock('../../../src/logger');

describe('assetsRouter', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    
    // Mock sendFile at the application level
    app.use('/assets', (req, res, next) => {
      const originalSendFile = res.sendFile;
      res.sendFile = jest.fn((path, callback) => {
        if (callback && typeof callback === 'function') {
          // Let the test control whether to call the callback
          (res as any).sendFileCallback = callback;
        }
        res.status(200).end();
      }) as any;
      next();
    });
    
    app.use('/assets', assetsRouter);
    jest.clearAllMocks();
  });

  describe('GET /assets/:filename', () => {
    it('should serve existing asset file', async () => {
      const mockAssetPath = '/path/to/assets/test-image.png';
      jest.mocked(assetStorage.getAssetPath).mockReturnValue(mockAssetPath);

      const response = await request(app)
        .get('/assets/test-image.png')
        .expect(200);

      expect(assetStorage.getAssetPath).toHaveBeenCalledWith('test-image.png');
      expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should return 404 for non-existent asset', async () => {
      jest.mocked(assetStorage.getAssetPath).mockReturnValue(null);

      const response = await request(app)
        .get('/assets/non-existent.png')
        .expect(404);

      expect(response.text).toBe('Asset not found');
      expect(logger.debug).toHaveBeenCalledWith('Asset not found: non-existent.png');
    });

    it('should reject invalid filenames', async () => {
      const invalidFilenames = [
        'file with spaces.png',
        'file;command.png',
        'file|pipe.png',
        'file&command.png',
      ];

      for (const filename of invalidFilenames) {
        const response = await request(app)
          .get(`/assets/${encodeURIComponent(filename)}`)
          .expect(400);

        expect(response.text).toBe('Invalid filename');
        expect(logger.warn).toHaveBeenCalledWith(`Invalid asset filename requested: ${filename}`);
      }
      
      // Clear mocks between iterations
      jest.clearAllMocks();
    });

    it('should allow valid filenames', async () => {
      const validFilenames = [
        'image.png',
        'file-with-dashes.jpg',
        'file_with_underscores.webp',
        'file.with.dots.pdf',
        '12345678-1234-1234-1234-123456789012.png',
      ];

      jest.mocked(assetStorage.getAssetPath).mockReturnValue('/path/to/asset');

      for (const filename of validFilenames) {
        await request(app)
          .get(`/assets/${filename}`)
          .expect(200);

        expect(assetStorage.getAssetPath).toHaveBeenCalledWith(filename);
      }
    });

    it('should handle file send errors', async () => {
      const mockAssetPath = '/path/to/assets/test-image.png';
      jest.mocked(assetStorage.getAssetPath).mockReturnValue(mockAssetPath);

      // Override the sendFile mock for this test to trigger error
      app = express();
      app.use('/assets', (req, res, next) => {
        res.sendFile = jest.fn((path, callback) => {
          if (callback && typeof callback === 'function') {
            callback(new Error('File system error'));
          }
        }) as any;
        next();
      });
      app.use('/assets', assetsRouter);

      await request(app)
        .get('/assets/test-image.png')
        .expect(500);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error sending asset test-image.png')
      );
    });
  });
}); 