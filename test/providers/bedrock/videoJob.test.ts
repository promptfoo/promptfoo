import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runBedrockVideoJob, storeBedrockVideo } from '../../../src/providers/bedrock/videoJob';
import { createDeferred } from '../../util/utils';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  s3Send: vi.fn(),
  destroy: vi.fn(),
  s3Destroy: vi.fn(),
  create: vi.fn(),
  createS3: vi.fn(),
  storeBlob: vi.fn(),
}));
vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: class {
    send = mocks.send;
    destroy = mocks.destroy;
    constructor(config: unknown) {
      mocks.create(config);
    }
  },
  StartAsyncInvokeCommand: class {
    constructor(readonly input: unknown) {}
  },
  GetAsyncInvokeCommand: class {
    constructor(readonly input: unknown) {}
  },
}));
vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    send = mocks.s3Send;
    destroy = mocks.s3Destroy;
    constructor(config: unknown) {
      mocks.createS3(config);
    }
  },
  GetObjectCommand: class {
    constructor(readonly input: unknown) {}
  },
}));
vi.mock('../../../src/blobs', () => ({ storeBlob: mocks.storeBlob }));
vi.mock('../../../src/logger');

const provider = {
  modelName: 'fixture-model',
  getRegion: () => 'us-east-1',
  getCredentials: vi.fn(),
};
const config = {
  label: 'Fixture',
  modelInput: { prompt: 'hello' },
  s3OutputUri: 's3://bucket/output',
  pollIntervalMs: 1000,
  maxPollTimeMs: 250,
};
beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    mock.mockReset();
  }
  provider.getCredentials.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Bedrock async video jobs', () => {
  it('uses one owned SDK client, retains submission/metadata, and destroys it after completion', async () => {
    mocks.send.mockResolvedValueOnce({ invocationArn: 'job-1' }).mockResolvedValueOnce({
      status: 'Completed',
      submitTime: new Date('2026-01-01T00:00:00Z'),
      outputDataConfig: { s3OutputDataConfig: { s3Uri: 's3://bucket/output/job-1' } },
    });
    const response = await runBedrockVideoJob(provider, config);
    expect(response.response).toMatchObject({
      invocationArn: 'job-1',
      status: 'Completed',
      submitTime: '2026-01-01T00:00:00.000Z',
    });
    expect(mocks.send.mock.calls[0][0].input).toEqual({
      modelId: 'fixture-model',
      modelInput: { prompt: 'hello' },
      outputDataConfig: { s3OutputDataConfig: { s3Uri: 's3://bucket/output' } },
    });
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });

  it.each(['submission', 'polling'] as const)(
    'preserves %s errors and releases its client',
    async (phase) => {
      if (phase === 'polling') {
        mocks.send.mockResolvedValueOnce({ invocationArn: 'job-1' });
      }
      mocks.send.mockRejectedValueOnce(new Error('fixture failure'));
      expect((await runBedrockVideoJob(provider, config)).error).toBe(
        `${phase === 'submission' ? 'Failed to start video generation' : 'Polling error'}: fixture failure`,
      );
      expect(mocks.destroy).toHaveBeenCalledOnce();
    },
  );

  it.each([
    ['invalid model input', 'Video generation failed: invalid model input'],
    [undefined, 'Video generation failed: Unknown failure'],
  ])(
    'reports a terminal job failure without polling again: %s',
    async (failureMessage, expected) => {
      mocks.send
        .mockResolvedValueOnce({ invocationArn: 'job-1' })
        .mockResolvedValueOnce({ status: 'Failed', failureMessage });
      expect((await runBedrockVideoJob(provider, config)).error).toBe(expected);
      expect(mocks.send).toHaveBeenCalledTimes(2);
      expect(mocks.destroy).toHaveBeenCalledOnce();
    },
  );

  it('caps its final sleep at the remaining polling budget', async () => {
    vi.useFakeTimers();
    const entered = createDeferred<void>();
    mocks.send.mockResolvedValueOnce({ invocationArn: 'job-1' }).mockImplementation(() => {
      entered.resolve();
      return Promise.resolve({ status: 'InProgress' });
    });
    const pending = runBedrockVideoJob(provider, config);
    await entered.promise;
    await vi.advanceTimersByTimeAsync(250);
    expect((await pending).error).toBe('Video generation timed out after 0.25 seconds');
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });

  it('does not resolve credentials or dispatch an already-cancelled job', async () => {
    await expect(
      runBedrockVideoJob(provider, config, AbortSignal.abort(new Error('cancelled'))),
    ).rejects.toThrow('cancelled');
    expect(provider.getCredentials).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('stops a credential wait before creating a client', async () => {
    const controller = new AbortController();
    const entered = createDeferred<void>();
    provider.getCredentials.mockImplementation(() => {
      entered.resolve();
      return new Promise(() => {});
    });
    const pending = runBedrockVideoJob(provider, config, controller.signal);
    await entered.promise;
    controller.abort(new Error('cancelled credentials'));
    await expect(pending).rejects.toThrow('cancelled credentials');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('cancels an active SDK wait and destroys the owned client', async () => {
    const controller = new AbortController();
    const entered = createDeferred<void>();
    mocks.send
      .mockResolvedValueOnce({ invocationArn: 'job-1' })
      .mockImplementationOnce((_command, options) => {
        expect(options.abortSignal).toBe(controller.signal);
        entered.resolve();
        return new Promise(() => {});
      });
    const pending = runBedrockVideoJob(provider, config, controller.signal);
    await entered.promise;
    controller.abort(new Error('cancelled poll'));
    await expect(pending).rejects.toThrow('cancelled poll');
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });
});

describe('Bedrock video storage', () => {
  it.each(['s3://bucket/output', 's3://bucket/output/'])(
    'downloads %s and preserves evaluation metadata',
    async (uri) => {
      mocks.s3Send.mockResolvedValue({
        Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
      });
      const ref = { uri: 'promptfoo://blob/fixture', hash: 'fixture' };
      mocks.storeBlob.mockResolvedValue({ ref });
      expect(
        await storeBedrockVideo(provider, 'Fixture', uri, {
          prompt: { raw: 'hello', label: 'hello' },
          vars: {},
          evaluationId: 'eval-1',
          promptIdx: 2,
          testIdx: 3,
        }),
      ).toEqual({ blobRef: ref });
      expect(mocks.s3Send.mock.calls[0][0].input).toEqual({
        Bucket: 'bucket',
        Key: 'output/output.mp4',
      });
      expect(mocks.storeBlob).toHaveBeenCalledWith(Buffer.from([1, 2, 3]), 'video/mp4', {
        evalId: 'eval-1',
        kind: 'video',
        location: 'response.video',
        promptIdx: 2,
        testIdx: 3,
      });
      expect(mocks.s3Destroy).toHaveBeenCalledOnce();
    },
  );

  it('rejects an invalid S3 URI before constructing a client', async () => {
    expect(
      (await storeBedrockVideo(provider, 'Fixture', 'https://fixture.invalid')).error,
    ).toContain('Invalid S3 URI');
    expect(mocks.createS3).not.toHaveBeenCalled();
  });

  it('does not store an empty response and still releases the S3 client', async () => {
    mocks.s3Send.mockResolvedValue({});
    expect((await storeBedrockVideo(provider, 'Fixture', 's3://bucket/output')).error).toBe(
      'Empty response from S3',
    );
    expect(mocks.storeBlob).not.toHaveBeenCalled();
    expect(mocks.s3Destroy).toHaveBeenCalledOnce();
  });

  it('cancels body consumption before storing any blob', async () => {
    const controller = new AbortController();
    const entered = createDeferred<void>();
    mocks.s3Send.mockResolvedValue({
      Body: {
        transformToByteArray: () => {
          entered.resolve();
          return new Promise(() => {});
        },
      },
    });
    const pending = storeBedrockVideo(
      provider,
      'Fixture',
      's3://bucket/output',
      undefined,
      controller.signal,
    );
    await entered.promise;
    controller.abort(new Error('cancelled body'));
    await expect(pending).rejects.toThrow('cancelled body');
    expect(mocks.storeBlob).not.toHaveBeenCalled();
    expect(mocks.s3Destroy).toHaveBeenCalledOnce();
  });
});
