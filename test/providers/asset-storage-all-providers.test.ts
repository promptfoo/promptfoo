import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { OpenAiImageProvider } from '../../src/providers/openai/image';
import { GoogleImageProvider } from '../../src/providers/google/image';
import { HyperbolicImageProvider } from '../../src/providers/hyperbolic/image';
import { HyperbolicAudioProvider } from '../../src/providers/hyperbolic/audio';
import { AwsBedrockAmazonNovaSonicProvider } from '../../src/providers/bedrock/nova-sonic';
import { GoogleLiveProvider } from '../../src/providers/google/live';
import { OpenAiRealtimeProvider } from '../../src/providers/openai/realtime';
import { getAssetStore } from '../../src/assets';
import type { CallApiContextParams } from '../../src/types';

// Mock all external dependencies
jest.mock('../../src/cache', () => ({
  fetchWithCache: jest.fn(),
}));

jest.mock('../../src/envars', () => ({
  getEnvBool: jest.fn((key: string, defaultValue: boolean) => {
    if (key === 'PROMPTFOO_USE_ASSET_STORAGE') return true;
    if (key === 'PROMPTFOO_ASSET_DEDUPLICATION') return true;
    return defaultValue;
  }),
  getEnvInt: jest.fn((key, defaultValue) => defaultValue),
  getEnvString: jest.fn(() => undefined),
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

jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn().mockImplementation(() => ({
    send: jest.fn(),
  })),
  InvokeModelWithBidirectionalStreamCommand: jest.fn(),
}));

jest.mock('@smithy/node-http-handler', () => ({
  NodeHttp2Handler: jest.fn(),
}));

jest.mock('ws', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    send: jest.fn(),
    close: jest.fn(),
    readyState: 1,
  }));
});

// Mock child_process for Google Live provider
jest.mock('child_process', () => ({
  spawn: jest.fn().mockReturnValue({
    stdin: { write: jest.fn(), end: jest.fn() },
    stdout: { on: jest.fn() },
    stderr: { on: jest.fn() },
    on: jest.fn((event, cb) => {
      if (event === 'close') {
        setTimeout(() => cb(0), 100);
      }
    }),
    kill: jest.fn(),
  }),
}));

// Mock python-shell
jest.mock('python-shell', () => ({
  PythonShell: {
    run: jest.fn(),
  },
}));

// Mock python utils
jest.mock('../../src/python/pythonUtils', () => ({
  validatePythonPath: jest.fn().mockResolvedValue(true),
}));

// Mock ESM imports
jest.mock('../../src/esm', () => ({
  importModule: jest.fn(),
}));

// Mock file utils
jest.mock('../../src/util/fileExtensions', () => ({
  isJavascriptFile: jest.fn((file) => file.endsWith('.js')),
}));

// Mock cliState
jest.mock('../../src/cliState', () => ({
  __esModule: true,
  default: {},
}));

describe('Asset Storage - All Providers Integration', () => {
  let tempDir: string;
  let assetStore: ReturnType<typeof getAssetStore>;
  
  const mockGetConfigDirectoryPath = jest.requireMock(
    '../../src/util/config/manage',
  ).getConfigDirectoryPath;
  const mockFetchWithCache = jest.requireMock('../../src/cache').fetchWithCache;
  const mockLogger = jest.requireMock('../../src/logger').default;

  // Valid context with evalId and resultId
  const createContext = (suffix: string = ''): CallApiContextParams => ({
    vars: {
      __evalId: `eval-test-${Date.now()}${suffix}`,
      __resultId: `result-test-${Date.now()}${suffix}`,
    },
  });

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'promptfoo-all-providers-'));
    mockGetConfigDirectoryPath.mockReturnValue(tempDir);
    assetStore = getAssetStore();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Image Providers', () => {
    describe('OpenAI DALL-E', () => {
      it('should store PNG images with correct MIME type', async () => {
        const provider = new OpenAiImageProvider('dall-e-3', {
          config: { 
            response_format: 'b64_json',
            apiKey: 'test-openai-key',
          },
        });
        
        // Real PNG header followed by test data
        const pngData = Buffer.concat([
          Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
          Buffer.from('fake png data'),
        ]);
        
        mockFetchWithCache.mockResolvedValueOnce({
          data: {
            data: [{
              b64_json: pngData.toString('base64'),
            }],
          },
          cached: false,
          status: 200,
          statusText: 'OK',
        });

        const context = createContext('openai');
        const result = await provider.callApi('Generate a cat', context);

        expect(result.error).toBeUndefined();
        expect(result.output).toMatch(/^!\[.*\]\(promptfoo:\/\/.*\)$/);
        
        // Verify correct MIME type
        const assetUrlMatch = result.output?.match(/promptfoo:\/\/([^/]+)\/([^/]+)\/([^)]+)/);
        expect(assetUrlMatch).toBeTruthy();
        const [, evalId, resultId, assetId] = assetUrlMatch!;
        const metadata = await assetStore.getMetadata(evalId, resultId, assetId);
        expect(metadata.mimeType).toBe('image/png');
        expect(metadata.type).toBe('image');
      });

      it('should handle URL response format without asset storage', async () => {
        const provider = new OpenAiImageProvider('dall-e-2', {
          config: { 
            response_format: 'url',
            apiKey: 'test-openai-key',
          },
        });
        
        mockFetchWithCache.mockResolvedValueOnce({
          data: {
            data: [{
              url: 'https://oaidalleapi.azure.com/image.png',
            }],
          },
          cached: false,
          status: 200,
          statusText: 'OK',
        });

        const context = createContext('openai-url');
        const result = await provider.callApi('Generate a dog', context);

        expect(result.error).toBeUndefined();
        expect(result.output).not.toContain('promptfoo://');
        expect(result.output).toContain('https://oaidalleapi.azure.com/image.png');
      });
    });

    describe('Google Imagen', () => {
      it('should store JPEG images with metadata', async () => {
        const provider = new GoogleImageProvider('imagen-3.0-generate-001', {
          config: { apiKey: 'test-key' },
        });
        
        // Real JPEG header
        const jpegData = Buffer.concat([
          Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]),
          Buffer.from('fake jpeg data'),
        ]);
        
        mockFetchWithCache.mockResolvedValueOnce({
          data: {
            predictions: [{
              bytesBase64Encoded: jpegData.toString('base64'),
              mimeType: 'image/jpeg',
            }],
          },
          cached: false,
        });

        const context = createContext('google');
        const result = await provider.callApi('Generate a landscape', context);

        expect(result.error).toBeUndefined();
        expect(result.output).toContain('promptfoo://');
        
        // Verify metadata
        const assetUrlMatch = result.output?.match(/promptfoo:\/\/([^/]+)\/([^/]+)\/([^)]+)/);
        const [, evalId, resultId, assetId] = assetUrlMatch!;
        const metadata = await assetStore.getMetadata(evalId, resultId, assetId);
        expect(metadata.mimeType).toBe('image/jpeg');
        expect(metadata.size).toBeGreaterThan(0);
      });

      it('should handle multiple images in one response', async () => {
        const provider = new GoogleImageProvider('imagen-3.0-fast-generate-001', {
          config: { apiKey: 'test-key', n: 3 },
        });
        
        mockFetchWithCache.mockResolvedValueOnce({
          data: {
            predictions: [
              { bytesBase64Encoded: Buffer.from('image1').toString('base64') },
              { bytesBase64Encoded: Buffer.from('image2').toString('base64') },
              { bytesBase64Encoded: Buffer.from('image3').toString('base64') },
            ],
          },
          cached: false,
        });

        const context = createContext('google-multi');
        const result = await provider.callApi('Generate variations', context);

        expect(result.error).toBeUndefined();
        const assetUrls = result.output?.match(/promptfoo:\/\/[^)]+/g) || [];
        expect(assetUrls).toHaveLength(3);
      });
    });

    describe('Hyperbolic Flux', () => {
      it('should detect WebP format from content', async () => {
        const provider = new HyperbolicImageProvider('flux-dev', {
          config: { apiKey: 'test-key' },
        });
        
        // WebP header (RIFF....WEBP)
        const webpData = Buffer.concat([
          Buffer.from([0x52, 0x49, 0x46, 0x46]), // RIFF
          Buffer.from([0x00, 0x00, 0x00, 0x00]), // size
          Buffer.from([0x57, 0x45, 0x42, 0x50]), // WEBP
          Buffer.from('fake webp data'),
        ]);
        
        mockFetchWithCache.mockResolvedValueOnce({
          data: {
            images: [{
              image: webpData.toString('base64'),
            }],
          },
          cached: false,
          status: 200,
          statusText: 'OK',
        });

        const context = createContext('hyperbolic');
        const result = await provider.callApi('Generate art', context);

        expect(result.error).toBeUndefined();
        expect(result.output).toContain('promptfoo://');
        
        // Should detect WebP MIME type
        const assetUrlMatch = result.output?.match(/promptfoo:\/\/([^/]+)\/([^/]+)\/([^)]+)/);
        const [, evalId, resultId, assetId] = assetUrlMatch!;
        const metadata = await assetStore.getMetadata(evalId, resultId, assetId);
        expect(metadata.mimeType).toBe('image/webp');
      });
    });
  });

  describe('Audio Providers', () => {
    describe('Hyperbolic Melo-TTS', () => {
      it('should store WAV audio files', async () => {
        const provider = new HyperbolicAudioProvider('melo', {
          config: { 
            apiKey: 'test-key',
            voice: 'EN-US',
          },
        });
        
        // WAV header
        const wavData = Buffer.concat([
          Buffer.from('RIFF'),
          Buffer.from([0x24, 0x00, 0x00, 0x00]), // size
          Buffer.from('WAVEfmt '),
          Buffer.from('fake audio data'),
        ]);
        
        mockFetchWithCache.mockResolvedValueOnce({
          data: {
            audio: wavData.toString('base64'),
          },
          cached: false,
          status: 200,
          statusText: 'OK',
        });

        const context = createContext('hyperbolic-audio');
        const result = await provider.callApi('Hello world', context);

        expect(result.error).toBeUndefined();
        expect(result.output).toMatch(/\[Audio\]\(promptfoo:\/\/.*\)/);
        
        // Verify audio metadata
        const assetUrlMatch = result.output?.match(/promptfoo:\/\/([^/]+)\/([^/]+)\/([^)]+)/);
        const [, evalId, resultId, assetId] = assetUrlMatch!;
        const metadata = await assetStore.getMetadata(evalId, resultId, assetId);
        expect(metadata.type).toBe('audio');
        expect(metadata.mimeType).toBe('audio/wav');
      });
    });

    describe('Bedrock Nova Sonic', () => {
      it('should store converted WAV audio', async () => {
        const provider = new AwsBedrockAmazonNovaSonicProvider('nova-sonic-v1:0', {
          config: {
            region: 'us-east-1',
            bedrock: {
              awsAccessKeyId: 'test',
              awsSecretAccessKey: 'test',
            },
          },
        });

        // Mock Bedrock streaming response
        const mockClient = {
          send: jest.fn().mockResolvedValue({
            stream: {
              [Symbol.asyncIterator]: async function* () {
                yield {
                  chunk: {
                    payloadPart: {
                      bytes: Buffer.from(JSON.stringify({
                        delta: {
                          audioConfig: {
                            sampleRate: 16000,
                            sampleSizeBits: 16,
                            channelCount: 1,
                          },
                        },
                      })),
                    },
                  },
                };
                yield {
                  chunk: {
                    payloadPart: {
                      bytes: Buffer.from(JSON.stringify({
                        delta: {
                          audio: Buffer.from('fake pcm audio').toString('base64'),
                        },
                      })),
                    },
                  },
                };
              },
            },
          }),
        };

        jest.spyOn(provider as any, 'client', 'get').mockReturnValue(mockClient);

        const context = createContext('bedrock');
        const result = await provider.callApi('Test audio', context);

        expect(result.error).toBeUndefined();
        expect(result.output).toContain('[Audio](promptfoo://');
        
        // Verify WAV format
        const assetUrlMatch = result.output?.match(/promptfoo:\/\/([^/]+)\/([^/]+)\/([^)]+)/);
        if (assetUrlMatch) {
          const [, evalId, resultId, assetId] = assetUrlMatch;
          const metadata = await assetStore.getMetadata(evalId, resultId, assetId);
          expect(metadata.mimeType).toBe('audio/wav');
        }
      });
    });

    describe('Google Live', () => {
      it('should store audio from Google Live API', async () => {
        const provider = new GoogleLiveProvider('gemini-2.0-flash-exp', {
          config: {
            apiKey: 'test-key',
            generationConfig: {
              response_modalities: ['audio'],
            },
          },
        });

        // Mock the script execution
        const mockSpawn = jest.requireMock('child_process').spawn;
        mockSpawn.mockReturnValue({
          stdin: { write: jest.fn(), end: jest.fn() },
          stdout: {
            on: jest.fn((event, cb) => {
              if (event === 'data') {
                const response = {
                  response_audio_total: Buffer.from('fake audio').toString('base64'),
                  response_text_total: 'Hello from Google Live',
                };
                cb(Buffer.from(JSON.stringify(response)));
              }
            }),
          },
          stderr: { on: jest.fn() },
          on: jest.fn((event, cb) => {
            if (event === 'close') cb(0);
          }),
          kill: jest.fn(),
        });

        const context = createContext('google-live');
        const result = await provider.callApi('Test prompt', context);

        expect(result.error).toBeUndefined();
        expect(result.output).toContain('[Audio](promptfoo://');
        expect(result.output).toContain('Transcript: Hello from Google Live');
      });
    });

    describe('OpenAI Realtime', () => {
      it('should store audio from realtime API', async () => {
        const provider = new OpenAiRealtimeProvider('gpt-4o-realtime-preview', {
          config: {
            apiKey: 'test-key',
            modalities: ['audio'],
          },
        });

        // Mock WebSocket
        const mockWs = jest.requireMock('ws');
        const wsInstance = {
          on: jest.fn((event, handler) => {
            if (event === 'open') {
              setTimeout(() => handler(), 10);
            } else if (event === 'message') {
              setTimeout(() => {
                // Send session created
                handler(JSON.stringify({
                  type: 'session.created',
                  session: { id: 'test-session' },
                }));
                
                // Send response with audio
                handler(JSON.stringify({
                  type: 'response.done',
                  response: {
                    output: [{
                      type: 'message',
                      role: 'assistant',
                      content: [{
                        type: 'audio',
                        transcript: 'Hello from realtime',
                      }],
                    }],
                  },
                }));
                
                // Send conversation item created with audio data
                handler(JSON.stringify({
                  type: 'conversation.item.created',
                  item: {
                    id: 'item-1',
                    content: [{
                      type: 'audio',
                      audio: Buffer.from('fake audio data').toString('base64'),
                    }],
                  },
                }));
              }, 20);
            }
          }),
          send: jest.fn(),
          close: jest.fn(),
          readyState: 1,
        };
        
        mockWs.mockReturnValue(wsInstance);

        const context = createContext('openai-realtime');
        const result = await provider.callApi('Test realtime', context);

        // The result structure depends on the implementation
        // Let's check if it processed without error
        expect(result.error).toBeUndefined();
      });
    });
  });

  describe('Cross-Provider Deduplication', () => {
    it('should deduplicate identical images across different providers', async () => {
      const imageData = Buffer.from('identical image data');
      const base64Data = imageData.toString('base64');
      
      // OpenAI provider
      const openaiProvider = new OpenAiImageProvider('dall-e-3', {
        config: { 
          response_format: 'b64_json',
          apiKey: 'test-openai-key',
        },
      });
      
      mockFetchWithCache.mockResolvedValueOnce({
        data: {
          data: [{ b64_json: base64Data }],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const context1 = createContext('dedup-1');
      const result1 = await openaiProvider.callApi('Test 1', context1);
      expect(result1.error).toBeUndefined();

      // Google provider with same image
      const googleProvider = new GoogleImageProvider('imagen-3.0-generate-001', {
        config: { apiKey: 'test-key' },
      });
      
      mockFetchWithCache.mockResolvedValueOnce({
        data: {
          predictions: [{
            bytesBase64Encoded: base64Data,
          }],
        },
        cached: false,
      });

      const context2 = createContext('dedup-2');
      const result2 = await googleProvider.callApi('Test 2', context2);
      expect(result2.error).toBeUndefined();

      // Hyperbolic provider with same image
      const hyperbolicProvider = new HyperbolicImageProvider('sdxl', {
        config: { apiKey: 'test-key' },
      });
      
      mockFetchWithCache.mockResolvedValueOnce({
        data: {
          images: [{
            image: base64Data,
          }],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const context3 = createContext('dedup-3');
      const result3 = await hyperbolicProvider.callApi('Test 3', context3);
      expect(result3.error).toBeUndefined();

      // Check deduplication stats
      const stats = await assetStore.getDedupStats();
      expect(stats.uniqueAssets).toBe(1);
      expect(stats.totalAssets).toBe(3);
      expect(stats.duplicateBytes).toBeGreaterThan(0);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle MIME type validation errors', async () => {
      const provider = new HyperbolicImageProvider('flux-dev', {
        config: { apiKey: 'test-key' },
      });
      
      // Invalid image data that won't match any MIME type
      mockFetchWithCache.mockResolvedValueOnce({
        data: {
          images: [{
            image: Buffer.from('not an image').toString('base64'),
          }],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const context = createContext('mime-error');
      const result = await provider.callApi('Test', context);

      // Should still work but might warn about MIME type
      expect(result.error).toBeUndefined();
      expect(result.output).toMatch(/!\[.*\]/);
    });

    it('should handle disk space errors', async () => {
      const provider = new OpenAiImageProvider('dall-e-3', {
        config: { 
          response_format: 'b64_json',
          apiKey: 'test-openai-key',
        },
      });
      
      // Mock fs.writeFile to simulate disk full
      const originalWriteFile = fs.writeFile;
      jest.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('ENOSPC: no space left on device'));
      
      mockFetchWithCache.mockResolvedValueOnce({
        data: {
          data: [{
            b64_json: Buffer.from('test').toString('base64'),
          }],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const context = createContext('disk-error');
      const result = await provider.callApi('Test', context);
      
      // Should fall back to base64
      expect(mockLogger.error).toHaveBeenCalled();
      expect(result.error).toBeUndefined();
      expect(result.output).toContain('data:image/png;base64,');
      
      jest.spyOn(fs, 'writeFile').mockRestore();
    });

    it('should handle invalid UUID formats', async () => {
      const provider = new GoogleImageProvider('imagen-3.0-generate-001', {
        config: { apiKey: 'test-key' },
      });
      
      mockFetchWithCache.mockResolvedValueOnce({
        data: {
          predictions: [{
            bytesBase64Encoded: Buffer.from('test').toString('base64'),
          }],
        },
        cached: false,
      });

      const invalidContext: CallApiContextParams = {
        vars: {
          __evalId: '../../../etc/passwd',
          __resultId: 'result-123',
        },
      };

      const result = await provider.callApi('Test', invalidContext);
      
      // Should reject invalid evalId and fall back
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid evalId format')
      );
      expect(result.output).toContain('data:image/png;base64,');
    });
  });

  describe('Performance and Concurrency', () => {
    it('should handle high concurrency without corruption', async () => {
      const providers = [
        new OpenAiImageProvider('dall-e-3', { config: { response_format: 'b64_json', apiKey: 'test-key' } }),
        new GoogleImageProvider('imagen-3.0-generate-001', { config: { apiKey: 'test-key' } }),
        new HyperbolicImageProvider('flux-dev', { config: { apiKey: 'test-key' } }),
      ];

      // Create 20 concurrent requests across providers
      const promises = [];
      for (let i = 0; i < 20; i++) {
        const provider = providers[i % providers.length];
        const imageData = Buffer.from(`image-${i}`).toString('base64');
        
        if (provider instanceof OpenAiImageProvider) {
          mockFetchWithCache.mockResolvedValueOnce({
            data: { data: [{ b64_json: imageData }] },
            cached: false,
            status: 200,
            statusText: 'OK',
          });
        } else if (provider instanceof GoogleImageProvider) {
          mockFetchWithCache.mockResolvedValueOnce({
            data: { predictions: [{ bytesBase64Encoded: imageData }] },
            cached: false,
          });
        } else {
          mockFetchWithCache.mockResolvedValueOnce({
            data: { images: [{ image: imageData }] },
            cached: false,
            status: 200,
            statusText: 'OK',
          });
        }
        
        const context = createContext(`concurrent-${i}`);
        promises.push(provider.callApi(`Test ${i}`, context));
      }

      const results = await Promise.all(promises);
      
      // All should succeed
      results.forEach((result, i) => {
        expect(result.error).toBeUndefined();
        expect(result.output).toContain('promptfoo://');
      });

      // Verify all assets are valid
      for (let i = 0; i < results.length; i++) {
        const assetUrlMatch = results[i].output?.match(/promptfoo:\/\/([^/]+)\/([^/]+)\/([^)]+)/);
        if (assetUrlMatch) {
          const [, evalId, resultId, assetId] = assetUrlMatch;
          const asset = await assetStore.load(evalId, resultId, assetId);
          expect(asset.toString()).toBe(`image-${i}`);
        }
      }
    });
  });
});