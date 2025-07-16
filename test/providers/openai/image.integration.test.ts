import fs from 'fs';
import path from 'path';
import { OpenAiImageProvider } from '../../../src/providers/openai/image';
import { getAssetsDirectory } from '../../../src/util/assetStorage';
import { fetchWithCache } from '../../../src/cache';

jest.mock('../../../src/cache');

describe('OpenAI Image Provider - Asset Storage Integration', () => {
  const mockBase64Response = {
    data: {
      created: 1234567890,
      data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' }],
    },
    cached: false,
    status: 200,
    statusText: 'OK',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Clean up any existing test assets
    const assetsDir = getAssetsDirectory();
    if (fs.existsSync(assetsDir)) {
      const files = fs.readdirSync(assetsDir);
      files.forEach(file => {
        if (file.endsWith('.png')) {
          try {
            fs.unlinkSync(path.join(assetsDir, file));
          } catch (error) {
            // Ignore errors
          }
        }
      });
    }
  });

  it('should save base64 images to assets directory and return server URLs', async () => {
    const provider = new OpenAiImageProvider('gpt-image-1', {
      config: { apiKey: 'test-key' },
    });

    jest.mocked(fetchWithCache).mockResolvedValue(mockBase64Response);

    const result = await provider.callApi('Generate a test image');

    // Check the result contains an asset URL
    expect(result.output).toMatch(/^!\[Generate a test image\]\(\/assets\/[a-f0-9-]+\.png\)$/);
    
    // Extract the filename from the markdown
    const match = (result.output as string).match(/\/assets\/([a-f0-9-]+\.png)/);
    expect(match).toBeTruthy();
    
    if (match) {
      const filename = match[1];
      const assetPath = path.join(getAssetsDirectory(), filename);
      
      // Verify the file was created
      expect(fs.existsSync(assetPath)).toBe(true);
      
      // Verify the file contains valid image data
      const fileContent = fs.readFileSync(assetPath);
      expect(fileContent.length).toBeGreaterThan(0);
      
      // PNG files start with specific bytes
      expect(fileContent[0]).toBe(0x89);
      expect(fileContent[1]).toBe(0x50); // 'P'
      expect(fileContent[2]).toBe(0x4E); // 'N'
      expect(fileContent[3]).toBe(0x47); // 'G'
    }
  });

  it('should handle multiple image formats correctly', async () => {
    const provider = new OpenAiImageProvider('gpt-image-1', {
      config: { 
        apiKey: 'test-key',
        output_format: 'webp'
      },
    });

    jest.mocked(fetchWithCache).mockResolvedValue({
      data: {
        created: 1234567890,
        b64_json: 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=',
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const result = await provider.callApi('Generate a webp image');

    // Check the result contains a webp asset URL
    expect(result.output).toMatch(/^!\[Generate a webp image\]\(\/assets\/[a-f0-9-]+\.webp\)$/);
    
    // Extract and verify the webp file
    const match = (result.output as string).match(/\/assets\/([a-f0-9-]+\.webp)/);
    if (match) {
      const filename = match[1];
      const assetPath = path.join(getAssetsDirectory(), filename);
      
      expect(fs.existsSync(assetPath)).toBe(true);
      
      // WEBP files start with 'RIFF' header
      const fileContent = fs.readFileSync(assetPath);
      const header = fileContent.slice(0, 4).toString('ascii');
      expect(header).toBe('RIFF');
    }
  });
}); 