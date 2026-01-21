import * as fs from 'fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disableCache, enableCache } from '../../../src/cache';
import { LumaRayVideoProvider } from '../../../src/providers/bedrock/luma-ray';

// Mock hoisted for proper isolation with dynamic imports
const mockBedrockSend = vi.hoisted(() => vi.fn());
const mockS3Send = vi.hoisted(() => vi.fn());
const mockStoreBlob = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    ref: {
      uri: 'blob://test-video-hash',
      hash: 'test-video-hash',
    },
  }),
);

vi.mock('@aws-sdk/client-bedrock-runtime', () => {
  return {
    BedrockRuntimeClient: vi.fn().mockImplementation(function () {
      return { send: mockBedrockSend };
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    StartAsyncInvokeCommand: vi.fn().mockImplementation(function (params: any) {
      return { ...params, _type: 'StartAsyncInvokeCommand' };
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    GetAsyncInvokeCommand: vi.fn().mockImplementation(function (params: any) {
      return { ...params, _type: 'GetAsyncInvokeCommand' };
    }),
  };
});

vi.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: vi.fn().mockImplementation(function () {
      return { send: mockS3Send };
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    GetObjectCommand: vi.fn().mockImplementation(function (params: any) {
      return { ...params, _type: 'GetObjectCommand' };
    }),
  };
});

vi.mock('../../../src/blobs', () => ({
  storeBlob: mockStoreBlob,
}));

vi.mock('../../../src/logger', () => ({
  __esModule: true,
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('../../../src/util/time', () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return {
    ...actual,
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi.fn().mockReturnValue(Buffer.from('fake-image-data')),
  };
});

describe('LumaRayVideoProvider', () => {
  let provider: LumaRayVideoProvider;

  function setupDefaultMocks() {
    // Default mock for successful video generation
    mockBedrockSend
      .mockResolvedValueOnce({
        // StartAsyncInvoke response
        invocationArn: 'arn:aws:bedrock:us-east-1:123456789:async-invoke/test-job-id',
      })
      .mockResolvedValueOnce({
        // GetAsyncInvoke response (Completed)
        invocationArn: 'arn:aws:bedrock:us-east-1:123456789:async-invoke/test-job-id',
        status: 'Completed',
        submitTime: new Date(),
        endTime: new Date(),
        outputDataConfig: {
          s3OutputDataConfig: {
            s3Uri: 's3://test-bucket/output-prefix',
          },
        },
      });

    mockS3Send.mockResolvedValue({
      Body: {
        transformToByteArray: vi.fn().mockResolvedValue(new Uint8Array([0x00, 0x00, 0x00])),
      },
    });

    mockStoreBlob.mockResolvedValue({
      ref: {
        uri: 'blob://test-video-hash',
        hash: 'test-video-hash',
      },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockBedrockSend.mockReset();
    mockS3Send.mockReset();
    mockStoreBlob.mockReset();
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('fake-image-data'));

    disableCache();

    setupDefaultMocks();

    provider = new LumaRayVideoProvider('luma.ray-v2:0', {
      config: {
        s3OutputUri: 's3://test-bucket/luma-outputs/',
        region: 'us-east-1',
      },
    });
  });

  afterEach(() => {
    enableCache();
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with default model name', () => {
      const defaultProvider = new LumaRayVideoProvider();
      expect(defaultProvider.modelName).toBe('luma.ray-v2:0');
    });

    it('should initialize with custom model name', () => {
      const customProvider = new LumaRayVideoProvider('luma.ray-custom:1');
      expect(customProvider.modelName).toBe('luma.ray-custom:1');
    });

    it('should use custom provider ID when specified', () => {
      const customProvider = new LumaRayVideoProvider('luma.ray-v2:0', {
        id: 'my-custom-luma-provider',
      });
      expect(customProvider.id()).toBe('my-custom-luma-provider');
    });

    it('should generate default provider ID from model name', () => {
      expect(provider.id()).toBe('bedrock:video:luma.ray-v2:0');
    });

    it('should have correct toString representation', () => {
      expect(provider.toString()).toBe('[Luma Ray 2 Video Provider luma.ray-v2:0]');
    });
  });

  describe('Validation', () => {
    it('should return error when s3OutputUri is missing', async () => {
      const noS3Provider = new LumaRayVideoProvider('luma.ray-v2:0', {
        config: {} as any,
      });

      const result = await noS3Provider.callApi('A beautiful sunset');

      expect(result.error).toContain('s3OutputUri');
    });

    it('should return error when s3OutputUri is invalid', async () => {
      const invalidS3Provider = new LumaRayVideoProvider('luma.ray-v2:0', {
        config: {
          s3OutputUri: 'invalid-uri',
        } as any,
      });

      const result = await invalidS3Provider.callApi('A beautiful sunset');

      expect(result.error).toContain('Invalid s3OutputUri');
    });

    it('should return error when prompt is empty', async () => {
      const result = await provider.callApi('');

      expect(result.error).toContain('Prompt is required');
    });

    it('should return error when prompt exceeds 5000 characters', async () => {
      const longPrompt = 'a'.repeat(5001);
      const result = await provider.callApi(longPrompt);

      expect(result.error).toContain('5000 character limit');
    });

    it('should return error for invalid aspect ratio', async () => {
      const invalidProvider = new LumaRayVideoProvider('luma.ray-v2:0', {
        config: {
          s3OutputUri: 's3://test-bucket/outputs/',
          aspectRatio: '2:1' as any,
        },
      });

      const result = await invalidProvider.callApi('A sunset');

      expect(result.error).toContain('Invalid aspect_ratio');
    });

    it('should return error for invalid duration', async () => {
      const invalidProvider = new LumaRayVideoProvider('luma.ray-v2:0', {
        config: {
          s3OutputUri: 's3://test-bucket/outputs/',
          duration: '10s' as any,
        },
      });

      const result = await invalidProvider.callApi('A sunset');

      expect(result.error).toContain('Invalid duration');
    });

    it('should return error for invalid resolution', async () => {
      const invalidProvider = new LumaRayVideoProvider('luma.ray-v2:0', {
        config: {
          s3OutputUri: 's3://test-bucket/outputs/',
          resolution: '1080p' as any,
        },
      });

      const result = await invalidProvider.callApi('A sunset');

      expect(result.error).toContain('Invalid resolution');
    });
  });

  describe('Text-to-Video Generation', () => {
    it('should successfully generate video from text prompt', async () => {
      const result = await provider.callApi('A red panda climbing a tree');

      expect(result.error).toBeUndefined();
      expect(result.output).toContain('[Video:');
      expect(result.output).toContain('red panda');
      expect(result.video).toBeDefined();
      expect(result.video?.format).toBe('mp4');
      expect(result.video?.model).toBe('luma.ray-v2:0');
    });

    it('should use default parameters when not specified', async () => {
      await provider.callApi('A sunset over the ocean');

      const startCommand = mockBedrockSend.mock.calls[0][0];
      expect(startCommand.modelInput).toEqual(
        expect.objectContaining({
          aspect_ratio: '16:9',
          duration: '5s',
          resolution: '720p',
        }),
      );
    });

    it('should use custom video parameters', async () => {
      mockBedrockSend.mockReset();
      setupDefaultMocks();

      const customProvider = new LumaRayVideoProvider('luma.ray-v2:0', {
        config: {
          s3OutputUri: 's3://test-bucket/outputs/',
          aspectRatio: '9:16',
          duration: '9s',
          resolution: '540p',
          loop: true,
        },
      });

      await customProvider.callApi('A vertical video of dancing');

      const startCommand = mockBedrockSend.mock.calls[0][0];
      expect(startCommand.modelInput).toEqual(
        expect.objectContaining({
          aspect_ratio: '9:16',
          duration: '9s',
          resolution: '540p',
          loop: true,
        }),
      );
    });

    it('should include correct video metadata in response', async () => {
      const result = await provider.callApi('A time-lapse of clouds');

      expect(result.video).toBeDefined();
      expect(result.video?.duration).toBe(5);
      expect(result.video?.size).toBe('1280x720');
      expect(result.metadata?.duration).toBe('5s');
      expect(result.metadata?.resolution).toBe('720p');
      expect(result.metadata?.aspectRatio).toBe('16:9');
    });
  });

  describe('Image-to-Video Generation', () => {
    it('should support startImage from file path', async () => {
      mockBedrockSend.mockReset();
      setupDefaultMocks();

      const imageProvider = new LumaRayVideoProvider('luma.ray-v2:0', {
        config: {
          s3OutputUri: 's3://test-bucket/outputs/',
          startImage: 'file:///path/to/start.jpg',
        },
      });

      await imageProvider.callApi('Animate this image');

      const startCommand = mockBedrockSend.mock.calls[0][0];
      expect(startCommand.modelInput.keyframes).toBeDefined();
      expect(startCommand.modelInput.keyframes.frame0).toEqual({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: expect.any(String),
        },
      });
    });

    it('should support both start and end images', async () => {
      mockBedrockSend.mockReset();
      setupDefaultMocks();

      const imageProvider = new LumaRayVideoProvider('luma.ray-v2:0', {
        config: {
          s3OutputUri: 's3://test-bucket/outputs/',
          startImage: 'file:///path/to/start.jpg',
          endImage: 'file:///path/to/end.jpg',
        },
      });

      await imageProvider.callApi('Transition between images');

      const startCommand = mockBedrockSend.mock.calls[0][0];
      expect(startCommand.modelInput.keyframes.frame0).toBeDefined();
      expect(startCommand.modelInput.keyframes.frame1).toBeDefined();
    });

    it('should detect PNG format correctly', async () => {
      mockBedrockSend.mockReset();
      setupDefaultMocks();

      const imageProvider = new LumaRayVideoProvider('luma.ray-v2:0', {
        config: {
          s3OutputUri: 's3://test-bucket/outputs/',
          startImage: 'file:///path/to/start.png',
        },
      });

      await imageProvider.callApi('Animate this PNG');

      const startCommand = mockBedrockSend.mock.calls[0][0];
      expect(startCommand.modelInput.keyframes.frame0.source.media_type).toBe('image/png');
    });

    it('should return error for non-existent image file', async () => {
      vi.mocked(fs.existsSync).mockReturnValueOnce(false);

      const imageProvider = new LumaRayVideoProvider('luma.ray-v2:0', {
        config: {
          s3OutputUri: 's3://test-bucket/outputs/',
          startImage: 'file:///path/to/nonexistent.jpg',
        },
      });

      const result = await imageProvider.callApi('Animate this');

      expect(result.error).toContain('not found');
    });

    it('should support raw keyframes structure', async () => {
      mockBedrockSend.mockReset();
      setupDefaultMocks();

      const imageProvider = new LumaRayVideoProvider('luma.ray-v2:0', {
        config: {
          s3OutputUri: 's3://test-bucket/outputs/',
          keyframes: {
            frame0: {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/jpeg',
                data: 'base64encodeddata',
              },
            },
          },
        },
      });

      await imageProvider.callApi('Animate with keyframes');

      const startCommand = mockBedrockSend.mock.calls[0][0];
      expect(startCommand.modelInput.keyframes).toBeDefined();
    });
  });

  describe('Polling and Job Status', () => {
    it('should poll until job is completed', async () => {
      mockBedrockSend
        .mockReset()
        .mockResolvedValueOnce({
          invocationArn: 'arn:aws:bedrock:us-east-1:123:async-invoke/job-1',
        })
        .mockResolvedValueOnce({
          status: 'InProgress',
        })
        .mockResolvedValueOnce({
          status: 'InProgress',
        })
        .mockResolvedValueOnce({
          status: 'Completed',
          invocationArn: 'arn:aws:bedrock:us-east-1:123:async-invoke/job-1',
          outputDataConfig: {
            s3OutputDataConfig: {
              s3Uri: 's3://test-bucket/output',
            },
          },
        });

      const result = await provider.callApi('A slow-generating video');

      expect(result.error).toBeUndefined();
      expect(mockBedrockSend).toHaveBeenCalledTimes(4);
    });

    it('should return error when job fails', async () => {
      mockBedrockSend
        .mockReset()
        .mockResolvedValueOnce({
          invocationArn: 'arn:aws:bedrock:us-east-1:123:async-invoke/job-1',
        })
        .mockResolvedValueOnce({
          status: 'Failed',
          failureMessage: 'Content policy violation',
        });

      const result = await provider.callApi('A problematic prompt');

      expect(result.error).toContain('Content policy violation');
    });

    it('should use custom poll interval', async () => {
      mockBedrockSend.mockReset();
      setupDefaultMocks();

      const customProvider = new LumaRayVideoProvider('luma.ray-v2:0', {
        config: {
          s3OutputUri: 's3://test-bucket/outputs/',
          pollIntervalMs: 5000,
        },
      });

      await customProvider.callApi('A video');

      // The poll should complete (mocked) without actual delay
      expect(mockBedrockSend).toHaveBeenCalled();
    });
  });

  describe('S3 Download and Blob Storage', () => {
    it('should download video from S3 and store as blob', async () => {
      const result = await provider.callApi('A video to download');

      expect(mockS3Send).toHaveBeenCalled();
      expect(mockStoreBlob).toHaveBeenCalledWith(
        expect.any(Buffer),
        'video/mp4',
        expect.objectContaining({
          kind: 'video',
        }),
      );
      expect(result.video?.blobRef).toBeDefined();
      expect(result.video?.blobRef?.uri).toBe('blob://test-video-hash');
    });

    it('should fallback to S3 URL when download fails', async () => {
      mockBedrockSend.mockReset();
      setupDefaultMocks();
      mockS3Send.mockReset().mockRejectedValueOnce(new Error('S3 access denied'));

      const result = await provider.callApi('A video');

      expect(result.error).toBeUndefined();
      expect(result.video?.url).toContain('s3://');
    });

    it('should skip download when downloadFromS3 is false', async () => {
      mockBedrockSend.mockReset();
      setupDefaultMocks();
      mockS3Send.mockReset();

      const noDownloadProvider = new LumaRayVideoProvider('luma.ray-v2:0', {
        config: {
          s3OutputUri: 's3://test-bucket/outputs/',
          downloadFromS3: false,
        },
      });

      await noDownloadProvider.callApi('A video');

      expect(mockS3Send).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle StartAsyncInvoke failure', async () => {
      mockBedrockSend.mockReset().mockRejectedValueOnce(new Error('Bedrock service unavailable'));

      const result = await provider.callApi('A video');

      expect(result.error).toContain('Failed to start video generation');
    });

    it('should handle polling timeout', async () => {
      const shortTimeoutProvider = new LumaRayVideoProvider('luma.ray-v2:0', {
        config: {
          s3OutputUri: 's3://test-bucket/outputs/',
          maxPollTimeMs: 100, // Very short timeout
        },
      });

      // Mock always returning InProgress
      mockBedrockSend
        .mockReset()
        .mockResolvedValueOnce({
          invocationArn: 'arn:aws:bedrock:us-east-1:123:async-invoke/job-1',
        })
        .mockResolvedValue({
          status: 'InProgress',
        });

      // Mock Date.now to simulate timeout
      const originalDateNow = Date.now;
      let callCount = 0;
      const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
        callCount++;
        return callCount > 2 ? originalDateNow() + 1000 : originalDateNow();
      });

      const result = await shortTimeoutProvider.callApi('A video');

      expect(result.error).toContain('timed out');

      dateNowSpy.mockRestore();
    });

    it('should handle missing output location in response', async () => {
      mockBedrockSend
        .mockReset()
        .mockResolvedValueOnce({
          invocationArn: 'arn:aws:bedrock:us-east-1:123:async-invoke/job-1',
        })
        .mockResolvedValueOnce({
          status: 'Completed',
          // Missing outputDataConfig
        });

      const result = await provider.callApi('A video');

      expect(result.error).toContain('No output location');
    });
  });

  describe('Aspect Ratio Validation', () => {
    const validAspectRatios = ['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '9:21'];

    it.each(validAspectRatios)('should accept valid aspect ratio: %s', async (aspectRatio) => {
      mockBedrockSend.mockReset();
      setupDefaultMocks();

      const aspectProvider = new LumaRayVideoProvider('luma.ray-v2:0', {
        config: {
          s3OutputUri: 's3://test-bucket/outputs/',
          aspectRatio: aspectRatio as any,
        },
      });

      const result = await aspectProvider.callApi('A video');

      expect(result.error).toBeUndefined();
    });
  });

  describe('Duration and Resolution', () => {
    it('should accept 5s duration', async () => {
      mockBedrockSend.mockReset();
      setupDefaultMocks();

      const durationProvider = new LumaRayVideoProvider('luma.ray-v2:0', {
        config: {
          s3OutputUri: 's3://test-bucket/outputs/',
          duration: '5s',
        },
      });

      const result = await durationProvider.callApi('A 5 second video');

      expect(result.error).toBeUndefined();
      expect(result.video?.duration).toBe(5);
    });

    it('should accept 9s duration', async () => {
      mockBedrockSend.mockReset();
      setupDefaultMocks();

      const durationProvider = new LumaRayVideoProvider('luma.ray-v2:0', {
        config: {
          s3OutputUri: 's3://test-bucket/outputs/',
          duration: '9s',
        },
      });

      const result = await durationProvider.callApi('A 9 second video');

      expect(result.error).toBeUndefined();
      expect(result.video?.duration).toBe(9);
    });

    it('should accept 540p resolution', async () => {
      mockBedrockSend.mockReset();
      setupDefaultMocks();

      const resProvider = new LumaRayVideoProvider('luma.ray-v2:0', {
        config: {
          s3OutputUri: 's3://test-bucket/outputs/',
          resolution: '540p',
        },
      });

      const result = await resProvider.callApi('A 540p video');

      expect(result.error).toBeUndefined();
      expect(result.video?.size).toContain('540');
    });

    it('should accept 720p resolution', async () => {
      mockBedrockSend.mockReset();
      setupDefaultMocks();

      const resProvider = new LumaRayVideoProvider('luma.ray-v2:0', {
        config: {
          s3OutputUri: 's3://test-bucket/outputs/',
          resolution: '720p',
        },
      });

      const result = await resProvider.callApi('A 720p video');

      expect(result.error).toBeUndefined();
      expect(result.video?.size).toContain('720');
    });
  });

  describe('Video Dimensions Calculation', () => {
    it('should calculate correct dimensions for 16:9 at 720p', async () => {
      const result = await provider.callApi('A 16:9 video');

      expect(result.video?.size).toBe('1280x720');
    });

    it('should calculate correct dimensions for 9:16 at 720p', async () => {
      mockBedrockSend.mockReset();
      setupDefaultMocks();

      const verticalProvider = new LumaRayVideoProvider('luma.ray-v2:0', {
        config: {
          s3OutputUri: 's3://test-bucket/outputs/',
          aspectRatio: '9:16',
        },
      });

      const result = await verticalProvider.callApi('A vertical video');

      expect(result.video?.size).toBe('405x720');
    });

    it('should calculate correct dimensions for 1:1 at 540p', async () => {
      mockBedrockSend.mockReset();
      setupDefaultMocks();

      const squareProvider = new LumaRayVideoProvider('luma.ray-v2:0', {
        config: {
          s3OutputUri: 's3://test-bucket/outputs/',
          aspectRatio: '1:1',
          resolution: '540p',
        },
      });

      const result = await squareProvider.callApi('A square video');

      expect(result.video?.size).toBe('540x540');
    });
  });
});
