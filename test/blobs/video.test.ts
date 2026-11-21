import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBlobByHash, isBlobAllowedForShare } from '../../src/blobs';
import { BoundedReadError } from '../../src/blobs/boundedRead';
import { resolveVideoBytes, videoResolutionErrorMessage } from '../../src/blobs/video';

vi.mock('../../src/blobs', () => ({
  getBlobByHash: vi.fn(),
  isBlobAllowedForShare: vi.fn(),
}));

afterEach(() => vi.resetAllMocks());

describe('resolveVideoBytes', () => {
  const hash = 'a'.repeat(64);
  const resultContext = { evaluationId: 'eval-fixture', testIdx: 1, promptIdx: 2 };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(isBlobAllowedForShare).mockResolvedValue(true);
    vi.mocked(getBlobByHash).mockResolvedValue({
      data: Buffer.from('Benign video fixture'),
      metadata: {
        mimeType: 'video/webm',
        sizeBytes: 20,
        createdAt: new Date().toISOString(),
        provider: 'filesystem',
        key: hash,
      },
    });
  });

  it.each([{ blobRef: { hash, mimeType: 'video/mp4' } }, { url: `promptfoo://blob/${hash}` }])(
    'authorizes a managed blob before reading it',
    async (video) => {
      const result = await resolveVideoBytes(video, 256, resultContext);
      expect(isBlobAllowedForShare).toHaveBeenCalledWith(hash, 'eval-fixture', {
        testIdx: 1,
        promptIdx: 2,
      });
      expect(getBlobByHash).toHaveBeenCalledWith(hash, expect.any(Number));
      expect(result).toEqual({
        buffer: Buffer.from('Benign video fixture'),
        mimeType: 'video/webm',
      });
    },
  );

  it.each(['image/png', 'audio/wav', 'application/octet-stream', '', 'video/'])(
    'rejects stored MIME %j even when the reference claims video',
    async (mimeType) => {
      vi.mocked(getBlobByHash).mockResolvedValue({
        data: Buffer.from('Non-video fixture'),
        metadata: {
          mimeType,
          sizeBytes: 17,
          createdAt: new Date().toISOString(),
          provider: 'filesystem',
          key: hash,
        },
      });
      await expect(
        resolveVideoBytes({ blobRef: { hash, mimeType: 'video/mp4' } }, 256, resultContext),
      ).rejects.toThrow('video MIME type');
    },
  );

  it('does not read when trusted provenance is absent', async () => {
    vi.mocked(isBlobAllowedForShare).mockResolvedValue(false);
    await expect(resolveVideoBytes({ blobRef: { hash } }, 256, resultContext)).rejects.toThrow(
      'requires a trusted blob',
    );
    expect(getBlobByHash).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    { ...resultContext, evaluationId: undefined },
    { ...resultContext, testIdx: undefined },
    { ...resultContext, promptIdx: -1 },
  ])('requires valid result coordinates %j', async (result) => {
    await expect(resolveVideoBytes({ blobRef: { hash } }, 256, result)).rejects.toThrow(
      'requires a trusted blob',
    );
    expect(isBlobAllowedForShare).not.toHaveBeenCalled();
    expect(getBlobByHash).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { blobRef: { hash: '../other' } },
    { storageRef: { key: 'video/fixture.mp4' } },
    { url: 'storageRef:video/fixture.mp4' },
    { url: 'https://example.com/fixture.mp4' },
  ])('rejects unsupported references without reading local bytes', async (video) => {
    await expect(resolveVideoBytes(video, 256, resultContext)).rejects.toThrow('unsupported');
    expect(getBlobByHash).not.toHaveBeenCalled();
    expect(isBlobAllowedForShare).not.toHaveBeenCalled();
  });

  it('rejects oversized metadata before reading the blob', async () => {
    await expect(
      resolveVideoBytes(
        {
          blobRef: { hash, sizeBytes: 257 },
        },
        256,
        resultContext,
      ),
    ).rejects.toThrow('size budget');
    expect(getBlobByHash).not.toHaveBeenCalled();
  });
});

describe('video resolution failures', () => {
  it.each(['too-large', 'unsupported'] as const)('reports the %s storage limit', (code) => {
    const error = new BoundedReadError(code);
    expect(videoResolutionErrorMessage(error)).toBe(error.message);
  });

  it('keeps arbitrary storage errors out of persisted grading reasons', () => {
    const reason = videoResolutionErrorMessage(
      new Error('Download failed: https://example.test/?sig=fixture-secret'),
    );
    expect(reason).toContain('requires a trusted blob');
    expect(reason).not.toContain('fixture-secret');
    expect(reason).not.toContain('example.test');
  });
});
