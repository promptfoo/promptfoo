import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getShareAuthorizedBlob } from '../../src/blobs';
import { createBlobInlineCache, inlineBlobRefsForShare } from '../../src/util/inlineBlobsForShare';

import type { StoredBlob } from '../../src/blobs';

vi.mock('../../src/blobs', () => ({
  getShareAuthorizedBlob: vi.fn(),
}));

vi.mock('../../src/logger', () => ({
  default: {
    warn: vi.fn(),
  },
}));

describe('inlineBlobRefsForShare', () => {
  const hash = 'a'.repeat(64);
  const uri = `promptfoo://blob/${hash}`;
  const bytes = Buffer.from('image-bytes');
  const storedBlob: StoredBlob = {
    data: bytes,
    metadata: {
      createdAt: '2026-06-08T00:00:00.000Z',
      key: 'blob-key',
      mimeType: 'image/png',
      provider: 'filesystem',
      sizeBytes: bytes.length,
    },
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getShareAuthorizedBlob).mockResolvedValue(storedBlob);
  });

  it('inlines authorized blob URIs as data URLs', async () => {
    const result = await inlineBlobRefsForShare(
      { output: uri },
      createBlobInlineCache(),
      'local-eval-1',
    );

    expect(result.output).toBe(`data:image/png;base64,${bytes.toString('base64')}`);
    expect(getShareAuthorizedBlob).toHaveBeenCalledWith(hash, 'local-eval-1');
  });

  it('does not inline a copied blob URI that is not share-authorized for the eval', async () => {
    vi.mocked(getShareAuthorizedBlob).mockResolvedValue(null);

    const result = await inlineBlobRefsForShare(
      { output: uri },
      createBlobInlineCache(),
      'local-eval-1',
    );

    expect(result.output).toBe(uri);
    expect(getShareAuthorizedBlob).toHaveBeenCalledWith(hash, 'local-eval-1');
  });

  it('caches the authorization decision across calls sharing a cache', async () => {
    vi.mocked(getShareAuthorizedBlob).mockResolvedValue(null);
    const cache = createBlobInlineCache();

    await inlineBlobRefsForShare({ output: uri }, cache, 'local-eval-1');
    await inlineBlobRefsForShare([uri], cache, 'local-eval-1');

    expect(getShareAuthorizedBlob).toHaveBeenCalledOnce();
  });
});
