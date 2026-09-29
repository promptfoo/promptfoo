import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as fsPromises from 'fs/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalFileSystemProvider } from '../../src/storage/localFileSystemProvider';
import { createTempDir, removeTempDir } from '../util/utils';

vi.mock('fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs/promises')>()),
}));

describe('LocalFileSystemProvider', () => {
  let tempDir: string | undefined;
  const extraFilesToCleanup: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const filePath of extraFilesToCleanup) {
      try {
        fs.rmSync(filePath, { force: true });
      } catch {
        // Ignore cleanup failures
      }
    }
    extraFilesToCleanup.length = 0;

    removeTempDir(tempDir);
    tempDir = undefined;
  });

  it('prevents path traversal in exists()', async () => {
    tempDir = createTempDir('promptfoo-media-');
    const provider = new LocalFileSystemProvider({ basePath: tempDir });

    await expect(provider.exists('../outside.txt')).resolves.toBe(false);
  });

  it('prevents path traversal in retrieve()', async () => {
    tempDir = createTempDir('promptfoo-media-');

    const outsidePath = path.join(
      path.dirname(tempDir),
      `promptfoo-outside-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`,
    );
    extraFilesToCleanup.push(outsidePath);
    fs.writeFileSync(outsidePath, 'secret', 'utf8');

    const provider = new LocalFileSystemProvider({ basePath: tempDir });
    await expect(provider.retrieve(`../${path.basename(outsidePath)}`)).rejects.toThrow(
      /path traversal/i,
    );
  });

  it('stores and retrieves media under the base path', async () => {
    tempDir = createTempDir('promptfoo-media-');
    const provider = new LocalFileSystemProvider({ basePath: tempDir });

    const payload = Buffer.from('hello');
    const { ref } = await provider.store(payload, {
      contentType: 'audio/wav',
      mediaType: 'audio',
    });

    const retrieved = await provider.retrieve(ref.key);
    expect(retrieved.toString('utf8')).toBe('hello');
    expect(fs.existsSync(path.join(tempDir, `${ref.key}.meta.json`))).toBe(false);
    await expect(provider.delete(ref.key)).resolves.toBeUndefined();
    await expect(provider.exists(ref.key)).resolves.toBe(false);
  });
  it.each([
    ['audio', 'audio/wav', 'wav'],
    ['image', 'image/png', 'png'],
    ['video', 'video/mp4', 'mp4'],
  ] as const)(
    'stores and deletes %s when the unused sidecar path is a nonempty directory',
    async (mediaType, contentType, extension) => {
      tempDir = createTempDir('promptfoo-media-');
      const provider = new LocalFileSystemProvider({ basePath: tempDir });
      const payload = Buffer.from(`${mediaType} payload`);
      const contentHash = createHash('sha256').update(payload).digest('hex');
      const key = `blob/${contentHash}`;
      const legacyKey = `${mediaType}/${contentHash.slice(0, 12)}.${extension}`;
      const sidecarPath = path.join(tempDir, `${legacyKey}.meta.json`);
      fs.mkdirSync(sidecarPath, { recursive: true });
      const unrelatedPath = path.join(sidecarPath, 'unrelated.txt');
      fs.writeFileSync(unrelatedPath, 'unrelated data', 'utf8');
      const nestedPath = path.join(sidecarPath, 'nested');
      fs.mkdirSync(nestedPath);
      fs.writeFileSync(path.join(nestedPath, 'payload.bin'), 'nested unrelated data');
      const metadata = { mediaType, contentType, evalId: 'test-eval', originalText: 'source text' };

      const stored = await provider.store(payload, metadata);

      expect(stored).toEqual({
        deduplicated: false,
        ref: {
          provider: 'local',
          key,
          contentHash,
          metadata: { ...metadata, contentHash, sizeBytes: payload.length },
        },
      });
      expect(fs.statSync(sidecarPath).isDirectory()).toBe(true);
      await expect(provider.retrieve(key)).resolves.toEqual(payload);
      await expect(provider.getStats()).resolves.toEqual({
        fileCount: 1,
        totalSizeBytes: payload.length,
      });
      const reopened = new LocalFileSystemProvider({ basePath: tempDir });
      await expect(reopened.findByHash(contentHash)).resolves.toBe(key);
      await expect(reopened.store(payload, metadata)).resolves.toMatchObject({
        deduplicated: true,
        ref: { key, metadata },
      });

      await expect(reopened.delete(key)).resolves.toBeUndefined();

      await expect(reopened.exists(key)).resolves.toBe(false);
      await expect(reopened.findByHash(contentHash)).resolves.toBeNull();
      const afterDelete = new LocalFileSystemProvider({ basePath: tempDir });
      await expect(afterDelete.findByHash(contentHash)).resolves.toBeNull();
      await expect(afterDelete.getStats()).resolves.toEqual({ fileCount: 0, totalSizeBytes: 0 });
      expect(fs.readdirSync(sidecarPath).sort()).toEqual(['nested', 'unrelated.txt']);
      expect(fs.readFileSync(unrelatedPath, 'utf8')).toBe('unrelated data');
      expect(fs.readFileSync(path.join(nestedPath, 'payload.bin'), 'utf8')).toBe(
        'nested unrelated data',
      );
      await expect(reopened.delete(key)).resolves.toBeUndefined();
    },
  );

  it('propagates failures to delete a legacy sidecar file', async () => {
    tempDir = createTempDir('promptfoo-media-');
    const provider = new LocalFileSystemProvider({ basePath: tempDir });
    const key = 'audio/legacy.wav';
    const mediaPath = path.join(tempDir, key);
    fs.mkdirSync(path.dirname(mediaPath), { recursive: true });
    fs.writeFileSync(mediaPath, 'legacy media');
    const sidecarPath = `${mediaPath}.meta.json`;
    fs.writeFileSync(sidecarPath, 'legacy metadata', 'utf8');
    const failure = Object.assign(new Error('Access denied'), { code: 'EACCES' });
    const unlink = fsPromises.unlink;
    vi.spyOn(fsPromises, 'unlink').mockImplementation(async (filePath) => {
      if (filePath === sidecarPath) {
        throw failure;
      }
      return unlink(filePath);
    });

    await expect(provider.delete(key)).rejects.toBe(failure);
    expect(fs.readFileSync(sidecarPath, 'utf8')).toBe('legacy metadata');
  });

  it.each(['file', 'directory'])(
    'handles a legacy sidecar %s during media deletion',
    async (sidecarType) => {
      tempDir = createTempDir('promptfoo-media-');
      const payload = Buffer.from('legacy media');
      const hash = createHash('sha256').update(payload).digest('hex');
      const key = `audio/${hash.slice(0, 12)}.wav`;
      const sidecarPath = path.join(tempDir, `${key}.meta.json`);
      fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
      if (sidecarType === 'directory') {
        fs.mkdirSync(sidecarPath);
      }
      const contentPath =
        sidecarType === 'directory' ? path.join(sidecarPath, 'kept.txt') : sidecarPath;
      fs.writeFileSync(contentPath, 'legacy metadata', 'utf8');
      fs.writeFileSync(path.join(tempDir, key), payload);
      fs.writeFileSync(path.join(tempDir, 'hash-index.json'), JSON.stringify({ [hash]: key }));
      const provider = new LocalFileSystemProvider({ basePath: tempDir });

      await provider.store(payload, { contentType: 'audio/wav', mediaType: 'audio' });

      expect(fs.readFileSync(contentPath, 'utf8')).toBe('legacy metadata');
      await expect(provider.getStats()).resolves.toEqual({
        fileCount: 1,
        totalSizeBytes: payload.length,
      });
      await provider.delete(key);
      expect(fs.existsSync(sidecarPath)).toBe(sidecarType === 'directory');
      if (sidecarType === 'directory') {
        expect(fs.readFileSync(contentPath, 'utf8')).toBe('legacy metadata');
      }
      await expect(provider.getStats()).resolves.toEqual({ fileCount: 0, totalSizeBytes: 0 });
      await expect(provider.exists(key)).resolves.toBe(false);
      await expect(provider.findByHash(hash)).resolves.toBeNull();
    },
  );
});
