import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  BedrockRuntimeClient,
  GetAsyncInvokeCommand,
  StartAsyncInvokeCommand,
} from '@aws-sdk/client-bedrock-runtime';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { storeBlob } from '../../../src/blobs';
import logger from '../../../src/logger';
import { LumaRayVideoProvider } from '../../../src/providers/bedrock/luma-ray';
import { NovaReelVideoProvider } from '../../../src/providers/bedrock/nova-reel';

import type { CallApiContextParams } from '../../../src/types/providers';

vi.mock('../../../src/blobs', () => ({ storeBlob: vi.fn() }));
vi.mock('path', async (importOriginal) => {
  const actual = await importOriginal<typeof import('path')>();
  return { ...actual, resolve: vi.fn(actual.resolve), normalize: vi.fn(actual.normalize) };
});
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, existsSync: vi.fn(actual.existsSync) };
});

describe.each([
  { Provider: LumaRayVideoProvider, label: 'Luma Ray', limit: 600000, imageKey: 'startImage' },
  { Provider: NovaReelVideoProvider, label: 'Nova Reel', limit: 900000, imageKey: 'image' },
])('$label async video transport', ({ Provider, label, limit, imageKey }) => {
  let directory: string;
  const completed = {
    status: 'Completed',
    outputDataConfig: { s3OutputDataConfig: { s3Uri: 's3://bucket/output/' } },
  };

  beforeEach(() => {
    vi.mocked(path.resolve).mockReset();
    vi.mocked(path.normalize).mockReset();
    vi.mocked(fs.existsSync).mockReset();
    vi.useFakeTimers();
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-video-'));
    vi.mocked(storeBlob)
      .mockReset()
      .mockResolvedValue({
        deduplicated: false,
        ref: {
          uri: 'blob://video',
          hash: 'video',
          sizeBytes: 3,
          mimeType: 'video/mp4',
          provider: 'filesystem',
        },
      });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  function setup(extraConfig: Record<string, unknown> = {}) {
    const provider = new Provider(undefined, {
      config: { s3OutputUri: 's3://bucket/request/', region: 'us-east-1', ...extraConfig },
    });
    const credentials = vi.spyOn(provider, 'getCredentials').mockResolvedValue(undefined);
    const bedrock = vi.spyOn(BedrockRuntimeClient.prototype, 'send');
    bedrock.mockResolvedValueOnce({ invocationArn: 'job-arn' } as never);
    bedrock.mockResolvedValue(completed as never);
    const s3 = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({
      Body: { transformToByteArray: async () => new Uint8Array([1, 2, 3]) },
    } as never);
    return { provider, credentials, bedrock, s3 };
  }

  it('preserves separate credentials, real image bytes, command inputs and blob context', async () => {
    const imageFile = path.join(directory, 'image.png');
    fs.writeFileSync(imageFile, Buffer.from([137, 80, 78, 71]));
    const { provider, credentials, bedrock, s3 } = setup({
      [imageKey]: `file://${directory}/unused/../image.png`,
    });
    const response = await provider.callApi('Video [test]', {
      evaluationId: 'eval-video',
      promptIdx: 2,
      testIdx: 3,
    } as CallApiContextParams);

    expect(response.error).toBeUndefined();
    expect(credentials).toHaveBeenCalledTimes(3);
    expect(bedrock.mock.calls[0][0]).toBeInstanceOf(StartAsyncInvokeCommand);
    const start = bedrock.mock.calls[0][0] as StartAsyncInvokeCommand;
    expect(start.input).toMatchObject({
      modelId: provider.modelName,
      outputDataConfig: { s3OutputDataConfig: { s3Uri: 's3://bucket/request/' } },
    });
    const modelInput = start.input.modelInput;
    if (imageKey === 'startImage') {
      expect(modelInput).toMatchObject({
        keyframes: { frame0: { source: { media_type: 'image/png', data: 'iVBORw==' } } },
      });
    } else {
      expect(modelInput).toMatchObject({
        textToVideoParams: { images: [{ format: 'png', source: { bytes: 'iVBORw==' } }] },
      });
    }
    expect(bedrock.mock.calls[1][0]).toBeInstanceOf(GetAsyncInvokeCommand);
    expect(s3.mock.calls[0][0]).toBeInstanceOf(GetObjectCommand);
    expect((s3.mock.calls[0][0] as GetObjectCommand).input).toEqual({
      Bucket: 'bucket',
      Key: 'output/output.mp4',
    });
    expect(storeBlob).toHaveBeenCalledWith(Buffer.from([1, 2, 3]), 'video/mp4', {
      evalId: 'eval-video',
      kind: 'video',
      location: 'response.video',
      promptIdx: 2,
      testIdx: 3,
    });
    expect(response.output).toBe('[Video: Video (test)](blob://video)');
    expect(response.video).toMatchObject({
      id: 'job-arn',
      format: 'mp4',
      blobRef: { uri: 'blob://video' },
    });
  });

  it('preserves each model default polling deadline and interval', async () => {
    const { provider, bedrock, credentials } = setup();
    bedrock.mockResolvedValue({ status: 'InProgress' } as never);
    const response = provider.callApi('video');
    await vi.runAllTimersAsync();
    expect(await response).toEqual({
      error: `Video generation timed out after ${limit / 1000} seconds`,
    });
    expect(bedrock).toHaveBeenCalledTimes(1 + limit / 10000);
    expect(credentials).toHaveBeenCalledTimes(2);
  });

  it.each(['//./..', '//?/..'])(
    'preserves Windows namespace-root rejection for %s before filesystem access',
    async (imagePath) => {
      const { provider, bedrock } = setup({ [imageKey]: `file://${imagePath}` });
      vi.mocked(path.resolve).mockImplementation(path.win32.resolve);
      vi.mocked(path.normalize).mockImplementation(path.win32.normalize);
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const response = await provider.callApi('video');

      expect(response.error).toContain(
        `Invalid image path (path traversal detected): ${imagePath}`,
      );
      expect(fs.existsSync).not.toHaveBeenCalled();
      expect(bedrock).not.toHaveBeenCalled();
    },
  );

  it.each([1, 2, 3])(
    'keeps credential failure %i inside its operation error boundary',
    async (operation) => {
      const { provider, credentials } = setup();
      for (let index = 1; index < operation; index++) {
        credentials.mockResolvedValueOnce(undefined);
      }
      credentials.mockRejectedValueOnce(new Error('credentials unavailable'));
      const warning = vi.spyOn(logger, 'warn');
      const response = await provider.callApi('video');
      if (operation === 3) {
        expect(response.error).toBeUndefined();
        expect(response.video?.url).toBe('s3://bucket/output//output.mp4');
        expect(warning).toHaveBeenCalledWith(
          `[${label}] Failed to download video: S3 download error: credentials unavailable. Using S3 URL.`,
        );
      } else {
        expect(response.error).toBe(
          `${operation === 1 ? 'Failed to start video generation' : 'Polling error'}: credentials unavailable`,
        );
      }
      expect(credentials).toHaveBeenCalledTimes(operation);
      expect(storeBlob).not.toHaveBeenCalled();
    },
  );

  it('keeps download disabled and missing output handling independent of S3', async () => {
    const { provider, bedrock, credentials, s3 } = setup({ downloadFromS3: false });
    expect((await provider.callApi('video')).video?.url).toBe('s3://bucket/output//output.mp4');
    expect(credentials).toHaveBeenCalledTimes(2);
    expect(s3).not.toHaveBeenCalled();
    bedrock.mockResolvedValueOnce({ invocationArn: 'another-job' } as never);
    bedrock.mockResolvedValueOnce({ status: 'Completed', outputDataConfig: {} } as never);
    expect(await provider.callApi('video')).toEqual({ error: 'No output location in response' });
  });
});
