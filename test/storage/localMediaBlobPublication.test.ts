import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FilesystemBlobStorageProvider } from '../../src/blobs/filesystemProvider';
import logger from '../../src/logger';
import { LocalFileSystemProvider } from '../../src/storage/localFileSystemProvider';
import { createDeferred, createTempDir, removeTempDir } from '../util/utils';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    writeFile: vi.fn(actual.writeFile),
    rename: vi.fn(actual.rename),
    rm: vi.fn(actual.rm),
  };
});

vi.mock('node:timers/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:timers/promises')>()),
  setTimeout: vi.fn(),
}));

const realFs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
const { setTimeout: realSleep } =
  await vi.importActual<typeof import('node:timers/promises')>('node:timers/promises');
const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!;

const data = Buffer.from('complete content-addressed media bytes');
const hash = createHash('sha256').update(data).digest('hex');
const key = `blob/${hash}`;
const metadata = { contentType: 'image/jpeg', mediaType: 'image' as const };
let directory: string;

beforeEach(() => {
  vi.mocked(fs.writeFile).mockReset().mockImplementation(realFs.writeFile);
  vi.mocked(fs.rename).mockReset().mockImplementation(realFs.rename);
  vi.mocked(fs.rm).mockReset().mockImplementation(realFs.rm);
  vi.mocked(sleep).mockReset().mockImplementation(realSleep);
  directory = createTempDir('promptfoo-media-publication-');
});

afterEach(() => {
  Object.defineProperty(process, 'platform', platformDescriptor);
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(fs.writeFile).mockReset();
  vi.mocked(fs.rename).mockReset();
  vi.mocked(fs.rm).mockReset();
  vi.mocked(sleep).mockReset();
  removeTempDir(directory);
});

function createProvider() {
  return new LocalFileSystemProvider({ basePath: directory });
}

describe('completed media blob publication', () => {
  it('repairs missing blob metadata through the media adapter after restart', async () => {
    const first = await createProvider().store(data, metadata);
    const url = await createProvider().getUrl(first.ref.key);
    expect(url).not.toBeNull();
    await realFs.unlink(`${fileURLToPath(url!)}.meta.json`);
    const restarted = createProvider();
    expect((await restarted.store(data, metadata)).deduplicated).toBe(false);
    expect(await restarted.retrieveWithMetadata(first.ref.key)).toEqual({
      data,
      contentType: 'image/jpeg',
    });
  });

  it('recovers after a delete between data and metadata publication', async () => {
    const provider = new FilesystemBlobStorageProvider({ basePath: directory });
    const dataPublished = createDeferred<void>();
    const resumePublication = createDeferred<void>();
    vi.mocked(fs.rename).mockImplementation(async (source, destination) => {
      await realFs.rename(source, destination);
      if (destination === provider.getFilePath(hash)) {
        dataPublished.resolve();
        await resumePublication.promise;
      }
    });
    const writing = provider.store(data, 'image/jpeg');
    await dataPublished.promise;
    try {
      await new FilesystemBlobStorageProvider({ basePath: directory }).deleteByHash(hash);
    } finally {
      resumePublication.resolve();
      await writing;
    }
    await expect(provider.getByHash(hash)).rejects.toThrow(`Blob not found: ${hash}`);
    vi.mocked(fs.rename).mockImplementation(realFs.rename);

    const restarted = new FilesystemBlobStorageProvider({ basePath: directory });
    const retry = await restarted.store(data, 'image/jpeg');
    expect(retry.deduplicated).toBe(false);
    expect(await restarted.getByHash(hash)).toMatchObject({
      data,
      metadata: { mimeType: 'image/jpeg', sizeBytes: data.length },
    });
    expect((await restarted.store(data, 'video/mp4')).ref.mimeType).toBe('image/jpeg');
  });

  it.each(['missing', 'malformed', 'incomplete'] as const)(
    'repairs %s metadata before deduplicating stored data',
    async (state) => {
      const provider = new FilesystemBlobStorageProvider({ basePath: directory });
      await provider.store(data, 'image/jpeg');
      const sidecar = `${provider.getFilePath(hash)}.meta.json`;
      if (state === 'missing') {
        await realFs.unlink(sidecar);
      } else {
        await realFs.writeFile(sidecar, state === 'incomplete' ? '{}' : 'not json');
      }
      if (state !== 'incomplete') {
        expect((await provider.getByHash(hash)).metadata.mimeType).toBe('application/octet-stream');
      }
      expect((await provider.store(data, 'image/jpeg')).deduplicated).toBe(false);
      expect((await provider.getByHash(hash)).metadata.mimeType).toBe('image/jpeg');
    },
  );

  it('retries a partial failed write after restart instead of deduplicating truncated bytes', async () => {
    const writeFile = realFs.writeFile;
    const failure = Object.assign(new Error('fixture disk full'), { code: 'ENOSPC' });
    vi.mocked(fs.writeFile).mockImplementationOnce(async (target, value, options) => {
      expect(value).toEqual(data);
      await writeFile(target, data.subarray(0, 5), options);
      throw failure;
    });
    await expect(createProvider().store(data, metadata)).rejects.toBe(failure);
    vi.mocked(fs.writeFile).mockReset().mockImplementation(realFs.writeFile);

    const restarted = createProvider();
    const result = await restarted.store(data, metadata);
    expect(result.deduplicated).toBe(false);
    expect(await restarted.retrieveWithMetadata(result.ref.key)).toEqual({
      data,
      contentType: metadata.contentType,
    });
  });

  it('does not return an in-progress file to a concurrent writer or reader', async () => {
    const writeFile = realFs.writeFile;
    const started = createDeferred<void>();
    const release = createDeferred<void>();
    vi.mocked(fs.writeFile).mockImplementationOnce(async (target, value, options) => {
      expect(value).toEqual(data);
      await writeFile(target, data.subarray(0, 5), options);
      started.resolve();
      await release.promise;
      await writeFile(target, data);
    });
    const first = createProvider().store(data, metadata);
    await started.promise;
    try {
      const second = createProvider();
      const result = await second.store(data, metadata);
      expect(await second.retrieveWithMetadata(result.ref.key)).toEqual({
        data,
        contentType: metadata.contentType,
      });
    } finally {
      release.resolve();
      await first;
    }
  });

  it('publishes complete JSON for simultaneous writers with different MIME lengths', async () => {
    const writeFile = realFs.writeFile;
    const bothDataStarted = createDeferred<void>();
    const bothMetadataOpened = createDeferred<void>();
    const longerWritten = createDeferred<void>();
    let dataWriters = 0;
    let metadataWriters = 0;
    vi.mocked(fs.writeFile).mockImplementation(async (target, value, options) => {
      if (Buffer.isBuffer(value)) {
        if (++dataWriters === 2) {
          bothDataStarted.resolve();
        }
        await bothDataStarted.promise;
        return writeFile(target, value, options);
      }
      const handle = await fs.open(target as string, 'w');
      try {
        if (++metadataWriters === 2) {
          bothMetadataOpened.resolve();
        }
        await bothMetadataOpened.promise;
        if (String(value).includes('image/jpeg')) {
          await handle.writeFile(value as string);
          longerWritten.resolve();
        } else {
          await longerWritten.promise;
          await handle.writeFile(value as string);
        }
      } finally {
        await handle.close();
      }
    });
    await Promise.all([
      createProvider().store(data, metadata),
      createProvider().store(data, { contentType: 'video/mp4', mediaType: 'video' }),
    ]);
    const filePath = path.join(directory, 'blob-data', hash.slice(0, 2), hash.slice(2, 4), hash);
    const persisted = JSON.parse(await fs.readFile(`${filePath}.meta.json`, 'utf8'));
    expect(['image/jpeg', 'video/mp4']).toContain(persisted.mimeType);
    const stored = await createProvider().retrieveWithMetadata(key);
    expect(stored).toEqual({ data, contentType: persisted.mimeType });
  });

  it.each(['data', 'metadata'] as const)(
    'retries transient Windows %s publication errors without partial writes',
    async (stage) => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      vi.mocked(sleep).mockResolvedValue(undefined);
      const provider = new FilesystemBlobStorageProvider({ basePath: directory });
      const destination = `${provider.getFilePath(hash)}${stage === 'metadata' ? '.meta.json' : ''}`;
      const errors = ['EPERM', 'EACCES', 'EBUSY'];
      const sources: string[] = [];
      vi.mocked(fs.rename).mockImplementation(async (source, target) => {
        if (target === destination) {
          sources.push(String(source));
          const code = errors.shift();
          if (code) {
            throw Object.assign(new Error('fixture temporary file lock'), { code });
          }
        }
        return realFs.rename(source, target);
      });

      await expect(provider.store(data, 'image/jpeg')).resolves.toMatchObject({
        deduplicated: false,
      });
      expect(sources).toHaveLength(4);
      expect(new Set(sources).size).toBe(1);
      expect(vi.mocked(sleep).mock.calls).toEqual([[50], [100], [150]]);
      expect(await provider.getByHash(hash)).toMatchObject({
        data,
        metadata: { mimeType: 'image/jpeg', sizeBytes: data.length },
      });
      expect((await realFs.readdir(path.dirname(destination))).sort()).toEqual([
        hash,
        `${hash}.meta.json`,
      ]);
    },
  );

  it.each(['data', 'metadata'] as const)(
    'waits for the retry delay before republishing Windows %s',
    async (stage) => {
      vi.useFakeTimers({ toFake: ['setTimeout'] });
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      const delayStarted = createDeferred<void>();
      const resumePublication = createDeferred<void>();
      vi.mocked(sleep).mockImplementationOnce((delay) => {
        setTimeout(() => resumePublication.resolve(), delay);
        delayStarted.resolve();
        return resumePublication.promise;
      });
      const provider = new FilesystemBlobStorageProvider({ basePath: directory });
      const destination = `${provider.getFilePath(hash)}${stage === 'metadata' ? '.meta.json' : ''}`;
      let attempts = 0;
      vi.mocked(fs.rename).mockImplementation(async (source, target) => {
        if (target === destination && ++attempts === 1) {
          throw Object.assign(new Error('fixture temporary file lock'), { code: 'EPERM' });
        }
        return realFs.rename(source, target);
      });

      const storing = provider.store(data, 'image/jpeg');
      try {
        await delayStarted.promise;
        expect(sleep).toHaveBeenCalledExactlyOnceWith(50);
        expect(attempts).toBe(1);
        await vi.advanceTimersByTimeAsync(49);
        expect(attempts).toBe(1);
        expect(fs.rm).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1);
        await storing;
      } finally {
        resumePublication.resolve();
        await storing;
      }

      expect(attempts).toBe(2);
      expect(await provider.getByHash(hash)).toMatchObject({
        data,
        metadata: { mimeType: 'image/jpeg' },
      });
    },
  );

  it.each(['data', 'metadata'] as const)(
    'bounds persistent Windows %s publication failures and preserves a competing writer',
    async (stage) => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
      vi.mocked(sleep).mockResolvedValue(undefined);
      const provider = new FilesystemBlobStorageProvider({ basePath: directory });
      const failure = Object.assign(new Error('fixture persistent file lock'), { code: 'EPERM' });
      let failedWriterDirectory: string | undefined;
      let attempts = 0;
      vi.mocked(fs.rename).mockImplementation(async (source, destination) => {
        failedWriterDirectory ??= path.dirname(String(source));
        if (
          source === path.join(failedWriterDirectory, stage === 'data' ? 'data' : 'metadata.json')
        ) {
          if (++attempts === 1) {
            await new FilesystemBlobStorageProvider({ basePath: directory }).store(
              data,
              'video/mp4',
            );
          }
          throw failure;
        }
        return realFs.rename(source, destination);
      });

      await expect(provider.store(data, 'image/jpeg')).rejects.toBe(failure);
      expect(attempts).toBe(6);
      expect(vi.mocked(sleep).mock.calls).toEqual([[50], [100], [150], [200], [250]]);
      expect(await provider.getByHash(hash)).toMatchObject({
        data,
        metadata: { mimeType: 'video/mp4' },
      });
      expect((await realFs.readdir(path.dirname(provider.getFilePath(hash)))).sort()).toEqual([
        hash,
        `${hash}.meta.json`,
      ]);
    },
  );

  it.each([
    ['linux', 'EPERM'],
    ['win32', 'ENOSPC'],
    ['win32', 'ENOENT'],
  ])('propagates %s publication error %s without retrying', async (platform, code) => {
    Object.defineProperty(process, 'platform', { value: platform, configurable: true });
    const failure = Object.assign(new Error('fixture publication failure'), { code });
    vi.mocked(fs.rename).mockRejectedValue(failure);
    const provider = new FilesystemBlobStorageProvider({ basePath: directory });

    await expect(provider.store(data, 'image/jpeg')).rejects.toBe(failure);
    expect(fs.rename).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    expect(await realFs.readdir(path.dirname(provider.getFilePath(hash)))).toEqual([]);
  });

  it.each(['metadata write', 'metadata rename', 'data rename'] as const)(
    'propagates %s failures without publishing a deduplication hit',
    async (stage) => {
      vi.mocked(sleep).mockResolvedValue(undefined);
      const failure = Object.assign(new Error(`fixture ${stage} failure`), { code: 'EACCES' });
      if (stage === 'metadata write') {
        vi.mocked(fs.writeFile).mockImplementation(async (target, value, options) => {
          if (typeof value === 'string') {
            throw failure;
          }
          return realFs.writeFile(target, value, options);
        });
      } else {
        vi.mocked(fs.rename).mockImplementation(async (source, destination) => {
          const isMetadata = String(destination).endsWith('.meta.json');
          if (isMetadata === (stage === 'metadata rename')) {
            throw failure;
          }
          return realFs.rename(source, destination);
        });
      }
      const provider = new FilesystemBlobStorageProvider({ basePath: directory });
      await expect(provider.store(data, 'image/jpeg')).rejects.toBe(failure);
      expect(await provider.exists(hash)).toBe(stage === 'metadata rename');
      if (stage === 'metadata rename') {
        expect(await provider.getByHash(hash)).toMatchObject({
          data,
          metadata: { mimeType: 'application/octet-stream' },
        });
      }
      const parent = path.dirname(provider.getFilePath(hash));
      expect(
        (await fs.readdir(parent)).filter(
          (name) => name.startsWith(`${hash}.`) && !name.endsWith('.meta.json'),
        ),
      ).toEqual([]);
      vi.mocked(fs.writeFile).mockImplementation(realFs.writeFile);
      vi.mocked(fs.rename).mockImplementation(realFs.rename);
      const retry = await new FilesystemBlobStorageProvider({ basePath: directory }).store(
        data,
        'video/mp4',
      );
      expect(retry.deduplicated).toBe(false);
      expect(await provider.getByHash(hash)).toMatchObject({
        data,
        metadata: { mimeType: 'video/mp4' },
      });
    },
  );

  it.each([false, true])(
    'preserves the store outcome when temporary cleanup fails (write fails: %s)',
    async (writeFails) => {
      const failure = Object.assign(new Error('fixture write failure'), { code: 'ENOSPC' });
      const cleanupFailure = Object.assign(new Error('fixture cleanup failure'), {
        code: 'EACCES',
      });
      const warning = vi.spyOn(logger, 'warn').mockImplementation(() => {});
      if (writeFails) {
        vi.mocked(fs.writeFile).mockRejectedValueOnce(failure);
      }
      vi.mocked(fs.rm).mockRejectedValueOnce(cleanupFailure);
      const provider = new FilesystemBlobStorageProvider({ basePath: directory });
      if (writeFails) {
        await expect(provider.store(data, 'image/jpeg')).rejects.toBe(failure);
        expect(await provider.exists(hash)).toBe(false);
      } else {
        await expect(provider.store(data, 'image/jpeg')).resolves.toMatchObject({
          deduplicated: false,
        });
        expect((await provider.getByHash(hash)).data).toEqual(data);
      }
      expect(warning).toHaveBeenCalledWith('[BlobFS] Failed to remove staging directory', {
        error: cleanupFailure,
      });
      const [removedPath, options] = vi.mocked(fs.rm).mock.calls[0];
      expect(String(removedPath)).toMatch(new RegExp(`${hash}\\.[^.]+$`));
      expect(options).toEqual({ recursive: true, force: true });
      expect(removedPath).not.toBe(provider.getFilePath(hash));
    },
  );

  it('preserves committed metadata when a competing data publication fails', async () => {
    vi.mocked(sleep).mockResolvedValue(undefined);
    const failure = Object.assign(new Error('fixture publish failure'), { code: 'EACCES' });
    const provider = new FilesystemBlobStorageProvider({ basePath: directory });
    let failedWriterDirectory: string | undefined;
    vi.mocked(fs.rename).mockImplementation(async (source, destination) => {
      if (!failedWriterDirectory) {
        failedWriterDirectory = path.dirname(source as string);
        await new FilesystemBlobStorageProvider({ basePath: directory }).store(data, 'video/mp4');
      }
      if (source === path.join(failedWriterDirectory, 'data')) {
        throw failure;
      }
      return realFs.rename(source, destination);
    });

    await expect(provider.store(data, 'image/jpeg')).rejects.toBe(failure);
    expect(await provider.getByHash(hash)).toMatchObject({
      data,
      metadata: { mimeType: 'video/mp4' },
    });
    expect(await provider.store(data, 'image/jpeg')).toMatchObject({
      deduplicated: true,
      ref: { mimeType: 'video/mp4' },
    });
  });
});
