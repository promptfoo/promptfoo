import { createHash } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disableCache, enableCache } from '../../src/cache';
import { getProviderFileFromCloud, type ProviderFileMetadata } from '../../src/util/cloud';
import { setConfigDirectoryPath } from '../../src/util/config/manage';
import {
  cacheProviderFile,
  getCachedProviderFile,
  getOrDownloadProviderFile,
  resolveProviderFileProviderId,
} from '../../src/util/providerFileCache';

vi.mock('../../src/util/cloud', async () => {
  const actual =
    await vi.importActual<typeof import('../../src/util/cloud')>('../../src/util/cloud');
  return {
    ...actual,
    getProviderFileFromCloud: vi.fn(),
  };
});

function sha256(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

function providerFile(content: string, language: 'javascript' | 'python' = 'python') {
  const extension = language === 'python' ? 'py' : 'js';
  return {
    id: 'file-123',
    filename: `provider.${extension}`,
    language,
    contentType: language === 'python' ? 'text/x-python' : 'text/javascript',
    sizeBytes: content.length,
    checksumSha256: sha256(content),
    description: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    content,
  };
}

describe('providerFileCache', () => {
  let tempConfigDir: string;

  beforeEach(() => {
    tempConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-provider-cache-test-'));
    setConfigDirectoryPath(tempConfigDir);
    enableCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    enableCache();
    setConfigDirectoryPath(undefined);
    fs.rmSync(tempConfigDir, { recursive: true, force: true });
  });

  it('caches downloaded provider files by checksum and reuses metadata cache hits', async () => {
    const file = providerFile(
      'def call_api(prompt, options, context):\n    return {"output": prompt}\n',
    );
    const { content: _content, ...metadata } = file;

    vi.mocked(getProviderFileFromCloud).mockResolvedValue(file);

    const downloadedPath = await getOrDownloadProviderFile('provider-123', metadata);

    expect(downloadedPath).toBe(
      path.join(tempConfigDir, 'provider-files', `${file.checksumSha256}.py`),
    );
    expect(fs.readFileSync(downloadedPath!, 'utf-8')).toBe(file.content);
    expect(getProviderFileFromCloud).toHaveBeenCalledTimes(1);

    vi.mocked(getProviderFileFromCloud).mockClear();

    await expect(getOrDownloadProviderFile('provider-123', metadata)).resolves.toBe(downloadedPath);
    expect(getProviderFileFromCloud).not.toHaveBeenCalled();
  });

  it('ignores cached provider files whose content no longer matches the checksum', async () => {
    const file = providerFile(
      'def call_api(prompt, options, context):\n    return {"output": prompt}\n',
    );
    const { content: _content, ...metadata } = file;
    const cachedPath = cacheProviderFile('tampered content', file.checksumSha256, 'py');

    vi.mocked(getProviderFileFromCloud).mockResolvedValue(file);

    await expect(getOrDownloadProviderFile('provider-123', metadata)).resolves.toBe(cachedPath);
    expect(getProviderFileFromCloud).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync(cachedPath, 'utf-8')).toBe(file.content);
  });

  it('writes a temporary provider file when the cache is disabled', async () => {
    const file = providerFile('module.exports = class CustomProvider {};', 'javascript');
    const { content: _content, ...metadata } = file;

    disableCache();
    vi.mocked(getProviderFileFromCloud).mockResolvedValue(file);

    const downloadedPath = await getOrDownloadProviderFile('provider-123', metadata);

    expect(downloadedPath).toContain(path.join(os.tmpdir(), 'promptfoo-provider-file-'));
    expect(downloadedPath).not.toContain(path.join(tempConfigDir, 'provider-files'));
    expect(fs.readFileSync(downloadedPath!, 'utf-8')).toBe(file.content);

    fs.rmSync(path.dirname(downloadedPath!), { recursive: true, force: true });
  });

  it('rejects invalid checksums and extensions before constructing cache paths', () => {
    expect(() => getCachedProviderFile('abc123', 'py')).toThrow('Invalid checksum format');
    expect(() => cacheProviderFile('content', 'a'.repeat(64), '../provider')).toThrow(
      'Invalid provider file extension',
    );
  });

  it('throws when downloaded file content does not match the expected checksum', async () => {
    const file = {
      ...providerFile('safe content'),
      checksumSha256: 'f'.repeat(64),
    };
    vi.mocked(getProviderFileFromCloud).mockResolvedValue(file);

    await expect(
      getOrDownloadProviderFile('provider-123', {
        ...file,
        content: undefined,
      } as unknown as ProviderFileMetadata),
    ).rejects.toThrow('Checksum mismatch');
  });

  it('preserves Python function suffixes when resolving uploaded provider files', async () => {
    const file = providerFile(
      'def generate(prompt, options, context):\n    return {"output": prompt}\n',
    );
    const { content: _content, ...metadata } = file;

    vi.mocked(getProviderFileFromCloud).mockResolvedValue(file);

    await expect(
      resolveProviderFileProviderId('provider-123', 'file://cloud-provider.py:generate', metadata),
    ).resolves.toBe(
      `file://${path.join(tempConfigDir, 'provider-files', `${file.checksumSha256}.py`)}:generate`,
    );
  });
});
