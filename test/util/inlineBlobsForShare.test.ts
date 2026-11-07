import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getShareAuthorizedBlob } from '../../src/blobs';
import { createBlobInlineCache, inlineBlobRefsForShare } from '../../src/util/inlineBlobsForShare';
import { createDeferred } from './utils';

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

  afterEach(() => {
    vi.resetAllMocks();
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

  it.each(['success', 'denied', 'error'] as const)(
    'shares one pending read across concurrent references (%s)',
    async (outcome) => {
      const read = createDeferred<StoredBlob | null>();
      vi.mocked(getShareAuthorizedBlob).mockReturnValue(read.promise);
      const cache = createBlobInlineCache();
      const pending = Array.from({ length: 20 }, () =>
        inlineBlobRefsForShare({ output: uri }, cache, 'eval-1'),
      );
      const callsBeforeResolution = vi.mocked(getShareAuthorizedBlob).mock.calls.length;
      if (outcome === 'error') {
        read.reject(new Error('Synthetic blob read failed'));
      } else {
        read.resolve(outcome === 'success' ? storedBlob : null);
      }
      const results = await Promise.all(pending);
      expect(callsBeforeResolution).toBe(1);
      for (const result of results) {
        expect(result.output).toBe(
          outcome === 'success' ? `data:image/png;base64,${bytes.toString('base64')}` : uri,
        );
      }
      await inlineBlobRefsForShare({ output: uri }, cache, 'eval-1');
      expect(getShareAuthorizedBlob).toHaveBeenCalledOnce();
      vi.mocked(getShareAuthorizedBlob).mockResolvedValue(storedBlob);
      await inlineBlobRefsForShare({ output: uri }, createBlobInlineCache(), 'eval-1');
      expect(getShareAuthorizedBlob).toHaveBeenCalledTimes(2);
    },
  );

  it('does not reuse a completed authorization decision for another eval', async () => {
    vi.mocked(getShareAuthorizedBlob).mockImplementation(async (_hash, evalId) =>
      evalId === 'owner' ? storedBlob : null,
    );
    const cache = createBlobInlineCache();
    await inlineBlobRefsForShare({ output: uri }, cache, 'owner');
    const foreign = await inlineBlobRefsForShare({ output: uri }, cache, 'foreign');
    expect(getShareAuthorizedBlob).toHaveBeenCalledTimes(2);
    expect(getShareAuthorizedBlob).toHaveBeenLastCalledWith(hash, 'foreign');
    expect(foreign.output).toBe(uri);
  });

  it('keeps pending work isolated by eval and by cache instance', async () => {
    const read = createDeferred<StoredBlob | null>();
    vi.mocked(getShareAuthorizedBlob).mockImplementation((_hash, evalId) =>
      evalId === 'owner' ? read.promise : Promise.resolve(null),
    );
    const cache = createBlobInlineCache();
    const owner = inlineBlobRefsForShare({ output: uri }, cache, 'owner');
    const other = inlineBlobRefsForShare({ output: uri }, cache, 'other');
    const separate = inlineBlobRefsForShare({ output: uri }, createBlobInlineCache(), 'owner');
    try {
      expect(getShareAuthorizedBlob).toHaveBeenCalledTimes(3);
      expect((await other).output).toBe(uri);
    } finally {
      read.resolve(storedBlob);
    }
    for (const result of await Promise.all([owner, separate])) {
      expect(result.output).toBe(`data:image/png;base64,${bytes.toString('base64')}`);
    }
  });

  it('can read distinct hashes concurrently', async () => {
    const otherHash = 'b'.repeat(64);
    const firstRead = createDeferred<StoredBlob | null>();
    const secondRead = createDeferred<StoredBlob | null>();
    vi.mocked(getShareAuthorizedBlob).mockImplementation((requestedHash) =>
      requestedHash === hash ? firstRead.promise : secondRead.promise,
    );
    const cache = createBlobInlineCache();
    const first = inlineBlobRefsForShare({ output: uri }, cache, 'owner');
    const second = inlineBlobRefsForShare(
      { output: `promptfoo://blob/${otherHash}` },
      cache,
      'owner',
    );
    try {
      expect(getShareAuthorizedBlob).toHaveBeenCalledTimes(2);
    } finally {
      firstRead.resolve(storedBlob);
      secondRead.resolve(storedBlob);
    }
    for (const result of await Promise.all([first, second])) {
      expect(result.output).toBe(`data:image/png;base64,${bytes.toString('base64')}`);
    }
  });
});
