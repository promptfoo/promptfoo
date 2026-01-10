import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { LocalFileSystemProvider } from '../../src/storage/localFileSystemProvider';

function createTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

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

    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
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
});
