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
    const contentHash = createHash('sha256').update(payload).digest('hex');
    const { ref } = await provider.store(payload, {
      contentType: 'audio/wav',
      mediaType: 'audio',
    });

    expect(ref.key).toBe(`audio/${contentHash}.wav`);
    const retrieved = await provider.retrieve(ref.key);
    expect(retrieved.toString('utf8')).toBe('hello');

    const duplicate = await provider.store(payload, {
      contentType: 'audio/wav',
      mediaType: 'audio',
    });
    expect(duplicate.deduplicated).toBe(true);
    expect(duplicate.ref.key).toBe(ref.key);
  });

  it('preserves valid legacy hash-index entries without renaming files', async () => {
    tempDir = createTempDir('promptfoo-media-');
    const payload = Buffer.from('legacy media');
    const contentHash = createHash('sha256').update(payload).digest('hex');
    const legacyKey = `audio/${contentHash.slice(0, 12)}.wav`;
    const legacyPath = path.join(tempDir, legacyKey);

    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(legacyPath, payload);
    fs.writeFileSync(`${legacyPath}.meta.json`, JSON.stringify({ contentHash }));
    fs.writeFileSync(
      path.join(tempDir, 'hash-index.json'),
      JSON.stringify({ [contentHash]: legacyKey }),
    );

    const provider = new LocalFileSystemProvider({ basePath: tempDir });
    const result = await provider.store(payload, {
      contentType: 'audio/wav',
      mediaType: 'audio',
    });

    expect(result.deduplicated).toBe(true);
    expect(result.ref.key).toBe(legacyKey);
    expect(await provider.retrieve(legacyKey)).toEqual(payload);
    expect(fs.existsSync(path.join(tempDir, 'audio', `${contentHash}.wav`))).toBe(false);
  });

  it('recovers from a legacy hash-index entry whose file was overwritten', async () => {
    tempDir = createTempDir('promptfoo-media-');
    const payload = Buffer.from('original media');
    const overwrittenPayload = Buffer.from('collision replacement');
    const contentHash = createHash('sha256').update(payload).digest('hex');
    const overwrittenHash = `${contentHash.slice(0, 12)}${'f'.repeat(52)}`;
    const legacyKey = `audio/${contentHash.slice(0, 12)}.wav`;
    const legacyPath = path.join(tempDir, legacyKey);

    fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
    fs.writeFileSync(legacyPath, overwrittenPayload);
    fs.writeFileSync(`${legacyPath}.meta.json`, JSON.stringify({ contentHash: overwrittenHash }));
    fs.writeFileSync(
      path.join(tempDir, 'hash-index.json'),
      JSON.stringify({ [contentHash]: legacyKey, [overwrittenHash]: legacyKey }),
    );

    const provider = new LocalFileSystemProvider({ basePath: tempDir });
    const result = await provider.store(payload, {
      contentType: 'audio/wav',
      mediaType: 'audio',
    });

    expect(result.deduplicated).toBe(false);
    expect(result.ref.key).toBe(`audio/${contentHash}.wav`);
    expect(await provider.retrieve(result.ref.key)).toEqual(payload);
    expect(fs.readFileSync(legacyPath)).toEqual(overwrittenPayload);

    const hashIndex = JSON.parse(
      fs.readFileSync(path.join(tempDir, 'hash-index.json'), 'utf8'),
    ) as Record<string, string>;
    expect(hashIndex[contentHash]).toBe(result.ref.key);
    expect(hashIndex[overwrittenHash]).toBe(legacyKey);
  });
});
