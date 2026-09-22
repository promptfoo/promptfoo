import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getShareAuthorizedBlob } from '../../src/blobs';
import { uploadBlobRemote } from '../../src/blobs/remoteUpload';
import { createRemoteBlobUploadCache, uploadBlobRefsForShare } from '../../src/blobs/shareUpload';
import logger from '../../src/logger';

import type { StoredBlob } from '../../src/blobs';

vi.mock('../../src/blobs', () => ({
  getShareAuthorizedBlob: vi.fn(),
}));

vi.mock('../../src/blobs/remoteUpload', () => ({
  uploadBlobRemote: vi.fn(),
}));

vi.mock('../../src/logger', () => ({
  default: {
    warn: vi.fn(),
  },
}));

const storedBlob: StoredBlob = {
  data: Buffer.from('image-bytes'),
  metadata: {
    createdAt: '2026-06-08T00:00:00.000Z',
    key: 'blob-key',
    mimeType: 'image/png',
    provider: 'filesystem',
    sizeBytes: 11,
  },
};

describe('share-time blob upload', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getShareAuthorizedBlob).mockResolvedValue(storedBlob);
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

  it('uploads each referenced blob only once when the share context is unchanged', async () => {
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
      promptIdx: 2,
      testIdx: 1,
    });

    expect(getShareAuthorizedBlob).toHaveBeenCalledOnce();
    expect(getShareAuthorizedBlob).toHaveBeenCalledWith(hash, 'local-eval-123');
    expect(uploadBlobRemote).toHaveBeenCalledOnce();
    expect(uploadBlobRemote).toHaveBeenCalledWith(Buffer.from('image-bytes'), 'image/png', {
      evalId: 'remote-eval-123',
      kind: 'image',
      location: 'share',
      promptIdx: 2,
      testIdx: 1,
    });
  });

  it('uploads the same blob again when it appears in a different result row', async () => {
    const hash = '7'.repeat(64);
    const cache = createRemoteBlobUploadCache();

    await uploadBlobRefsForShare(`promptfoo://blob/${hash}`, cache, {
      localEvalId: 'local-eval-123',
      remoteEvalId: 'remote-eval-123',
      promptIdx: 2,
      testIdx: 1,
    });
    await uploadBlobRefsForShare(`promptfoo://blob/${hash}`, cache, {
      localEvalId: 'local-eval-123',
      remoteEvalId: 'remote-eval-123',
      promptIdx: 4,
      testIdx: 3,
    });

    expect(getShareAuthorizedBlob).toHaveBeenCalledTimes(2);
    expect(getShareAuthorizedBlob).toHaveBeenNthCalledWith(1, hash, 'local-eval-123');
    expect(getShareAuthorizedBlob).toHaveBeenNthCalledWith(2, hash, 'local-eval-123');
    expect(uploadBlobRemote).toHaveBeenCalledTimes(2);
    expect(uploadBlobRemote).toHaveBeenNthCalledWith(1, Buffer.from('image-bytes'), 'image/png', {
      evalId: 'remote-eval-123',
      kind: 'image',
      location: 'share',
      promptIdx: 2,
      testIdx: 1,
    });
    expect(uploadBlobRemote).toHaveBeenNthCalledWith(2, Buffer.from('image-bytes'), 'image/png', {
      evalId: 'remote-eval-123',
      kind: 'image',
      location: 'share',
      promptIdx: 4,
      testIdx: 3,
    });
  });

  it('keeps a zero-index result row distinct from a coordinate-less reference', async () => {
    // Pins the `?? null` (not `||`) choice in getUploadCacheKey: promptIdx/testIdx
    // of 0 is the first row of every eval and must not collapse into a reference
    // that carries no coordinates. A regression to `|| null` would dedupe these two
    // into a single upload, dropping the (0, 0) row's provenance.
    const hash = '0'.repeat(64);
    const cache = createRemoteBlobUploadCache();

    await uploadBlobRefsForShare(`promptfoo://blob/${hash}`, cache, {
      localEvalId: 'local-eval-zero',
      remoteEvalId: 'remote-eval-zero',
      promptIdx: 0,
      testIdx: 0,
    });
    await uploadBlobRefsForShare(`promptfoo://blob/${hash}`, cache, {
      localEvalId: 'local-eval-zero',
      remoteEvalId: 'remote-eval-zero',
    });

    expect(getShareAuthorizedBlob).toHaveBeenCalledTimes(2);
    expect(uploadBlobRemote).toHaveBeenCalledTimes(2);
    expect(uploadBlobRemote).toHaveBeenNthCalledWith(1, Buffer.from('image-bytes'), 'image/png', {
      evalId: 'remote-eval-zero',
      kind: 'image',
      location: 'share',
      promptIdx: 0,
      testIdx: 0,
    });
    expect(uploadBlobRemote).toHaveBeenNthCalledWith(2, Buffer.from('image-bytes'), 'image/png', {
      evalId: 'remote-eval-zero',
      kind: 'image',
      location: 'share',
      promptIdx: undefined,
      testIdx: undefined,
    });
  });

  it('does not upload a copied blob URI that is not share-authorized for the eval', async () => {
    const hash = 'd'.repeat(64);
    vi.mocked(getShareAuthorizedBlob).mockResolvedValue(null);

    await uploadBlobRefsForShare(`promptfoo://blob/${hash}`, createRemoteBlobUploadCache(), {
      localEvalId: 'local-eval-unauthorized',
      remoteEvalId: 'remote-eval-unauthorized',
    });

    expect(getShareAuthorizedBlob).toHaveBeenCalledWith(hash, 'local-eval-unauthorized');
    expect(uploadBlobRemote).not.toHaveBeenCalled();
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

  it('checks authorization only once for repeated unauthorized references', async () => {
    const hash = 'e'.repeat(64);
    vi.mocked(getShareAuthorizedBlob).mockResolvedValue(null);
    const cache = createRemoteBlobUploadCache();
    const context = { localEvalId: 'local-eval-999', remoteEvalId: 'remote-eval-999' };

    await uploadBlobRefsForShare(`promptfoo://blob/${hash}`, cache, context);
    await uploadBlobRefsForShare({ output: `promptfoo://blob/${hash}` }, cache, context);

    expect(getShareAuthorizedBlob).toHaveBeenCalledOnce();
    expect(uploadBlobRemote).not.toHaveBeenCalled();
  });

  it('shares one upload across concurrent references to the same blob', async () => {
    const hash = 'f'.repeat(64);
    let releaseAuth: ((blob: StoredBlob | null) => void) | undefined;
    vi.mocked(getShareAuthorizedBlob).mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseAuth = resolve;
        }),
    );
    const cache = createRemoteBlobUploadCache();
    const context = { localEvalId: 'local-eval-111', remoteEvalId: 'remote-eval-111' };

    const uploads = Promise.all([
      uploadBlobRefsForShare(`promptfoo://blob/${hash}`, cache, context),
      uploadBlobRefsForShare(`promptfoo://blob/${hash}`, cache, context),
    ]);
    releaseAuth?.(storedBlob);
    await uploads;

    expect(getShareAuthorizedBlob).toHaveBeenCalledOnce();
    expect(uploadBlobRemote).toHaveBeenCalledOnce();
  });

  it('skips the blob without failing the share when the authorization check errors', async () => {
    const hash = '9'.repeat(64);
    vi.mocked(getShareAuthorizedBlob).mockRejectedValue(new Error('db locked'));

    await expect(
      uploadBlobRefsForShare(`promptfoo://blob/${hash}`, createRemoteBlobUploadCache(), {
        localEvalId: 'local-eval-222',
        remoteEvalId: 'remote-eval-222',
      }),
    ).resolves.toBeUndefined();

    expect(uploadBlobRemote).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      '[Share] Failed to upload referenced blob; shared media may be unavailable',
      expect.objectContaining({
        error: 'db locked',
        hash,
      }),
    );
  });
});
