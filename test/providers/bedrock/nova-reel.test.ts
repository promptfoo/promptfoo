import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disableCache, enableCache } from '../../../src/cache';
import { NovaReelVideoProvider } from '../../../src/providers/bedrock/nova-reel';
import { sleep } from '../../../src/util/time';

import type { NovaReelVideoOptions } from '../../../src/providers/bedrock';
import type { CallApiContextParams } from '../../../src/types/providers';

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
    destroy = vi.fn();
  }

  class MockS3Client {
    send = mockS3Send;
    destroy = vi.fn();
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
  it('cancels a pending credential lookup before starting a video job', async () => {
    const provider = new NovaReelVideoProvider('amazon.nova-reel-v1:1', {
      config: { s3OutputUri: 's3://bucket/prefix' } as NovaReelVideoOptions,
    });
    const credentials = vi
      .spyOn(provider, 'getCredentials')
      .mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController();
    const call = provider.callApi('A video', undefined, { abortSignal: controller.signal });
    await vi.waitFor(() => expect(credentials).toHaveBeenCalledOnce());
    controller.abort(new Error('cancelled credentials'));
    await expect(call).rejects.toThrow('cancelled credentials');
    expect(mockBedrockSend).not.toHaveBeenCalled();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockBedrockSend.mockReset();
    mockS3Send.mockReset();
    vi.mocked(sleep).mockReset().mockResolvedValue(undefined);
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
    it('retains the accepted job when polling is cancelled', async () => {
      const controller = new AbortController();
      let notifyStarted!: () => void;
      const polling = new Promise<void>((resolve) => {
        notifyStarted = resolve;
      });
      mockBedrockSend.mockReset();
      mockBedrockSend.mockResolvedValueOnce({ invocationArn: 'accepted-job' });
      mockBedrockSend.mockImplementationOnce((_command, options) => {
        notifyStarted();
        return new Promise((_resolve, reject) => {
          options.abortSignal.addEventListener('abort', () => reject(options.abortSignal.reason), {
            once: true,
          });
        });
      });
      const provider = new NovaReelVideoProvider('amazon.nova-reel-v1:1', {
        config: { s3OutputUri: 's3://bucket/prefix' },
      });
      const call = provider.callApi('A video', undefined, { abortSignal: controller.signal });
      await polling;
      controller.abort(new Error('cancelled polling'));
      await expect(call).resolves.toMatchObject({
        error: expect.stringContaining('cancelled polling'),
        metadata: { invocationArn: 'accepted-job', s3OutputUri: 's3://bucket/prefix' },
      });
      expect(mockS3Send).not.toHaveBeenCalled();
    });

    it('stops waiting for an S3 response body after cancellation', async () => {
      const controller = new AbortController();
      let started!: () => void;
      const reading = new Promise<void>((resolve) => {
        started = resolve;
      });
      mockBedrockSend.mockResolvedValueOnce({ invocationArn: 'job-1' }).mockResolvedValueOnce({
        invocationArn: 'job-1',
        status: 'Completed',
        outputDataConfig: { s3OutputDataConfig: { s3Uri: 's3://bucket/prefix' } },
      });
      mockS3Send.mockResolvedValueOnce({
        Body: {
          transformToByteArray: () => {
            started();
            return new Promise(() => {});
          },
        },
      });
      const provider = new NovaReelVideoProvider('amazon.nova-reel-v1:1', {
        config: { s3OutputUri: 's3://bucket/prefix' },
      });
      const call = provider.callApi('A video', undefined, { abortSignal: controller.signal });
      await reading;
      controller.abort(new Error('cancelled S3 body'));
      await expect(call).resolves.toMatchObject({
        error: expect.stringContaining('cancelled S3 body'),
        metadata: { invocationArn: 'job-1', s3OutputUri: 's3://bucket/prefix' },
      });
      const { storeBlob } = await import('../../../src/blobs');
      expect(storeBlob).not.toHaveBeenCalled();
    });

    it('stops waiting for a blob write after cancellation', async () => {
      const controller = new AbortController();
      const { storeBlob } = await import('../../../src/blobs');
      let started!: () => void;
      const writing = new Promise<void>((resolve) => {
        started = resolve;
      });
      vi.mocked(storeBlob).mockImplementationOnce(() => {
        started();
        return new Promise(() => {});
      });
      mockBedrockSend.mockResolvedValueOnce({ invocationArn: 'job-1' }).mockResolvedValueOnce({
        invocationArn: 'job-1',
        status: 'Completed',
        outputDataConfig: { s3OutputDataConfig: { s3Uri: 's3://bucket/prefix' } },
      });
      mockS3Send.mockResolvedValueOnce({
        Body: { transformToByteArray: async () => new Uint8Array([1]) },
      });
      const provider = new NovaReelVideoProvider('amazon.nova-reel-v1:1', {
        config: { s3OutputUri: 's3://bucket/prefix' },
      });
      const call = provider.callApi('A video', undefined, { abortSignal: controller.signal });
      await writing;
      controller.abort(new Error('cancelled blob write'));
      await expect(call).resolves.toMatchObject({
        error: expect.stringContaining('cancelled blob write'),
        metadata: { invocationArn: 'job-1', s3OutputUri: 's3://bucket/prefix' },
      });
    });

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

      const result = await provider.callApi('Generate a beautiful sunset over the ocean', {
        evaluationId: 'eval-nova-reel',
        promptIdx: 6,
        testIdx: 5,
      } as unknown as CallApiContextParams);

      expect(result.error).toBeUndefined();
      expect(result.output).toContain('[Video:');
      expect(result.output).toContain('Generate a beautiful sunset');
      expect(result.video).toBeDefined();
      expect(result.video?.format).toBe('mp4');
      expect(result.video?.duration).toBe(6);
      expect(result.video?.blobRef).toBeDefined();
      expect(result.metadata?.taskType).toBe('TEXT_VIDEO');
      const { storeBlob } = await import('../../../src/blobs');
      expect(storeBlob).toHaveBeenCalledWith(
        expect.any(Buffer),
        'video/mp4',
        expect.objectContaining({
          evalId: 'eval-nova-reel',
          kind: 'video',
          promptIdx: 6,
          testIdx: 5,
        }),
      );
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
    it.each([
      [
        "Cannot find package '@aws-sdk/client-bedrock-runtime' imported from /app/videoJob.js",
        true,
      ],
      [
        "Cannot find package 'smithy-client' imported from /app/node_modules/@aws-sdk/client-bedrock-runtime/index.js",
        false,
      ],
    ])('reports the correct missing package for %s', async (message, missingRuntime) => {
      mockBedrockSend.mockRejectedValueOnce(
        Object.assign(new Error(message), { code: 'ERR_MODULE_NOT_FOUND' }),
      );
      const provider = new NovaReelVideoProvider('amazon.nova-reel-v1:1', {
        config: { s3OutputUri: 's3://bucket/prefix' } as NovaReelVideoOptions,
      });

      const result = await provider.callApi('Generate a video');
      expect(
        result.error?.includes('Install it with: npm install @aws-sdk/client-bedrock-runtime'),
      ).toBe(missingRuntime);
    });

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
      vi.useFakeTimers();
      try {
        // Route the mocked sleep through the real implementation so fake
        // timers can advance the polling loop deterministically.
        const realTime =
          await vi.importActual<typeof import('../../../src/util/time')>('../../../src/util/time');
        vi.mocked(sleep).mockImplementation(realTime.sleep);

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

        const resultPromise = provider.callApi('Generate a video');
        await vi.runAllTimersAsync();
        const result = await resultPromise;

        expect(result.error).toContain('timed out');
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
