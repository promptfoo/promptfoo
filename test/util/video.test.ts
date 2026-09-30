import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBlobByHash, isBlobAllowedForShare } from '../../src/blobs';
import { BoundedReadError } from '../../src/storage/boundedRead';
import {
  resolveVideoBytes,
  VIDEO_INLINE_LIMIT_BYTES,
  videoResolutionErrorMessage,
} from '../../src/util/video';

vi.mock('../../src/blobs', () => ({
  getBlobByHash: vi.fn(),
  isBlobAllowedForShare: vi.fn(),
}));

afterEach(() => vi.resetAllMocks());

describe('resolveVideoBytes', () => {
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
        key: 'fixture-hash',
      },
    });
  });

  it.each([
    { blobRef: { hash: 'fixture-hash', mimeType: 'video/mp4' } },
    { url: 'promptfoo://blob/fixture-hash' },
  ])('authorizes a managed blob before reading it', async (video) => {
    const result = await resolveVideoBytes(video, 'eval-fixture');
    expect(isBlobAllowedForShare).toHaveBeenCalledWith('fixture-hash', 'eval-fixture');
    expect(getBlobByHash).toHaveBeenCalledWith('fixture-hash', expect.any(Number));
    expect(result).toEqual({ buffer: Buffer.from('Benign video fixture'), mimeType: 'video/webm' });
  });

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
          key: 'fixture-hash',
        },
      });
      await expect(
        resolveVideoBytes(
          { blobRef: { hash: 'fixture-hash', mimeType: 'video/mp4' } },
          'eval-fixture',
        ),
      ).rejects.toThrow('video MIME type');
    },
  );

  it('does not read when trusted provenance is absent', async () => {
    vi.mocked(isBlobAllowedForShare).mockResolvedValue(false);
    await expect(
      resolveVideoBytes({ blobRef: { hash: 'fixture-hash' } }, 'eval-fixture'),
    ).rejects.toThrow('requires a trusted blob');
    expect(getBlobByHash).not.toHaveBeenCalled();
  });

  it('requires the evaluator identity', async () => {
    await expect(resolveVideoBytes({ blobRef: { hash: 'fixture-hash' } })).rejects.toThrow(
      'requires a trusted blob',
    );
    expect(isBlobAllowedForShare).not.toHaveBeenCalled();
    expect(getBlobByHash).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { storageRef: { key: 'video/fixture.mp4' } },
    { url: 'storageRef:video/fixture.mp4' },
    { url: 'https://example.com/fixture.mp4' },
  ])('rejects unsupported references without reading local bytes', async (video) => {
    await expect(resolveVideoBytes(video, 'eval-fixture')).rejects.toThrow('unsupported');
    expect(getBlobByHash).not.toHaveBeenCalled();
    expect(isBlobAllowedForShare).not.toHaveBeenCalled();
  });

  it('rejects oversized metadata before reading the blob', async () => {
    await expect(
      resolveVideoBytes(
        {
          blobRef: { hash: 'fixture-hash', sizeBytes: VIDEO_INLINE_LIMIT_BYTES },
        },
        'eval-fixture',
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
