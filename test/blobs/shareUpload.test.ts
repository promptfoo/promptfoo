import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBlobByHash, isBlobAllowedForShare } from '../../src/blobs';
import { uploadBlobRemote } from '../../src/blobs/remoteUpload';
import { createRemoteBlobUploadCache, uploadBlobRefsForShare } from '../../src/blobs/shareUpload';
import logger from '../../src/logger';

vi.mock('../../src/blobs', () => ({
  getBlobByHash: vi.fn(),
  isBlobAllowedForShare: vi.fn(),
}));

vi.mock('../../src/blobs/remoteUpload', () => ({
  uploadBlobRemote: vi.fn(),
}));

vi.mock('../../src/logger', () => ({
  default: {
    warn: vi.fn(),
  },
}));

describe('share-time blob upload', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(isBlobAllowedForShare).mockResolvedValue(true);
    vi.mocked(getBlobByHash).mockResolvedValue({
      data: Buffer.from('image-bytes'),
      metadata: {
        createdAt: '2026-06-08T00:00:00.000Z',
        key: 'blob-key',
        mimeType: 'image/png',
        provider: 'filesystem',
        sizeBytes: 11,
      },
    });
    vi.mocked(uploadBlobRemote).mockResolvedValue({
      deduplicated: false,
      ref: {
        hash: 'a'.repeat(64),
        mimeType: 'image/png',
        provider: 'cloud',
        sizeBytes: 11,
        uri: `promptfoo://blob/${'a'.repeat(64)}`,
      },
    });
  });

  it('uploads each referenced blob only once across chunks', async () => {
    const hash = 'a'.repeat(64);
    const cache = createRemoteBlobUploadCache();

    await uploadBlobRefsForShare(
      {
        output: `promptfoo://blob/${hash}`,
        images: [{ blobRef: { hash, uri: `promptfoo://blob/${hash}` } }],
      },
      cache,
      { localEvalId: 'local-eval-123', remoteEvalId: 'remote-eval-123', promptIdx: 2, testIdx: 1 },
    );
    await uploadBlobRefsForShare(`promptfoo://blob/${hash}`, cache, {
      localEvalId: 'local-eval-123',
      remoteEvalId: 'remote-eval-123',
      promptIdx: 4,
      testIdx: 3,
    });

    expect(getBlobByHash).toHaveBeenCalledOnce();
    expect(getBlobByHash).toHaveBeenCalledWith(hash);
    expect(uploadBlobRemote).toHaveBeenCalledOnce();
    expect(uploadBlobRemote).toHaveBeenCalledWith(Buffer.from('image-bytes'), 'image/png', {
      evalId: 'remote-eval-123',
      kind: 'image',
      location: 'share',
      promptIdx: 2,
      testIdx: 1,
    });
  });

  it('does not upload a copied blob URI that is not share-authorized for the eval', async () => {
    const hash = 'd'.repeat(64);
    vi.mocked(isBlobAllowedForShare).mockResolvedValue(false);

    await uploadBlobRefsForShare(`promptfoo://blob/${hash}`, createRemoteBlobUploadCache(), {
      localEvalId: 'local-eval-unauthorized',
      remoteEvalId: 'remote-eval-unauthorized',
    });

    expect(isBlobAllowedForShare).toHaveBeenCalledWith(hash, 'local-eval-unauthorized');
    expect(getBlobByHash).not.toHaveBeenCalled();
    expect(uploadBlobRemote).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      '[Share] Skipping blob reference that is not authorized for this eval',
      { evalId: 'local-eval-unauthorized', hash },
    );
  });

  it('logs upload failures without failing the share', async () => {
    const hash = 'b'.repeat(64);
    vi.mocked(uploadBlobRemote).mockRejectedValue(new Error('network unavailable'));

    await expect(
      uploadBlobRefsForShare(`promptfoo://blob/${hash}`, createRemoteBlobUploadCache(), {
        localEvalId: 'local-eval-456',
        remoteEvalId: 'remote-eval-456',
      }),
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      '[Share] Failed to upload referenced blob; shared media may be unavailable',
      expect.objectContaining({
        error: 'network unavailable',
        evalId: 'remote-eval-456',
        hash,
      }),
    );
  });

  it('logs unavailable remote storage without failing the share', async () => {
    const hash = 'c'.repeat(64);
    vi.mocked(uploadBlobRemote).mockResolvedValue(null);

    await expect(
      uploadBlobRefsForShare(`promptfoo://blob/${hash}`, createRemoteBlobUploadCache(), {
        localEvalId: 'local-eval-789',
        remoteEvalId: 'remote-eval-789',
      }),
    ).resolves.toBeUndefined();

    expect(logger.warn).toHaveBeenCalledWith(
      '[Share] Failed to upload referenced blob; shared media may be unavailable',
      {
        evalId: 'remote-eval-789',
        hash,
      },
    );
  });
});
