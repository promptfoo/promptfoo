import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { OpenAiImageProvider } from '../../src/providers/openai/image';
import { GoogleImageProvider } from '../../src/providers/google/image';
import { HyperbolicImageProvider } from '../../src/providers/hyperbolic/image';
import { HyperbolicAudioProvider } from '../../src/providers/hyperbolic/audio';
import { fetchWithCache } from '../../src/cache';
import type { CallApiContextParams } from '../../src/types';

// Mock dependencies
jest.mock('../../src/cache');
jest.mock('../../src/envars', () => ({
  getEnvBool: jest.fn((key: string, defaultValue: boolean) => {
    if (key === 'PROMPTFOO_USE_ASSET_STORAGE') return true;
    if (key === 'PROMPTFOO_ASSET_DEDUPLICATION') return true;
    return defaultValue;
  }),
  getEnvInt: jest.fn((key, defaultValue) => defaultValue),
  getEnvString: jest.fn((key: string) => {
    if (key === 'OPENAI_API_KEY') return 'test-openai-key';
    if (key === 'GOOGLE_API_KEY') return 'test-google-key';
    if (key === 'HYPERBOLIC_API_KEY') return 'test-hyperbolic-key';
    return undefined;
  }),
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

const mockFetchWithCache = fetchWithCache as jest.MockedFunction<typeof fetchWithCache>;

describe('Provider Asset Storage Integration', () => {
  let tempDir: string;
  const mockGetConfigDirectoryPath = jest.requireMock(
    '../../src/util/config/manage',
  ).getConfigDirectoryPath;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-provider-test-'));
    mockGetConfigDirectoryPath.mockReturnValue(tempDir);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const createMockContext = (): CallApiContextParams => ({
    vars: {
      __evalId: 'eval-' + generateUUID(),
      __resultId: 'result-' + generateUUID(),
    },
  });

  describe('OpenAI Image Provider', () => {
    it('should save base64 images to asset storage', async () => {
      const provider = new OpenAiImageProvider('dall-e-3');
      const mockImageData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
      
      mockFetchWithCache.mockResolvedValueOnce({
        data: {
          data: [{ b64_json: mockImageData }],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const context = createMockContext();
      const result = await provider.callApi('test prompt', context);

      expect(result.error).toBeUndefined();
      expect(result.output).toMatch(/^!\[.*\]\(asset:\/\//);
      expect(result.output).toContain(context.vars.__evalId);
      expect(result.output).toContain(context.vars.__resultId);

      // Verify asset was saved
      const assetMatch = result.output.match(/asset:\/\/[^)]+/);
      expect(assetMatch).toBeTruthy();
      
      const [, evalId, resultId, assetId] = assetMatch![0].split('/');
      const assetPath = path.join(tempDir, 'assets', evalId, resultId, assetId);
      const metaPath = `${assetPath}.json`;

      await expect(fs.access(assetPath)).resolves.not.toThrow();
      await expect(fs.access(metaPath)).resolves.not.toThrow();
    });

    it('should fall back to base64 when asset storage fails', async () => {
      const provider = new OpenAiImageProvider('dall-e-3');
      const mockImageData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
      
      mockFetchWithCache.mockResolvedValueOnce({
        data: {
          data: [{ b64_json: mockImageData }],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      // Make the asset directory read-only to force failure
      const evalId = 'eval-' + generateUUID();
      const resultId = 'result-' + generateUUID();
      const dir = path.join(tempDir, 'assets', evalId, resultId);
      await fs.mkdir(dir, { recursive: true });
      await fs.chmod(dir, 0o444);

      const context = {
        vars: { __evalId: evalId, __resultId: resultId },
      };

      try {
        const result = await provider.callApi('test prompt', context);
        
        expect(result.error).toBeUndefined();
        // Should fall back to base64
        expect(result.output).toContain('data:image/png;base64,');
        expect(result.output).toContain(mockImageData);
      } finally {
        await fs.chmod(dir, 0o755);
      }
    });

    it('should handle missing context gracefully', async () => {
      const provider = new OpenAiImageProvider('dall-e-3');
      const mockImageData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
      
      mockFetchWithCache.mockResolvedValueOnce({
        data: {
          data: [{ b64_json: mockImageData }],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      // No context provided
      const result = await provider.callApi('test prompt');

      expect(result.error).toBeUndefined();
      // Should use base64 format
      expect(result.output).toContain('data:image/png;base64,');
    });
  });

  describe('Google Image Provider', () => {
    it('should save multiple images to asset storage', async () => {
      const provider = new GoogleImageProvider('imagen-3.0-generate-001');
      const mockImageData1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
      const mockImageData2 = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQ==';
      
      mockFetchWithCache.mockResolvedValueOnce({
        data: {
          predictions: [
            { mimeType: 'image/png', bytesBase64Encoded: mockImageData1 },
            { mimeType: 'image/jpeg', bytesBase64Encoded: mockImageData2 },
          ],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const context = createMockContext();
      const result = await provider.callApi('test prompt', context);

      expect(result.error).toBeUndefined();
      // Should have two images
      const imageMatches = result.output.match(/!\[.*?\]\(asset:\/\/[^)]+\)/g);
      expect(imageMatches).toHaveLength(2);

      // Both should use asset URLs
      imageMatches!.forEach(match => {
        expect(match).toContain('promptfoo://');
        expect(match).toContain(context.vars.__evalId);
      });
    });
  });

  describe('Hyperbolic Audio Provider', () => {
    it('should save audio to asset storage', async () => {
      const provider = new HyperbolicAudioProvider('meta-llama-3.1-8b-instruct-gptq-int4', {
        config: { audio: {} },
      });
      
      // Mock base64 audio data
      const mockAudioData = Buffer.from('RIFF$   WAVEfmt      ').toString('base64');
      
      mockFetchWithCache.mockResolvedValueOnce({
        data: {
          choices: [{
            message: {
              content: 'Audio response',
              audio: {
                data: mockAudioData,
                expires_at: Date.now() + 3600000,
                id: 'audio-123',
                transcript: 'This is the transcript',
              },
            },
          }],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const context = createMockContext();
      const result = await provider.callApi('test prompt', context);

      expect(result.error).toBeUndefined();
      expect(result.output).toMatch(/^\[Audio\]\(asset:\/\//);
      expect(result.metadata).toHaveProperty('asset');
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large assets', async () => {
      const provider = new OpenAiImageProvider('dall-e-3');
      // Create a large fake image (1MB)
      const largeImageData = Buffer.alloc(1024 * 1024, 'A').toString('base64');
      
      mockFetchWithCache.mockResolvedValueOnce({
        data: {
          data: [{ b64_json: largeImageData }],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const context = createMockContext();
      const result = await provider.callApi('test prompt', context);

      expect(result.error).toBeUndefined();
      expect(result.output).toMatch(/^!\[.*\]\(asset:\/\//);
    });

    it('should handle concurrent provider calls with deduplication', async () => {
      const provider = new HyperbolicImageProvider('SDXL1.0-base');
      const mockImageData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
      
      // All calls return the same image
      mockFetchWithCache.mockResolvedValue({
        data: {
          images: [{ image: mockImageData }],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      // Make concurrent calls
      const contexts = Array(5).fill(null).map(() => createMockContext());
      const promises = contexts.map(ctx => provider.callApi('same prompt', ctx));
      
      const results = await Promise.all(promises);

      // All should succeed
      results.forEach(result => {
        expect(result.error).toBeUndefined();
        expect(result.output).toMatch(/^!\[.*\]\(asset:\/\//);
      });

      // Check that deduplication worked - should have saved disk space
      const assetDirs = await fs.readdir(path.join(tempDir, 'assets'), { recursive: true });
      const assetFiles = assetDirs.filter(f => 
        typeof f === 'string' && !f.endsWith('.json') && !f.includes('/')
      );
      
      // Should have fewer actual files than calls due to deduplication
      expect(assetFiles.length).toBeLessThan(5);
    });

    it('should handle API errors gracefully', async () => {
      const provider = new GoogleImageProvider('imagen-3.0-generate-001');
      
      mockFetchWithCache.mockResolvedValueOnce({
        data: { error: { message: 'API quota exceeded' } },
        cached: false,
        status: 429,
        statusText: 'Too Many Requests',
      });

      const context = createMockContext();
      const result = await provider.callApi('test prompt', context);

      expect(result.error).toContain('429');
      expect(result.output).toBeUndefined();
    });

    it('should handle network timeouts', async () => {
      const provider = new OpenAiImageProvider('dall-e-3');
      
      mockFetchWithCache.mockRejectedValueOnce(new Error('Request timeout'));

      const context = createMockContext();
      const result = await provider.callApi('test prompt', context);

      expect(result.error).toContain('timeout');
    });
  });
});

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}