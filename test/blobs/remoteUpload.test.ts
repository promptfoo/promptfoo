import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { shouldAttemptRemoteBlobUpload, uploadBlobRemote } from '../../src/blobs/remoteUpload';
import { getEnvBool } from '../../src/envars';
import { isLoggedIntoCloud } from '../../src/globalConfig/accounts';
import { cloudConfig } from '../../src/globalConfig/cloud';
import { fetchWithProxy } from '../../src/util/fetch/index';

vi.mock('../../src/envars', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/envars')>();
  return {
    ...actual,
    getEnvBool: vi.fn(),
  };
});

vi.mock('../../src/globalConfig/accounts', () => ({
  isLoggedIntoCloud: vi.fn(),
}));

vi.mock('../../src/globalConfig/cloud', () => ({
  cloudConfig: {
    getRequestConfig: vi.fn(),
  },
}));

vi.mock('../../src/util/fetch/index', () => ({
  fetchWithProxy: vi.fn(),
}));

describe('remote blob upload', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(getEnvBool).mockReturnValue(false);
    vi.mocked(isLoggedIntoCloud).mockReturnValue(true);
    vi.mocked(cloudConfig.getRequestConfig).mockReturnValue({
      apiHost: 'https://api.example.com',
      authHeaderName: 'Authorization',
      headers: { Authorization: 'Bearer test-api-key' },
      teamId: undefined,
    });
    vi.mocked(fetchWithProxy).mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => ({
        ref: {
          uri: 'promptfoo://blob/abc123',
          hash: 'abc123',
        },
      }),
    } as Response);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('attempts remote upload when sharing is enabled and Cloud auth is configured', () => {
    expect(shouldAttemptRemoteBlobUpload()).toBe(true);
    expect(cloudConfig.getRequestConfig).toHaveBeenCalledTimes(1);
  });

  it('does not attempt remote upload when PROMPTFOO_DISABLE_SHARING is set', async () => {
    vi.mocked(getEnvBool).mockImplementation((key) => key === 'PROMPTFOO_DISABLE_SHARING');

    expect(shouldAttemptRemoteBlobUpload()).toBe(false);

    const result = await uploadBlobRemote(Buffer.from('image-bytes'), 'image/png', {
      evalId: 'eval-123',
      location: 'response.output',
      kind: 'image',
    });

    expect(result).toBeNull();
    expect(cloudConfig.getRequestConfig).not.toHaveBeenCalled();
    expect(fetchWithProxy).not.toHaveBeenCalled();
  });

  it('does not attempt remote upload when Cloud auth is not configured', async () => {
    vi.mocked(cloudConfig.getRequestConfig).mockReturnValue({
      apiHost: 'https://api.example.com',
      authHeaderName: 'Authorization',
      headers: undefined,
      teamId: undefined,
    });

    expect(shouldAttemptRemoteBlobUpload()).toBe(false);

    const result = await uploadBlobRemote(Buffer.from('image-bytes'), 'image/png', {
      evalId: 'eval-123',
      location: 'response.output',
      kind: 'image',
    });

    expect(result).toBeNull();
    expect(fetchWithProxy).not.toHaveBeenCalled();
  });

  it('posts blobs to the Cloud blob endpoint when allowed', async () => {
    await uploadBlobRemote(Buffer.from('image-bytes'), 'image/png', {
      evalId: 'eval-123',
      location: 'response.output',
      kind: 'image',
    });

    expect(fetchWithProxy).toHaveBeenCalledWith(
      'https://api.example.com/api/blobs',
      expect.objectContaining({
        method: 'POST',
        skipCloudAuthInjection: true,
        headers: expect.objectContaining({
          Authorization: 'Bearer test-api-key',
          'Content-Type': 'application/json',
        }),
      }),
    );
    expect(cloudConfig.getRequestConfig).toHaveBeenCalledTimes(1);
  });

  it('posts blobs under a custom configured auth header name', async () => {
    vi.mocked(cloudConfig.getRequestConfig).mockReturnValueOnce({
      apiHost: 'https://custom.example.com',
      authHeaderName: 'X-Promptfoo-Api-Key',
      headers: { 'X-Promptfoo-Api-Key': 'Bearer test-api-key' },
      teamId: undefined,
    });

    await uploadBlobRemote(Buffer.from('image-bytes'), 'image/png', {
      evalId: 'eval-123',
      location: 'response.output',
      kind: 'image',
    });

    expect(fetchWithProxy).toHaveBeenCalledWith(
      'https://custom.example.com/api/blobs',
      expect.objectContaining({
        skipCloudAuthInjection: true,
        headers: expect.objectContaining({
          'X-Promptfoo-Api-Key': 'Bearer test-api-key',
        }),
      }),
    );
  });
});
