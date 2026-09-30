import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getShareAuthorizedBlob } from '../src/blobs';
import { cloudConfig } from '../src/globalConfig/cloud';
import { writeGlobalConfig } from '../src/globalConfig/globalConfig';
import {
  createShareableModelAuditUrl,
  createShareableUrl,
  hasEvalBeenShared,
  hasModelAuditBeenShared,
} from '../src/share';
import {
  checkCloudPermissions,
  getOrgContext,
  makeRequest,
  resolveCloudTeam,
} from '../src/util/cloud';
import { getConfigDirectoryPath, setConfigDirectoryPath } from '../src/util/config/manage';
import { fetchWithProxy } from '../src/util/fetch/index';
import { inlineBlobRefsForShare } from '../src/util/inlineBlobsForShare';
import { mockProcessEnv } from './util/utils';

import type { GlobalConfig } from '../src/configTypes';
import type Eval from '../src/models/eval';
import type ModelAudit from '../src/models/modelAudit';

vi.mock('../src/util/fetch/index', () => ({ fetchWithProxy: vi.fn() }));
vi.mock('../src/util/cloud', () => ({
  checkCloudPermissions: vi.fn(),
  makeRequest: vi.fn(),
  resolveCloudTeam: vi.fn(),
  getOrgContext: vi.fn(),
}));
vi.mock('../src/blobs', () => ({ getShareAuthorizedBlob: vi.fn() }));
vi.mock('../src/util/inlineBlobsForShare', () => ({
  createBlobInlineCache: vi.fn(() => new Map()),
  inlineBlobRefsForShare: vi.fn(async (value) => value),
}));

const hash = 'a'.repeat(64);
const cloudA = {
  apiKey: 'synthetic-a',
  apiHost: 'https://api-a.example.com',
  appUrl: 'https://app-a.example.com',
  authHeaderName: 'X-Cloud-A',
};
const cloudB = {
  apiKey: 'synthetic-b',
  apiHost: 'https://api-b.example.com',
  appUrl: 'https://app-b.example.com',
};

function setSession(cloud?: GlobalConfig['cloud']) {
  writeGlobalConfig({ id: 'share-session-test', cloud });
}

function buildEval(): Eval {
  return {
    id: 'local-eval',
    config: {
      sharing: { apiBaseUrl: 'https://oss.example.com', appBaseUrl: 'https://oss.example.com' },
      metadata: { teamId: 'untrusted-team' },
    },
    author: 'qa@example.com',
    prompts: [],
    useOldResults: () => false,
    getTraces: async () => [],
    getTotalResultRowCount: async () => 1,
    fetchResultsBatched: async function* () {
      yield [
        {
          id: 'result-1',
          promptIdx: 0,
          testIdx: 0,
          response: { output: `promptfoo://blob/${hash}` },
        },
      ];
    },
  } as unknown as Eval;
}

describe('share session consistency', () => {
  let configDir: string;
  let previousConfigDir: string;
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.resetAllMocks();
    previousConfigDir = getConfigDirectoryPath();
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-share-session-'));
    setConfigDirectoryPath(configDir);
    restoreEnv = mockProcessEnv({
      PROMPTFOO_API_KEY: undefined,
      PROMPTFOO_CLOUD_API_URL: undefined,
      PROMPTFOO_CLOUD_AUTH_HEADER: undefined,
      PROMPTFOO_REMOTE_API_BASE_URL: undefined,
      PROMPTFOO_REMOTE_APP_BASE_URL: undefined,
      PROMPTFOO_DISABLE_SHARING: 'false',
      PROMPTFOO_SHARE_INLINE_BLOBS: undefined,
      PROMPTFOO_INLINE_MEDIA: 'false',
      PROMPTFOO_SHARE_CHUNK_SIZE: undefined,
      PROMPTFOO_DISABLE_SHARE_EMAIL_REQUEST: 'true',
      PROMPTFOO_DISABLE_TELEMETRY: 'true',
    });
    setSession(cloudA);
    vi.mocked(resolveCloudTeam).mockImplementation(async () => ({
      id: 'team-a',
      sessionId: cloudConfig.getRequestConfig().sessionId,
    }));
    vi.mocked(getShareAuthorizedBlob).mockResolvedValue({
      data: Buffer.from('synthetic-image'),
      metadata: {
        mimeType: 'image/png',
        createdAt: '',
        key: hash,
        provider: 'filesystem',
        sizeBytes: 15,
      },
    });
    vi.mocked(inlineBlobRefsForShare).mockImplementation(async (value) => value);
  });

  afterEach(() => {
    setConfigDirectoryPath(previousConfigDir);
    fs.rmSync(configDir, { recursive: true, force: true });
    restoreEnv();
    vi.resetAllMocks();
  });

  it.each([
    ['another Cloud deployment', cloudB],
    ['logout', undefined],
  ])('keeps results, media, and the browser link together after %s', async (_label, nextCloud) => {
    vi.mocked(fetchWithProxy).mockImplementation(async (url) => {
      if (String(url).endsWith('/api/v1/results')) {
        setSession(nextCloud);
        return Response.json({ id: 'remote-a' });
      }
      if (String(url).endsWith('/api/blobs')) {
        return Response.json({ ref: { hash } });
      }
      return Response.json({});
    });

    const result = await createShareableUrl(buildEval(), { silent: true });

    expect(result).toBe('https://app-a.example.com/eval/remote-a');
    expect(vi.mocked(fetchWithProxy).mock.calls.map(([url]) => url)).toEqual([
      'https://api-a.example.com/api/v1/results',
      'https://api-a.example.com/api/blobs',
      'https://api-a.example.com/api/v1/results/remote-a/results',
    ]);
    for (const [, options] of vi.mocked(fetchWithProxy).mock.calls) {
      expect(options).toMatchObject({
        headers: { 'X-Cloud-A': 'Bearer synthetic-a' },
        skipCloudAuthInjection: true,
      });
    }
    const body = JSON.parse(String(vi.mocked(fetchWithProxy).mock.calls[0][1]?.body));
    expect(body.config.metadata.teamId).toBe('team-a');
    expect(inlineBlobRefsForShare).not.toHaveBeenCalled();
  });

  it('rolls back on the original deployment after the session changes', async () => {
    vi.mocked(fetchWithProxy).mockImplementation(async (url, options) => {
      if (String(url).endsWith('/api/v1/results')) {
        setSession(cloudB);
        return Response.json({ id: 'remote-a' });
      }
      if (String(url).endsWith('/api/blobs')) {
        return Response.json({ ref: { hash } });
      }
      return options?.method === 'DELETE'
        ? Response.json({})
        : new Response('failed', { status: 500 });
    });

    await expect(createShareableUrl(buildEval(), { silent: true })).resolves.toBeNull();

    expect(fetchWithProxy).toHaveBeenLastCalledWith(
      'https://api-a.example.com/api/v1/results/remote-a',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ 'X-Cloud-A': 'Bearer synthetic-a' }),
      }),
    );
    expect(
      vi.mocked(fetchWithProxy).mock.calls.every(([url]) => String(url).startsWith(cloudA.apiHost)),
    ).toBe(true);
  });

  it('keeps an OSS share inline and on the OSS protocol after login', async () => {
    setSession();
    vi.mocked(resolveCloudTeam).mockResolvedValue(undefined);
    vi.mocked(fetchWithProxy).mockImplementation(async (url) => {
      if (String(url).endsWith('/api/eval')) {
        setSession(cloudB);
        return Response.json({ id: 'remote-oss' });
      }
      return Response.json({});
    });

    await expect(createShareableUrl(buildEval(), { silent: true })).resolves.toBe(
      'https://oss.example.com/eval/remote-oss',
    );

    expect(vi.mocked(fetchWithProxy).mock.calls.map(([url]) => url)).toEqual([
      'https://oss.example.com/api/eval',
      'https://oss.example.com/api/eval/remote-oss/results',
    ]);
    expect(inlineBlobRefsForShare).toHaveBeenCalled();
    expect(getShareAuthorizedBlob).not.toHaveBeenCalled();
    const options = vi.mocked(fetchWithProxy).mock.calls[0][1];
    expect(options?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(String(options?.body)).config.metadata.teamId).toBe('untrusted-team');
  });

  it.each(['resolve', 'display', 'permissions'])(
    'stops before uploading if the session changes during %s',
    async (stage) => {
      if (stage === 'resolve') {
        vi.mocked(resolveCloudTeam).mockImplementation(async () => {
          setSession(cloudB);
          return { id: 'team-b' };
        });
      } else if (stage === 'display') {
        vi.mocked(getOrgContext).mockImplementation(async () => {
          setSession(cloudB);
          return null;
        });
      } else {
        vi.mocked(checkCloudPermissions).mockImplementation(async () => {
          setSession(cloudB);
          return undefined;
        });
      }
      await expect(
        createShareableUrl(buildEval(), { silent: stage !== 'display' }),
      ).rejects.toThrow('Cloud login changed');
      if (stage !== 'permissions') {
        expect(checkCloudPermissions).not.toHaveBeenCalled();
      }
      expect(fetchWithProxy).not.toHaveBeenCalled();
    },
  );

  it('rejects a team captured by an earlier login before preflight', async () => {
    const sessionId = cloudConfig.getRequestConfig().sessionId;
    setSession(cloudB);

    await expect(
      createShareableUrl(buildEval(), { silent: true, cloudTeam: { id: 'team-a', sessionId } }),
    ).rejects.toThrow('Cloud login changed');
    expect(checkCloudPermissions).not.toHaveBeenCalled();
    expect(fetchWithProxy).not.toHaveBeenCalled();
  });

  it('does not accept prior-share results after a login change', async () => {
    const cloudTeam = { id: 'team-a', sessionId: cloudConfig.getRequestConfig().sessionId };
    vi.mocked(makeRequest).mockImplementation(async () => {
      setSession(cloudB);
      return new Response(null, { status: 200 });
    });
    await expect(hasEvalBeenShared(buildEval(), cloudTeam)).resolves.toBe(false);
    expect(makeRequest).toHaveBeenCalledOnce();
    vi.mocked(makeRequest).mockClear();
    await expect(hasModelAuditBeenShared({ id: 'audit' } as ModelAudit, cloudTeam)).resolves.toBe(
      false,
    );
    expect(makeRequest).not.toHaveBeenCalled();
  });

  it('retains an explicit browser URL override without moving the upload', async () => {
    const restoreOverride = mockProcessEnv({
      PROMPTFOO_REMOTE_APP_BASE_URL: 'https://browser.example.com',
    });
    try {
      vi.mocked(fetchWithProxy).mockImplementation(async (url) => {
        if (String(url).endsWith('/api/v1/results')) {
          setSession(cloudB);
          return Response.json({ id: 'remote-a' });
        }
        return Response.json({ ref: { hash } });
      });
      await expect(createShareableUrl(buildEval(), { silent: true })).resolves.toBe(
        'https://browser.example.com/eval/remote-a',
      );
      expect(
        vi
          .mocked(fetchWithProxy)
          .mock.calls.every(([url]) => String(url).startsWith(cloudA.apiHost)),
      ).toBe(true);
    } finally {
      restoreOverride();
    }
  });

  it('keeps the model-audit browser URL on the upload deployment', async () => {
    vi.mocked(fetchWithProxy).mockImplementation(async () => {
      setSession(cloudB);
      return Response.json({ remoteId: 'remote-audit' });
    });
    await expect(createShareableModelAuditUrl({ id: 'audit' } as ModelAudit)).resolves.toBe(
      'https://app-a.example.com/model-audit/remote-audit',
    );
    expect(fetchWithProxy).toHaveBeenCalledWith(
      'https://api-a.example.com/api/v1/model-audits/share',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Cloud-A': 'Bearer synthetic-a' }),
      }),
    );
  });
});
