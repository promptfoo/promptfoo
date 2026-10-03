import { afterEach, describe, expect, it, vi } from 'vitest';
import { isBlobStorageEnabled } from '../../src/blobs/extractor';
import {
  getMediaStorage,
  isMediaStorageEnabled,
  LocalFileSystemProvider,
  mediaExists,
  resetMediaStorage,
  retrieveMedia,
  setMediaStorage,
  storeMedia,
} from '../../src/storage';

import type { MediaMetadata, MediaStorageProvider, StoreResult } from '../../src/storage/types';

describe('media storage provider injection', () => {
  afterEach(() => {
    resetMediaStorage();
    vi.restoreAllMocks();
  });

  it('routes media operations through a custom provider', async () => {
    const metadata: MediaMetadata = { contentType: 'audio/wav', mediaType: 'audio' };
    const result: StoreResult = {
      ref: { provider: 'custom', key: 'clip.wav', contentHash: 'hash', metadata },
      deduplicated: false,
    };
    const customProvider: MediaStorageProvider = {
      providerId: 'custom',
      store: vi.fn().mockResolvedValue(result),
      retrieve: vi.fn().mockResolvedValue(Buffer.from('audio')),
      exists: vi.fn().mockResolvedValue(true),
      delete: vi.fn().mockResolvedValue(undefined),
      getUrl: vi.fn().mockResolvedValue(null),
      findByHash: vi.fn().mockResolvedValue(null),
    };

    setMediaStorage(customProvider);

    expect(getMediaStorage()).toBe(customProvider);
    await expect(storeMedia(Buffer.from('audio'), metadata)).resolves.toBe(result);
    await expect(retrieveMedia('clip.wav')).resolves.toEqual(Buffer.from('audio'));
    await expect(mediaExists('clip.wav')).resolves.toBe(true);
    expect(customProvider.store).toHaveBeenCalledWith(Buffer.from('audio'), metadata);
    expect(customProvider.retrieve).toHaveBeenCalledWith('clip.wav');
    expect(customProvider.exists).toHaveBeenCalledWith('clip.wav');
  });

  it('returns to local storage after the custom provider is reset', () => {
    const customProvider = { providerId: 'custom' } as MediaStorageProvider;

    setMediaStorage(customProvider);
    resetMediaStorage();

    expect(getMediaStorage({ basePath: '/tmp/promptfoo-media-storage-test' })).toBeInstanceOf(
      LocalFileSystemProvider,
    );
  });
});

describe('inline media storage toggle', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    [undefined, true],
    ['', true],
    ['0', true],
    ['false', true],
    ['FALSE', true],
    ['no', true],
    ['unsupported', true],
    [' true ', true],
    ['1', false],
    ['true', false],
    ['TRUE', false],
    ['TrUe', false],
    ['yes', false],
    ['YES', false],
    ['yup', false],
    ['YePpErS', false],
  ] as const)('uses one boolean policy for %s', (value, enabled) => {
    vi.stubEnv('PROMPTFOO_INLINE_MEDIA', value);
    expect(isMediaStorageEnabled()).toBe(enabled);
    expect(isBlobStorageEnabled()).toBe(enabled);
  });
});
