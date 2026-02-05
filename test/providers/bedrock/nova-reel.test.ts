import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disableCache, enableCache } from '../../../src/cache';
import { NovaReelVideoProvider } from '../../../src/providers/bedrock/nova-reel';

import type { NovaReelVideoOptions } from '../../../src/providers/bedrock';

// Create hoisted mock functions and classes that can be controlled from tests
const {
  mockBedrockSend,
  mockS3Send,
  MockBedrockRuntimeClient,
  MockS3Client,
  MockStartAsyncInvokeCommand,
  MockGetAsyncInvokeCommand,
  MockGetObjectCommand,
} = vi.hoisted(() => {
  const mockBedrockSend = vi.fn();
  const mockS3Send = vi.fn();

  class MockBedrockRuntimeClient {
    send = mockBedrockSend;
  }

  class MockS3Client {
    send = mockS3Send;
  }

  class MockStartAsyncInvokeCommand {
    modelInput: unknown;
    constructor(params: { modelInput: unknown }) {
      this.modelInput = params.modelInput;
      Object.assign(this, params);
    }
  }

  class MockGetAsyncInvokeCommand {
    invocationArn: string;
    constructor(params: { invocationArn: string }) {
      this.invocationArn = params.invocationArn;
      Object.assign(this, params);
    }
  }

  class MockGetObjectCommand {
    Bucket: string;
    Key: string;
    constructor(params: { Bucket: string; Key: string }) {
      this.Bucket = params.Bucket;
      this.Key = params.Key;
      Object.assign(this, params);
    }
  }

  return {
    mockBedrockSend,
    mockS3Send,
    MockBedrockRuntimeClient,
    MockS3Client,
    MockStartAsyncInvokeCommand,
    MockGetAsyncInvokeCommand,
    MockGetObjectCommand,
  };
});

// Mock AWS SDK - use class-based mocks for proper constructor behavior
vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: MockBedrockRuntimeClient,
  StartAsyncInvokeCommand: MockStartAsyncInvokeCommand,
  GetAsyncInvokeCommand: MockGetAsyncInvokeCommand,
}));

// Mock S3 client
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: MockS3Client,
  GetObjectCommand: MockGetObjectCommand,
}));

// Mock blob storage
vi.mock('../../../src/blobs', () => ({
  storeBlob: vi.fn().mockResolvedValue({
    ref: {
      uri: 'promptfoo://blob/abc123',
      hash: 'abc123',
      mimeType: 'video/mp4',
      sizeBytes: 1000,
      provider: 'filesystem',
    },
  }),
}));

// Mock logger
vi.mock('../../../src/logger', () => ({
  __esModule: true,
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock sleep utility to speed up tests
vi.mock('../../../src/util/time', () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));

describe('NovaReelVideoProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBedrockSend.mockReset();
    mockS3Send.mockReset();
    disableCache();
  });

  afterEach(() => {
    enableCache();
  });

  describe('constructor', () => {
    it('should create provider with default model name', () => {
      const provider = new NovaReelVideoProvider();
      expect(provider.modelName).toBe('amazon.nova-reel-v1:1');
    });

    it('should create provider with custom model name', () => {
      const provider = new NovaReelVideoProvider('custom-model-id');
      expect(provider.modelName).toBe('custom-model-id');
    });

    it('should use custom id when provided', () => {
      const provider = new NovaReelVideoProvider('amazon.nova-reel-v1:1', {
        id: 'my-custom-provider',
        config: { s3OutputUri: 's3://bucket/prefix' } as NovaReelVideoOptions,
      });
      expect(provider.id()).toBe('my-custom-provider');
    });

    it('should generate id from model name when not provided', () => {
      const provider = new NovaReelVideoProvider('amazon.nova-reel-v1:1', {
        config: { s3OutputUri: 's3://bucket/prefix' } as NovaReelVideoOptions,
      });
      expect(provider.id()).toBe('bedrock:video:amazon.nova-reel-v1:1');
    });
  });

  describe('toString', () => {
    it('should return descriptive string', () => {
      const provider = new NovaReelVideoProvider('amazon.nova-reel-v1:1');
      expect(provider.toString()).toBe('[Amazon Nova Reel Video Provider amazon.nova-reel-v1:1]');
    });
  });

  describe('callApi - validation', () => {
    it('should require s3OutputUri', async () => {
      const provider = new NovaReelVideoProvider('amazon.nova-reel-v1:1', {
        config: {} as NovaReelVideoOptions,
      });

      const result = await provider.callApi('Generate a video');

      expect(result.error).toContain('Nova Reel requires s3OutputUri');
    });

    it('should validate s3OutputUri format', async () => {
      const provider = new NovaReelVideoProvider('amazon.nova-reel-v1:1', {
        config: { s3OutputUri: 'invalid-uri' } as NovaReelVideoOptions,
      });

      const result = await provider.callApi('Generate a video');

      expect(result.error).toContain('Invalid s3OutputUri');
      expect(result.error).toContain('Must start with s3://');
    });

    it('should require prompt', async () => {
      const provider = new NovaReelVideoProvider('amazon.nova-reel-v1:1', {
        config: { s3OutputUri: 's3://bucket/prefix' } as NovaReelVideoOptions,
      });

      const result = await provider.callApi('');

      expect(result.error).toContain('Prompt is required');
    });

    it('should validate TEXT_VIDEO duration', async () => {
      const provider = new NovaReelVideoProvider('amazon.nova-reel-v1:1', {
        config: {
          s3OutputUri: 's3://bucket/prefix',
          taskType: 'TEXT_VIDEO',
          durationSeconds: 12,
        } as NovaReelVideoOptions,
      });

      const result = await provider.callApi('Generate a video');

      expect(result.error).toContain('TEXT_VIDEO task type only supports durationSeconds: 6');
    });

    it('should validate MULTI_SHOT_AUTOMATED duration range', async () => {
      const provider = new NovaReelVideoProvider('amazon.nova-reel-v1:1', {
        config: {
          s3OutputUri: 's3://bucket/prefix',
          taskType: 'MULTI_SHOT_AUTOMATED',
          durationSeconds: 150,
        } as NovaReelVideoOptions,
      });

      const result = await provider.callApi('Generate a video');

      expect(result.error).toContain('Multi-shot videos require durationSeconds between 12-120');
    });

    it('should validate MULTI_SHOT_AUTOMATED duration is multiple of 6', async () => {
      const provider = new NovaReelVideoProvider('amazon.nova-reel-v1:1', {
        config: {
          s3OutputUri: 's3://bucket/prefix',
          taskType: 'MULTI_SHOT_AUTOMATED',
          durationSeconds: 15,
        } as NovaReelVideoOptions,
      });

      const result = await provider.callApi('Generate a video');

      expect(result.error).toContain('multiples of 6');
    });

    it('should validate MULTI_SHOT_MANUAL requires shots', async () => {
      const provider = new NovaReelVideoProvider('amazon.nova-reel-v1:1', {
        config: {
          s3OutputUri: 's3://bucket/prefix',
          taskType: 'MULTI_SHOT_MANUAL',
          durationSeconds: 12,
        } as NovaReelVideoOptions,
      });

      const result = await provider.callApi('Generate a video');

      expect(result.error).toContain('MULTI_SHOT_MANUAL requires shots array');
    });
  });

  describe('callApi - success flow', () => {
    it('should complete video generation successfully', async () => {
      const mockVideoData = Buffer.from('mock video content');

      // Mock Bedrock calls
      mockBedrockSend
        // First call: StartAsyncInvoke
        .mockResolvedValueOnce({
          invocationArn: 'arn:aws:bedrock:us-east-1:123456789:async-invoke/abc123',
        })
        // Second call: GetAsyncInvoke (in progress)
        .mockResolvedValueOnce({
          status: 'InProgress',
          invocationArn: 'arn:aws:bedrock:us-east-1:123456789:async-invoke/abc123',
        })
        // Third call: GetAsyncInvoke (completed)
        .mockResolvedValueOnce({
          status: 'Completed',
          invocationArn: 'arn:aws:bedrock:us-east-1:123456789:async-invoke/abc123',
          outputDataConfig: {
            s3OutputDataConfig: {
              s3Uri: 's3://bucket/prefix',
            },
          },
        });

      // Mock S3 download
      mockS3Send.mockResolvedValueOnce({
        Body: {
          transformToByteArray: vi.fn().mockResolvedValue(mockVideoData),
        },
      });

      const provider = new NovaReelVideoProvider('amazon.nova-reel-v1:1', {
        config: {
          s3OutputUri: 's3://bucket/prefix',
          durationSeconds: 6,
        } as NovaReelVideoOptions,
      });

      const result = await provider.callApi('Generate a beautiful sunset over the ocean');

      expect(result.error).toBeUndefined();
      expect(result.output).toContain('[Video:');
      expect(result.output).toContain('Generate a beautiful sunset');
      expect(result.video).toBeDefined();
      expect(result.video?.format).toBe('mp4');
      expect(result.video?.duration).toBe(6);
      expect(result.video?.blobRef).toBeDefined();
      expect(result.metadata?.taskType).toBe('TEXT_VIDEO');
    });

    it('should handle video generation failure', async () => {
      mockBedrockSend
        // First call: StartAsyncInvoke
        .mockResolvedValueOnce({
          invocationArn: 'arn:aws:bedrock:us-east-1:123456789:async-invoke/abc123',
        })
        // Second call: GetAsyncInvoke (failed)
        .mockResolvedValueOnce({
          status: 'Failed',
          invocationArn: 'arn:aws:bedrock:us-east-1:123456789:async-invoke/abc123',
          failureMessage: 'Content moderation violation',
        });

      const provider = new NovaReelVideoProvider('amazon.nova-reel-v1:1', {
        config: {
          s3OutputUri: 's3://bucket/prefix',
        } as NovaReelVideoOptions,
      });

      const result = await provider.callApi('Generate a video');

      expect(result.error).toContain('Video generation failed');
      expect(result.error).toContain('Content moderation violation');
    });

    it('should fallback to S3 URL when downloadFromS3 is false', async () => {
      mockBedrockSend
        .mockResolvedValueOnce({
          invocationArn: 'arn:aws:bedrock:us-east-1:123456789:async-invoke/abc123',
        })
        .mockResolvedValueOnce({
          status: 'Completed',
          invocationArn: 'arn:aws:bedrock:us-east-1:123456789:async-invoke/abc123',
          outputDataConfig: {
            s3OutputDataConfig: {
              s3Uri: 's3://bucket/prefix',
            },
          },
        });

      const provider = new NovaReelVideoProvider('amazon.nova-reel-v1:1', {
        config: {
          s3OutputUri: 's3://bucket/prefix',
          downloadFromS3: false,
        } as NovaReelVideoOptions,
      });

      const result = await provider.callApi('Generate a video');

      expect(result.error).toBeUndefined();
      expect(result.video?.url).toBe('s3://bucket/prefix/output.mp4');
      expect(result.video?.blobRef).toBeUndefined();
    });

    it('should handle S3 download failure gracefully', async () => {
      mockBedrockSend
        .mockResolvedValueOnce({
          invocationArn: 'arn:aws:bedrock:us-east-1:123456789:async-invoke/abc123',
        })
        .mockResolvedValueOnce({
          status: 'Completed',
          invocationArn: 'arn:aws:bedrock:us-east-1:123456789:async-invoke/abc123',
          outputDataConfig: {
            s3OutputDataConfig: {
              s3Uri: 's3://bucket/prefix',
            },
          },
        });

      // Mock S3 failure
      mockS3Send.mockRejectedValueOnce(new Error('Access Denied'));

      const provider = new NovaReelVideoProvider('amazon.nova-reel-v1:1', {
        config: {
          s3OutputUri: 's3://bucket/prefix',
        } as NovaReelVideoOptions,
      });

      const result = await provider.callApi('Generate a video');

      // Should still succeed but use S3 URL instead of blob
      expect(result.error).toBeUndefined();
      expect(result.video?.url).toBe('s3://bucket/prefix/output.mp4');
      expect(result.video?.blobRef).toBeUndefined();
    });
  });

  describe('callApi - task types', () => {
    it('should build MULTI_SHOT_AUTOMATED input correctly', async () => {
      mockBedrockSend
        .mockResolvedValueOnce({
          invocationArn: 'arn:aws:bedrock:us-east-1:123456789:async-invoke/abc123',
        })
        .mockResolvedValueOnce({
          status: 'Failed',
          failureMessage: 'Test stopped',
        });

      const provider = new NovaReelVideoProvider('amazon.nova-reel-v1:1', {
        config: {
          s3OutputUri: 's3://bucket/prefix',
          taskType: 'MULTI_SHOT_AUTOMATED',
          durationSeconds: 18,
          seed: 42,
        } as NovaReelVideoOptions,
      });

      await provider.callApi('A detailed story about nature');

      // Verify StartAsyncInvokeCommand was called with correct input
      expect(mockBedrockSend).toHaveBeenCalled();
      const startCall = mockBedrockSend.mock.calls[0][0];
      expect(startCall.modelInput.taskType).toBe('MULTI_SHOT_AUTOMATED');
      expect(startCall.modelInput.multiShotAutomatedParams.text).toBe(
        'A detailed story about nature',
      );
      expect(startCall.modelInput.videoGenerationConfig.durationSeconds).toBe(18);
      expect(startCall.modelInput.videoGenerationConfig.seed).toBe(42);
    });

    it('should build MULTI_SHOT_MANUAL input correctly', async () => {
      mockBedrockSend
        .mockResolvedValueOnce({
          invocationArn: 'arn:aws:bedrock:us-east-1:123456789:async-invoke/abc123',
        })
        .mockResolvedValueOnce({
          status: 'Failed',
          failureMessage: 'Test stopped',
        });

      const provider = new NovaReelVideoProvider('amazon.nova-reel-v1:1', {
        config: {
          s3OutputUri: 's3://bucket/prefix',
          taskType: 'MULTI_SHOT_MANUAL',
          durationSeconds: 12,
          shots: [{ text: 'Shot 1: Opening scene' }, { text: 'Shot 2: Closing scene' }],
        } as NovaReelVideoOptions,
      });

      await provider.callApi('Ignored prompt for manual mode');

      // Verify StartAsyncInvokeCommand was called with correct input
      expect(mockBedrockSend).toHaveBeenCalled();
      const startCall = mockBedrockSend.mock.calls[0][0];
      expect(startCall.modelInput.taskType).toBe('MULTI_SHOT_MANUAL');
      expect(startCall.modelInput.multiShotManualParams.shots).toHaveLength(2);
      expect(startCall.modelInput.multiShotManualParams.shots[0].text).toBe(
        'Shot 1: Opening scene',
      );
    });
  });

  describe('callApi - error handling', () => {
    it('should handle Bedrock API errors', async () => {
      mockBedrockSend.mockRejectedValueOnce(new Error('AccessDeniedException'));

      const provider = new NovaReelVideoProvider('amazon.nova-reel-v1:1', {
        config: {
          s3OutputUri: 's3://bucket/prefix',
        } as NovaReelVideoOptions,
      });

      const result = await provider.callApi('Generate a video');

      expect(result.error).toContain('Failed to start video generation');
      expect(result.error).toContain('AccessDeniedException');
    });

    it('should handle polling timeout', async () => {
      mockBedrockSend
        .mockResolvedValueOnce({
          invocationArn: 'arn:aws:bedrock:us-east-1:123456789:async-invoke/abc123',
        })
        // Always return InProgress to trigger timeout
        .mockResolvedValue({
          status: 'InProgress',
          invocationArn: 'arn:aws:bedrock:us-east-1:123456789:async-invoke/abc123',
        });

      const provider = new NovaReelVideoProvider('amazon.nova-reel-v1:1', {
        config: {
          s3OutputUri: 's3://bucket/prefix',
          pollIntervalMs: 100,
          maxPollTimeMs: 500, // Short timeout for test
        } as NovaReelVideoOptions,
      });

      const result = await provider.callApi('Generate a video');

      expect(result.error).toContain('timed out');
    });
  });
});
