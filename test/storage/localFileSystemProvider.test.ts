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

  it.each(['file', 'directory', 'missing directory'] as const)(
    'rejects legacy media reached through a %s symlink',
    async (kind) => {
      tempDir = createTempDir('promptfoo-media-links-');
      const mediaPath = path.join(tempDir, 'media');
      const fixturePath = path.join(tempDir, 'fixture');
      const key = 'audio/abcdef123456.wav';
      fs.mkdirSync(fixturePath);
      const payloadPath = path.join(fixturePath, 'abcdef123456.wav');
      fs.writeFileSync(payloadPath, 'fixture bytes');
      fs.writeFileSync(`${payloadPath}.meta.json`, 'fixture metadata');
      const provider = new LocalFileSystemProvider({ basePath: mediaPath });
      if (kind === 'file') {
        fs.mkdirSync(path.join(mediaPath, 'audio'));
        fs.symlinkSync(payloadPath, path.join(mediaPath, key), 'file');
      } else {
        fs.symlinkSync(
          kind === 'directory' ? fixturePath : path.join(tempDir, 'missing'),
          path.join(mediaPath, 'audio'),
          'junction',
        );
      }

      await expect(provider.retrieve(key)).rejects.toThrow(/symbolic links/i);
      await expect(provider.retrieveWithMetadata(key)).rejects.toThrow(/symbolic links/i);
      await expect(provider.exists(key)).resolves.toBe(false);
      await expect(provider.getUrl(key)).resolves.toBeNull();
      await expect(provider.delete(key)).rejects.toThrow(/symbolic links/i);
      await expect(provider.getStats()).resolves.toEqual({ fileCount: 0, totalSizeBytes: 0 });
      expect(fs.readFileSync(payloadPath, 'utf8')).toBe('fixture bytes');
      expect(fs.readFileSync(`${payloadPath}.meta.json`, 'utf8')).toBe('fixture metadata');
    },
  );

  it('rejects symlinked legacy sidecars before deleting media', async () => {
    tempDir = createTempDir('promptfoo-media-sidecar-link-');
    const mediaPath = path.join(tempDir, 'media');
    const fixturePath = path.join(tempDir, 'fixture.json');
    fs.writeFileSync(fixturePath, '{}');
    const provider = new LocalFileSystemProvider({ basePath: mediaPath });
    const key = 'legacy.json';
    fs.writeFileSync(path.join(mediaPath, key), 'media bytes');
    fs.symlinkSync(fixturePath, path.join(mediaPath, `${key}.meta.json`), 'file');

    await expect(provider.delete(key)).rejects.toThrow(/symbolic links/i);
    await expect(provider.retrieve(key)).resolves.toEqual(Buffer.from('media bytes'));
    expect(fs.readFileSync(fixturePath, 'utf8')).toBe('{}');
  });

  it('supports a configured root symlink and missing legacy media', async () => {
    tempDir = createTempDir('promptfoo-media-root-link-');
    const mediaPath = path.join(tempDir, 'media');
    const configuredPath = path.join(tempDir, 'configured');
    fs.mkdirSync(mediaPath);
    fs.symlinkSync(mediaPath, configuredPath, 'junction');
    const key = 'legacy.json';
    const payload = Buffer.from('{"message":"legacy content"}');
    fs.writeFileSync(path.join(mediaPath, key), payload);
    const provider = new LocalFileSystemProvider({ basePath: configuredPath });

    await expect(provider.retrieve(key)).resolves.toEqual(payload);
    await expect(provider.exists(key)).resolves.toBe(true);
    await expect(provider.getUrl(key)).resolves.toMatch(/^file:.*legacy\.json$/);
    await expect(provider.getStats()).resolves.toEqual({
      fileCount: 1,
      totalSizeBytes: payload.length,
    });
    await provider.delete(key);
    await expect(provider.retrieve(key)).rejects.toThrow('Media not found');
    await expect(provider.exists(key)).resolves.toBe(false);
    await expect(provider.getUrl(key)).resolves.toBeNull();
    await expect(provider.delete(key)).resolves.toBeUndefined();
    await expect(provider.delete('missing/nested.json')).resolves.toBeUndefined();
  });

  it('supports native path aliases such as Windows short directory names', async () => {
    tempDir = createTempDir('promptfoo-media-native-path-');
    const aliasPath = path.join(tempDir, 'MEDIA~1');
    const mediaPath = path.join(tempDir, 'media with spaces #100%');
    fs.mkdirSync(aliasPath);
    fs.mkdirSync(mediaPath);
    const canonicalRoot = fs.realpathSync.native(mediaPath);
    const key = 'legacy.json';
    const payload = Buffer.from('{"message":"legacy content"}');
    fs.writeFileSync(path.join(canonicalRoot, key), payload);

    // Model native short-name expansion without requiring a Windows filesystem.
    vi.spyOn(fs.realpathSync, 'native').mockReturnValueOnce(canonicalRoot);
    const realpath = fsPromises.realpath;
    vi.spyOn(fsPromises, 'realpath').mockImplementation(async (filePath, options) =>
      filePath === aliasPath && options === undefined ? canonicalRoot : realpath(filePath, options),
    );
    const provider = new LocalFileSystemProvider({ basePath: aliasPath });

    await expect(provider.exists(key)).resolves.toBe(true);
    await expect(provider.retrieve(key)).resolves.toEqual(payload);
    await expect(provider.getUrl(key)).resolves.toMatch(/^file:.*legacy\.json$/);
    await provider.delete(key);
    expect(fs.existsSync(path.join(canonicalRoot, key))).toBe(false);
  });

  it('counts legacy JSON content while excluding bookkeeping files and directories', async () => {
    tempDir = createTempDir('promptfoo-media-json-stats-');
    const provider = new LocalFileSystemProvider({ basePath: tempDir });
    const payload = Buffer.from('{"message":"legacy content"}');
    fs.mkdirSync(path.join(tempDir, 'legacy'));
    for (const key of ['content.json', 'legacy/hash-index.json', 'legacy/content.txt']) {
      fs.writeFileSync(path.join(tempDir, key), payload);
      await expect(provider.retrieve(key)).resolves.toEqual(payload);
    }
    fs.writeFileSync(path.join(tempDir, 'hash-index.json'), '{}');
    fs.writeFileSync(path.join(tempDir, 'content.json.meta.json'), '{}');
    const sidecarDirectory = path.join(tempDir, 'directory.meta.json');
    fs.mkdirSync(sidecarDirectory);
    fs.writeFileSync(path.join(sidecarDirectory, 'unrelated.json'), payload);
    await provider.store(Buffer.from('blob bytes'), {
      contentType: 'audio/wav',
      mediaType: 'audio',
    });

    await expect(provider.getStats()).resolves.toEqual({
      fileCount: 4,
      totalSizeBytes: payload.length * 3 + Buffer.byteLength('blob bytes'),
    });
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
    'preserves legacy %s sidecar directories during deduplication and deletion',
    async (mediaType, contentType, extension) => {
      tempDir = createTempDir('promptfoo-media-');
      const payload = Buffer.from(`${mediaType} payload`);
      const contentHash = createHash('sha256').update(payload).digest('hex');
      const key = `${mediaType}/${contentHash.slice(0, 12)}.${extension}`;
      const sidecarPath = path.join(tempDir, `${key}.meta.json`);
      fs.mkdirSync(sidecarPath, { recursive: true });
      const unrelatedPath = path.join(sidecarPath, 'unrelated.txt');
      fs.writeFileSync(unrelatedPath, 'unrelated data', 'utf8');
      const nestedPath = path.join(sidecarPath, 'nested');
      fs.mkdirSync(nestedPath);
      fs.writeFileSync(path.join(nestedPath, 'payload.bin'), 'nested unrelated data');
      const metadata = { mediaType, contentType, evalId: 'test-eval', originalText: 'source text' };

      fs.writeFileSync(path.join(tempDir, key), payload);
      fs.writeFileSync(
        path.join(tempDir, 'hash-index.json'),
        JSON.stringify({ [contentHash]: key }),
      );
      const provider = new LocalFileSystemProvider({ basePath: tempDir });
      const stored = await provider.store(payload, metadata);

      expect(stored).toEqual({
        deduplicated: true,
        ref: {
          provider: 'local',
          key,
          contentHash,
          metadata,
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

  it.each(['direct', 'symlinked'] as const)(
    'propagates legacy sidecar deletion failures with a %s root',
    async (rootType) => {
      tempDir = createTempDir('promptfoo-media-');
      const mediaPath = path.join(tempDir, 'media');
      fs.mkdirSync(mediaPath);
      const basePath = rootType === 'symlinked' ? path.join(tempDir, 'alias') : mediaPath;
      if (rootType === 'symlinked') {
        fs.symlinkSync(mediaPath, basePath, 'junction');
      }
      const provider = new LocalFileSystemProvider({ basePath });
      const key = 'audio/abcdef123456.wav';
      const filePath = path.join(basePath, key);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, 'legacy media');
      const sidecarPath = `${filePath}.meta.json`;
      fs.writeFileSync(sidecarPath, 'legacy metadata', 'utf8');
      const canonicalSidecarPath = fs.realpathSync.native(sidecarPath);
      const failure = Object.assign(new Error('Access denied'), { code: 'EACCES' });
      const unlink = fsPromises.unlink;
      vi.spyOn(fsPromises, 'unlink').mockImplementation(async (filePath) => {
        if (filePath === canonicalSidecarPath) {
          throw failure;
        }
        return unlink(filePath);
      });

      await expect(provider.delete(key)).rejects.toBe(failure);
      expect(fs.readFileSync(sidecarPath, 'utf8')).toBe('legacy metadata');
    },
  );

  it('keeps existing legacy sidecars until the corresponding media is deleted', async () => {
    tempDir = createTempDir('promptfoo-media-');
    const payload = Buffer.from('legacy media');
    const hash = createHash('sha256').update(payload).digest('hex');
    const key = `audio/${hash.slice(0, 12)}.wav`;
    const sidecarPath = path.join(tempDir, `${key}.meta.json`);
    fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });
    fs.writeFileSync(sidecarPath, 'legacy metadata', 'utf8');

    fs.writeFileSync(path.join(tempDir, key), payload);
    fs.writeFileSync(path.join(tempDir, 'hash-index.json'), JSON.stringify({ [hash]: key }));
    const provider = new LocalFileSystemProvider({ basePath: tempDir });
    const result = await provider.store(payload, { contentType: 'audio/wav', mediaType: 'audio' });
    expect(result).toMatchObject({ ref: { key }, deduplicated: true });

    expect(fs.readFileSync(sidecarPath, 'utf8')).toBe('legacy metadata');
    await provider.delete(key);
    expect(fs.existsSync(sidecarPath)).toBe(false);
    await expect(provider.exists(key)).resolves.toBe(false);
    await expect(provider.findByHash(hash)).resolves.toBeNull();
  });
});
