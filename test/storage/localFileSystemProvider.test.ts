import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { LocalFileSystemProvider } from '../../src/storage/localFileSystemProvider';
import { createTempDir, removeTempDir } from '../util/utils';

describe('LocalFileSystemProvider', () => {
  let tempDir: string | undefined;
  const extraFilesToCleanup: string[] = [];

  afterEach(() => {
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
  });
  it.each([
    ['audio', 'audio/wav', 'wav'],
    ['image', 'image/png', 'png'],
    ['video', 'video/mp4', 'mp4'],
  ] as const)(
    'stores %s when the unused sidecar path is a directory',
    async (mediaType, contentType, extension) => {
      tempDir = createTempDir('promptfoo-media-');
      const provider = new LocalFileSystemProvider({ basePath: tempDir });
      const payload = Buffer.from(`${mediaType} payload`);
      const contentHash = createHash('sha256').update(payload).digest('hex');
      const key = `${mediaType}/${contentHash.slice(0, 12)}.${extension}`;
      const sidecarPath = path.join(tempDir, `${key}.meta.json`);
      fs.mkdirSync(sidecarPath, { recursive: true });
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
    },
  );

  it('keeps existing legacy sidecars until the corresponding media is deleted', async () => {
    tempDir = createTempDir('promptfoo-media-');
    const provider = new LocalFileSystemProvider({ basePath: tempDir });
    const payload = Buffer.from('legacy media');
    const hash = createHash('sha256').update(payload).digest('hex');
    const key = `audio/${hash.slice(0, 12)}.wav`;
    const sidecarPath = path.join(tempDir, `${key}.meta.json`);
    fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
    fs.writeFileSync(sidecarPath, 'legacy metadata', 'utf8');

    await provider.store(payload, { contentType: 'audio/wav', mediaType: 'audio' });

    expect(fs.readFileSync(sidecarPath, 'utf8')).toBe('legacy metadata');
    await provider.delete(key);
    expect(fs.existsSync(sidecarPath)).toBe(false);
    await expect(provider.exists(key)).resolves.toBe(false);
    await expect(provider.findByHash(hash)).resolves.toBeNull();
  });
});
