import fsPromises from 'fs/promises';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCacheMappingPath,
  isVideoCacheReferenceUrlSafe,
  readCacheMapping,
  sanitizeVideoSourceUri,
  storeCacheMapping,
} from '../../../src/providers/video/utils';
import { getConfigDirectoryPath } from '../../../src/util/config/manage';

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>();
  return {
    ...actual,
    default: {
      ...actual,
      mkdir: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn(),
    },
    mkdir: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
  };
});

vi.mock('../../../src/util/config/manage', () => ({
  getConfigDirectoryPath: vi.fn(),
}));

vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
  },
}));

describe('video cache utilities', () => {
  const expectedMappingPath = path.join(
    '/tmp/test-config',
    'media',
    'video',
    '_cache',
    'cache-key.json',
  );
  const expectedCacheDir = path.dirname(expectedMappingPath);

  beforeEach(() => {
    vi.mocked(getConfigDirectoryPath).mockReset();
    vi.mocked(fsPromises.mkdir).mockReset();
    vi.mocked(fsPromises.readFile).mockReset();
    vi.mocked(fsPromises.writeFile).mockReset();

    vi.mocked(getConfigDirectoryPath).mockReturnValue('/tmp/test-config');
    vi.mocked(fsPromises.mkdir).mockResolvedValue(undefined);
    vi.mocked(fsPromises.writeFile).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('reads cache mappings with fs/promises', async () => {
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      JSON.stringify({
        videoKey: 'video/abc.mp4',
        thumbnailKey: 'video/abc.webp',
        createdAt: '2026-04-28T00:00:00.000Z',
      }),
    );

    await expect(readCacheMapping('cache-key')).resolves.toEqual({
      videoKey: 'video/abc.mp4',
      thumbnailKey: 'video/abc.webp',
      createdAt: '2026-04-28T00:00:00.000Z',
    });
    expect(fsPromises.readFile).toHaveBeenCalledWith(expectedMappingPath, 'utf8');
  });

  it('returns null when a cache mapping does not exist', async () => {
    vi.mocked(fsPromises.readFile).mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
    );

    await expect(readCacheMapping('missing-key')).resolves.toBeNull();
  });

  it('creates the cache directory before writing mappings', async () => {
    await storeCacheMapping('cache-key', 'video/abc.mp4', 'video/abc.webp');

    expect(getCacheMappingPath('cache-key')).toBe(expectedMappingPath);
    expect(fsPromises.mkdir).toHaveBeenCalledWith(expectedCacheDir, {
      recursive: true,
    });
    expect(fsPromises.writeFile).toHaveBeenCalledWith(
      expectedMappingPath,
      expect.stringContaining('"videoKey": "video/abc.mp4"'),
      'utf8',
    );
  });

  it('rejects JWT query values from cache identity and persisted source metadata', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLTEyMyJ9.signature';
    const sourceUri = `https://generativelanguage.googleapis.com/v1beta/files/example?download=${jwt}&alt=media`;

    expect(isVideoCacheReferenceUrlSafe(sourceUri)).toBe(false);
    expect(sanitizeVideoSourceUri(sourceUri)).toBe(
      'https://generativelanguage.googleapis.com/v1beta/files/example?alt=media',
    );
  });

  it('rejects signed credentials carried in URL fragments', () => {
    const sourceUri = 'https://cdn.example.com/video.mp4#X-Amz-Signature=abcd1234&view=preview';

    expect(isVideoCacheReferenceUrlSafe(sourceUri)).toBe(false);
    expect(sanitizeVideoSourceUri(sourceUri)).toBe(
      'https://cdn.example.com/video.mp4#view=preview',
    );
  });

  it('scrubs all secret-named URL parameters from persisted source metadata', () => {
    const sourceUri = 'https://cdn.example.com/video.mp4?session=private-value&view=preview';

    expect(isVideoCacheReferenceUrlSafe(sourceUri)).toBe(false);
    expect(sanitizeVideoSourceUri(sourceUri)).toBe(
      'https://cdn.example.com/video.mp4?view=preview',
    );
  });

  it('rejects bare credential fragments from persistent cache identities', () => {
    const sourceUri = 'https://cdn.example.com/video.mp4#sk-proj-abcdefghijklmnopqrstuvwxyz';

    expect(isVideoCacheReferenceUrlSafe(sourceUri)).toBe(false);
  });
});
