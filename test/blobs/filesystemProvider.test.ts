import * as fs from 'node:fs/promises';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { FilesystemBlobStorageProvider } from '../../src/blobs/filesystemProvider';
import { createTempDir, removeTempDir } from '../util/utils';

describe('FilesystemBlobStorageProvider', () => {
  let tempDir: string | undefined;

  afterEach(() => {
    removeTempDir(tempDir);
    tempDir = undefined;
  });

  it('stores and retrieves blobs by hash', async () => {
    tempDir = createTempDir('promptfoo-blobs-');
    const provider = new FilesystemBlobStorageProvider({ basePath: tempDir });

    const data = Buffer.from('blob-data');
    const { ref } = await provider.store(data, 'application/octet-stream');

    const stored = await provider.getByHash(ref.hash);
    expect(stored.data.toString('utf8')).toBe('blob-data');
  });

  it('deduplicates identical blobs', async () => {
    tempDir = createTempDir('promptfoo-blobs-');
    const provider = new FilesystemBlobStorageProvider({ basePath: tempDir });

    const data = Buffer.from('same');
    const first = await provider.store(data, 'application/octet-stream');
    const second = await provider.store(data, 'application/octet-stream');

    expect(first.ref.hash).toBe(second.ref.hash);
    expect(second.deduplicated).toBe(true);
  });

  it('rejects invalid hashes and prevents path traversal', async () => {
    tempDir = createTempDir('promptfoo-blobs-');
    const provider = new FilesystemBlobStorageProvider({ basePath: tempDir });

    await expect(provider.exists('../../etc/passwd')).resolves.toBe(false);
    await expect(provider.getByHash('../../etc/passwd')).rejects.toThrow(/invalid blob hash/i);
  });
  it.each(['data', 'metadata'] as const)(
    'reports a real %s deletion error',
    async (failureTarget) => {
      tempDir = createTempDir('promptfoo-blobs-');
      const provider = new FilesystemBlobStorageProvider({ basePath: tempDir });
      const { ref } = await provider.store(Buffer.from('data'), 'text/plain');
      const filePath = path.join(tempDir, ref.hash.slice(0, 2), ref.hash.slice(2, 4), ref.hash);
      const metadataPath = `${filePath}.meta.json`;
      const failingPath = failureTarget === 'data' ? filePath : metadataPath;
      await fs.unlink(failingPath);
      await fs.mkdir(failingPath);

      await expect(provider.deleteByHash(ref.hash)).rejects.toMatchObject({
        code: expect.stringMatching(/^(EISDIR|EPERM|EACCES)$/),
      });
      expect((await fs.stat(failingPath)).isDirectory()).toBe(true);
      if (failureTarget === 'data') {
        expect(JSON.parse(await fs.readFile(metadataPath, 'utf8')).mimeType).toBe('text/plain');
      } else {
        await expect(fs.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
      }
    },
  );

  it.each(['none', 'data', 'metadata'] as const)(
    'deletes remaining files when %s is already missing',
    async (missing) => {
      tempDir = createTempDir('promptfoo-blobs-');
      const provider = new FilesystemBlobStorageProvider({ basePath: tempDir });
      const { ref } = await provider.store(Buffer.from('data'), 'text/plain');
      const filePath = path.join(tempDir, ref.hash.slice(0, 2), ref.hash.slice(2, 4), ref.hash);
      const metadataPath = `${filePath}.meta.json`;
      if (missing !== 'none') {
        await fs.unlink(missing === 'data' ? filePath : metadataPath);
      }

      await expect(provider.deleteByHash(ref.hash)).resolves.toBeUndefined();
      await expect(fs.stat(filePath)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(fs.stat(metadataPath)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(provider.deleteByHash(ref.hash)).resolves.toBeUndefined();
    },
  );

  it('keeps invalid-hash deletion a no-op without touching other files', async () => {
    tempDir = createTempDir('promptfoo-blobs-');
    const basePath = path.join(tempDir, 'blobs');
    const provider = new FilesystemBlobStorageProvider({ basePath });
    const protectedPath = path.join(tempDir, 'protected');
    await fs.writeFile(protectedPath, 'retained');

    for (const hash of [
      '../protected',
      protectedPath,
      '',
      'not-a-hash',
      'a'.repeat(63),
      'g'.repeat(64),
    ]) {
      await expect(provider.deleteByHash(hash)).resolves.toBeUndefined();
    }
    expect(await fs.readFile(protectedPath, 'utf8')).toBe('retained');
  });
});
