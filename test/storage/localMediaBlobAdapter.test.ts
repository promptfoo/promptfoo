import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetBlobStorageProvider, setBlobStorageProvider } from '../../src/blobs';
import { mediaRouter } from '../../src/server/routes/media';
import { getMediaStorage, resetMediaStorage, setMediaStorage, storeMedia } from '../../src/storage';
import { LocalFileSystemProvider } from '../../src/storage/localFileSystemProvider';
import { createTempDir, removeTempDir } from '../util/utils';

import type { BlobStorageProvider } from '../../src/blobs/types';
import type { MediaStorageProvider } from '../../src/storage/types';

let directory: string;
let provider: LocalFileSystemProvider;
const payload = Buffer.from('media adapter bytes');
const hash = createHash('sha256').update(payload).digest('hex');
const key = `blob/${hash}`;
const metadata = { contentType: 'image/jpg', mediaType: 'image' as const, originalText: 'literal' };
const app = express().use('/api/media', mediaRouter);

beforeEach(() => {
  directory = createTempDir('promptfoo-media-adapter-');
  provider = new LocalFileSystemProvider({ basePath: directory });
  setMediaStorage(provider);
});

afterEach(() => {
  resetMediaStorage();
  resetBlobStorageProvider();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  removeTempDir(directory);
});

async function writeLegacy() {
  const legacyKey = `image/${hash.slice(0, 12)}.jpg`;
  await fs.mkdir(path.join(directory, 'image'), { recursive: true });
  await fs.writeFile(path.join(directory, legacyKey), payload);
  await fs.writeFile(
    path.join(directory, 'hash-index.json'),
    JSON.stringify({ [hash]: legacyKey }),
  );
  provider = new LocalFileSystemProvider({ basePath: directory });
  setMediaStorage(provider);
  return legacyKey;
}

describe('local media blob adapter', () => {
  it('returns usable file URLs for blob and legacy media in paths with reserved characters', async () => {
    const configuredPath = path.join(directory, 'media with spaces #100%');
    const configuredProvider = new LocalFileSystemProvider({ basePath: configuredPath });
    const { ref } = await configuredProvider.store(payload, metadata);
    const legacyKey = `image/${hash.slice(0, 12)}.jpg`;
    await fs.mkdir(path.join(configuredPath, 'image'));
    await fs.writeFile(path.join(configuredPath, legacyKey), payload);

    for (const storageKey of [ref.key, legacyKey]) {
      const url = await configuredProvider.getUrl(storageKey);
      expect(url).not.toBeNull();
      expect(url).toContain('media%20with%20spaces%20%23100%25/');
      expect(await fs.readFile(fileURLToPath(url!))).toEqual(payload);
    }
  });

  it('serves uppercase blob hashes through media and info routes', async () => {
    await provider.store(payload, metadata);
    const uppercaseKey = `blob/${hash.toUpperCase()}`;
    const response = await request(app).get(`/api/media/${uppercaseKey}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual(payload);
    expect(response.headers['content-type']).toBe('image/jpeg');
    const info = await request(app).get(`/api/media/info/${uppercaseKey}`);
    expect(info.status).toBe(200);
    expect(info.body.data.key).toBe(key);
    expect(await fs.readFile(fileURLToPath(info.body.data.url))).toEqual(payload);
  });

  it('excludes abandoned blob staging directories without excluding legacy files', async () => {
    await provider.store(payload, metadata);
    const storedPath = fileURLToPath((await provider.getUrl(key))!);
    const staging = await fs.mkdtemp(`${storedPath}.`);
    await fs.writeFile(path.join(staging, 'data'), payload);
    await fs.writeFile(path.join(staging, 'metadata.json'), '{}');
    const legacyDirectory = path.join(directory, 'image', `${hash}.legacy`);
    await fs.mkdir(legacyDirectory, { recursive: true });
    await fs.writeFile(path.join(legacyDirectory, 'kept.png'), payload);
    expect(await provider.getStats()).toEqual({ fileCount: 2, totalSizeBytes: payload.length * 2 });
    await provider.delete(key);
    expect(await provider.getStats()).toEqual({ fileCount: 1, totalSizeBytes: payload.length });
    expect(await fs.readFile(path.join(staging, 'data'))).toEqual(payload);
  });

  it.each(['delete', 'stale lookup'] as const)(
    'preserves later legacy index entries during %s from an older snapshot',
    async (operation) => {
      const legacyKey = await writeLegacy();
      const laterPayload = Buffer.from('later legacy content');
      const laterHash = createHash('sha256').update(laterPayload).digest('hex');
      const laterKey = `image/${laterHash.slice(0, 12)}.jpg`;
      await fs.writeFile(path.join(directory, laterKey), laterPayload);
      const indexPath = path.join(directory, 'hash-index.json');
      const laterIndex = JSON.stringify({ [hash]: legacyKey, [laterHash]: laterKey });
      await fs.writeFile(indexPath, laterIndex);

      if (operation === 'delete') {
        await provider.delete(legacyKey);
      } else {
        await fs.unlink(path.join(directory, legacyKey));
        expect(await provider.findByHash(hash)).toBeNull();
      }

      expect(await fs.readFile(indexPath, 'utf8')).toBe(laterIndex);
      const restarted = new LocalFileSystemProvider({ basePath: directory });
      expect(await restarted.findByHash(laterHash)).toBe(laterKey);
      expect(await restarted.retrieve(laterKey)).toEqual(laterPayload);
      expect(await restarted.findByHash(hash)).toBeNull();
      const replacement = await restarted.store(payload, metadata);
      expect(replacement.ref.key).toBe(key);
      expect(replacement.deduplicated).toBe(false);
      expect(await restarted.findByHash(hash)).toBe(key);
      expect(await fs.readFile(indexPath, 'utf8')).toBe(laterIndex);
    },
  );

  it('preserves the legacy index when deleting the data fails', async () => {
    const legacyKey = await writeLegacy();
    const indexPath = path.join(directory, 'hash-index.json');
    const originalIndex = await fs.readFile(indexPath, 'utf8');
    const legacyPath = path.join(directory, legacyKey);
    await fs.unlink(legacyPath);
    await fs.mkdir(legacyPath);

    await expect(provider.delete(legacyKey)).rejects.toMatchObject({
      code: expect.stringMatching(/^(EISDIR|EPERM)$/),
    });
    expect(await fs.readFile(indexPath, 'utf8')).toBe(originalIndex);
    expect((await fs.stat(legacyPath)).isDirectory()).toBe(true);
  });

  it('stores new bytes by full hash and preserves the media reference metadata', async () => {
    const first = await storeMedia(payload, metadata);
    expect(first).toEqual({
      ref: {
        provider: 'local',
        key,
        contentHash: hash,
        metadata: { ...metadata, sizeBytes: payload.length, contentHash: hash },
      },
      deduplicated: false,
    });
    expect(await provider.retrieve(key)).toEqual(payload);
    const url = await provider.getUrl(key);
    expect(url).toMatch(/^file:\/\//);
    expect(await fs.readFile(fileURLToPath(url!))).toEqual(payload);
    expect(fileURLToPath(url!)).toContain(`${path.sep}blob-data${path.sep}`);
    expect(await provider.getStats()).toEqual({ fileCount: 1, totalSizeBytes: payload.length });
  });

  it('deduplicates across restart without a new hash-index entry and keeps caller metadata', async () => {
    await provider.store(payload, metadata);
    await fs.rm(path.join(directory, 'hash-index.json'), { force: true });
    const restarted = new LocalFileSystemProvider({ basePath: directory });
    expect(await restarted.findByHash(hash)).toBe(key);
    const later = { contentType: 'video/mp4', mediaType: 'video' as const, evalId: 'later' };
    expect(await restarted.store(payload, later)).toEqual({
      ref: { provider: 'local', key, contentHash: hash, metadata: later },
      deduplicated: true,
    });
    const response = await request(app).get(`/api/media/${key}`);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('image/jpeg');
    expect(response.headers['content-disposition']).toBeUndefined();
  });

  it('retains legacy files, cross-MIME deduplication, info URLs and sidecar cleanup', async () => {
    const legacyKey = await writeLegacy();
    const result = await provider.store(payload, { contentType: 'video/mp4', mediaType: 'video' });
    expect(result.ref.key).toBe(legacyKey);
    expect(result.deduplicated).toBe(true);
    expect(await provider.retrieve(legacyKey)).toEqual(payload);
    const response = await request(app).get(`/api/media/${legacyKey}`);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('image/jpeg');
    const info = await request(app).get(`/api/media/info/${legacyKey}`);
    expect(info.status).toBe(200);
    expect(await fs.readFile(fileURLToPath(info.body.data.url))).toEqual(payload);
    await fs.writeFile(`${path.join(directory, legacyKey)}.meta.json`, '{}');
    await provider.delete(legacyKey);
    expect(await provider.exists(legacyKey)).toBe(false);
    await expect(fs.stat(`${path.join(directory, legacyKey)}.meta.json`)).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it.each(['audio/mp3', 'image/jpg', 'video/webm', 'video/ogg', 'text/html', 'image/svg+xml'])(
    'serves %s through the new media route with safe headers',
    async (contentType) => {
      await provider.store(payload, { ...metadata, contentType });
      const response = await request(app).get(`/api/media/${key}`);
      expect(response.status).toBe(200);
      const expected =
        contentType === 'audio/mp3'
          ? 'audio/mpeg'
          : contentType === 'image/jpg'
            ? 'image/jpeg'
            : contentType;
      expect(response.headers['content-type']).toContain(expected);
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      expect(response.headers['content-disposition']).toBe(
        contentType === 'text/html' || contentType === 'image/svg+xml' ? 'attachment' : undefined,
      );
      const info = await request(app).get(`/api/media/info/${key}`);
      expect(info.status).toBe(200);
      expect(await fs.readFile(fileURLToPath(info.body.data.url))).toEqual(payload);
    },
  );

  it('keeps new bytes under PROMPTFOO_MEDIA_PATH and ignores the global blob override', async () => {
    const globalBlob = {
      store: vi.fn(() => {
        throw new Error('wrong owner');
      }),
    } as unknown as BlobStorageProvider;
    setBlobStorageProvider(globalBlob);
    vi.stubEnv('PROMPTFOO_MEDIA_PATH', path.join(directory, 'configured'));
    resetMediaStorage();
    const result = await storeMedia(payload, metadata);
    expect(result.ref.key).toBe(key);
    expect(fileURLToPath((await getMediaStorage().getUrl(key))!)).toContain(
      path.join(directory, 'configured', 'blob-data'),
    );
    expect(globalBlob.store).not.toHaveBeenCalled();
  });

  it.each(['data', 'metadata'] as const)('propagates new %s deletion errors', async (target) => {
    await provider.store(payload, metadata);
    const filePath = fileURLToPath((await provider.getUrl(key))!);
    const failedPath = target === 'data' ? filePath : `${filePath}.meta.json`;
    await fs.unlink(failedPath);
    await fs.mkdir(failedPath);
    await expect(provider.delete(key)).rejects.toMatchObject({
      code: expect.stringMatching(/^(EISDIR|EPERM|EACCES)$/),
    });
  });

  it('rejects invalid blob keys without reading outside the owned directory', async () => {
    await provider.store(payload, metadata);
    for (const invalid of [
      'blob/../hash-index.json',
      `blob/${hash}.png`,
      'blob/abc',
      `blob/${'g'.repeat(64)}`,
    ]) {
      expect(await provider.exists(invalid)).toBe(false);
      await expect(provider.retrieve(invalid)).rejects.toThrow();
      const response = await request(app).get(`/api/media/${invalid}`);
      expect([400, 404]).toContain(response.status);
    }
    expect(await provider.retrieve(key)).toEqual(payload);
  });

  it('uses a custom media owner for blob keys without requiring a new method', async () => {
    const custom = {
      providerId: 'custom',
      exists: vi.fn().mockResolvedValue(true),
      retrieve: vi.fn().mockResolvedValue(payload),
      getUrl: vi.fn().mockResolvedValue('https://example.test/media'),
    } as unknown as MediaStorageProvider;
    setMediaStorage(custom);
    const response = await request(app).get(`/api/media/${key}`);
    expect(response.status).toBe(200);
    expect(custom.retrieve).toHaveBeenCalledWith(key);
    expect(response.headers['content-type']).toBe('application/octet-stream');
    expect(response.headers['content-disposition']).toBe('attachment');
  });

  it('deduplicates concurrent instances to one file and retains the persisted MIME on later writes', async () => {
    const second = new LocalFileSystemProvider({ basePath: directory });
    const inputs = [
      metadata,
      { ...metadata, contentType: 'video/mp4', mediaType: 'video' as const },
    ];
    const refs = await Promise.all(
      inputs.map((value, index) => (index ? second : provider).store(payload, value)),
    );
    expect(refs.map((result) => result.ref.key)).toEqual([key, key]);
    expect(refs.map((result) => result.ref.metadata.originalText)).toEqual(['literal', 'literal']);
    const first = await provider.retrieveWithMetadata(key);
    expect(['image/jpeg', 'video/mp4']).toContain(first.contentType);
    expect(first.data).toEqual(payload);
    await new LocalFileSystemProvider({ basePath: directory }).store(payload, {
      ...metadata,
      contentType: 'text/html',
    });
    expect((await provider.retrieveWithMetadata(key)).contentType).toBe(first.contentType);
    expect(await provider.getStats()).toEqual({ fileCount: 1, totalSizeBytes: payload.length });
  });

  it('treats persisted MIME as untrusted and never follows a sidecar file path', async () => {
    await provider.store(payload, metadata);
    const filePath = fileURLToPath((await provider.getUrl(key))!);
    const protectedPath = path.join(directory, 'protected.txt');
    await fs.writeFile(protectedPath, 'retained');
    await fs.writeFile(
      `${filePath}.meta.json`,
      JSON.stringify({
        mimeType: 'image/png\r\nInjected: value',
        sizeBytes: 1,
        key: protectedPath,
      }),
    );
    const response = await request(app).get(`/api/media/${key}`);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/octet-stream');
    expect(response.headers['content-length']).toBe(String(payload.length));
    expect(response.headers['content-disposition']).toBe('attachment');
    expect(fileURLToPath((await provider.getUrl(key))!)).toBe(filePath);
    await provider.delete(key);
    expect(await fs.readFile(protectedPath, 'utf8')).toBe('retained');
    expect(await provider.exists(key)).toBe(false);
    await expect(provider.delete(key)).resolves.toBeUndefined();
  });

  it.each(['missing', 'malformed'] as const)(
    'does not cache fallback headers before repairing %s metadata',
    async (state) => {
      await provider.store(payload, metadata);
      const filePath = fileURLToPath((await provider.getUrl(key))!);
      if (state === 'missing') {
        await fs.unlink(`${filePath}.meta.json`);
      } else {
        await fs.writeFile(`${filePath}.meta.json`, 'not json');
      }
      const response = await request(app).get(`/api/media/${key}`);
      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/octet-stream');
      expect(response.headers['content-disposition']).toBe('attachment');
      expect(response.headers['content-length']).toBe(String(payload.length));
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body).toEqual(payload);

      await provider.store(payload, metadata);
      const repaired = await request(app).get(`/api/media/${key}`);
      expect(repaired.status).toBe(200);
      expect(repaired.headers['content-type']).toBe('image/jpeg');
      expect(repaired.headers['content-disposition']).toBeUndefined();
      expect(repaired.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      expect(repaired.body).toEqual(payload);
    },
  );

  it('ignores a stale legacy index and keeps valid old lookup entries', async () => {
    await fs.writeFile(
      path.join(directory, 'hash-index.json'),
      JSON.stringify({ [hash]: `image/${hash.slice(0, 12)}.jpg` }),
    );
    const restarted = new LocalFileSystemProvider({ basePath: directory });
    const originalIndex = await fs.readFile(path.join(directory, 'hash-index.json'), 'utf8');
    const result = await restarted.store(payload, metadata);
    expect(await fs.readFile(path.join(directory, 'hash-index.json'), 'utf8')).toBe(originalIndex);
    expect(result.ref.key).toBe(key);
    expect(await restarted.findByHash(hash)).toBe(key);
    expect(await restarted.retrieve(key)).toEqual(payload);
  });
});
