import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { FilesystemBlobStorageProvider } from '../../src/blobs/filesystemProvider';

function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('FilesystemBlobStorageProvider', () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
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
});
