import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudConfig, cloudConfig } from '../../src/globalConfig/cloud';
import { readGlobalConfig, writeGlobalConfig } from '../../src/globalConfig/globalConfig';
import { ensureCloudTeamContext, resolveCloudTeam, resolveTeamId } from '../../src/util/cloud';
import { getConfigDirectoryPath, setConfigDirectoryPath } from '../../src/util/config/manage';
import { fetchWithProxy } from '../../src/util/fetch/index';

import type { GlobalConfig } from '../../src/configTypes';

vi.mock('../../src/util/fetch/index');
vi.mock('../../src/logger');

const previousDirectory = getConfigDirectoryPath();
let directory: string;

const team = (id: string, organizationId: string, createdAt = '2024-01-01') => ({
  id,
  name: id,
  slug: id,
  organizationId,
  createdAt,
  updatedAt: createdAt,
});

const remembered: GlobalConfig = {
  id: 'installation',
  cloud: {
    currentOrganizationId: 'org-a',
    teams: {
      'org-a': { currentTeamId: 'selected-a' },
      'org-b': { currentTeamId: 'selected-b' },
    },
  },
};

function mockTokenTeams() {
  vi.mocked(fetchWithProxy).mockImplementation(async (url, options) => {
    const token = new Headers(options?.headers).get('Authorization');
    const suffix = token === 'Bearer environment-a' ? 'a' : 'b';
    if (String(url).endsWith('/users/me')) {
      return Response.json({ organization: { id: `org-${suffix}` } });
    }
    return Response.json([
      team(`oldest-${suffix}`, `org-${suffix}`, '2023-01-01'),
      team(`selected-${suffix}`, `org-${suffix}`),
    ]);
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-cloud-team-'));
  setConfigDirectoryPath(directory);
  vi.stubEnv('PROMPTFOO_API_KEY', 'environment-a');
  vi.stubEnv('PROMPTFOO_CLOUD_API_URL', 'https://cloud.example.com');
  vi.stubEnv('PROMPTFOO_CLOUD_AUTH_HEADER', 'Authorization');
  writeGlobalConfig({ id: 'installation' });
  mockTokenTeams();
});

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  setConfigDirectoryPath(previousDirectory);
  fs.rmSync(directory, { recursive: true, force: true });
});

describe('team resolution with persisted preferences and environment credentials', () => {
  it.each([
    { scenario: 'an accessible unscoped selection', legacy: 'selected-a', expected: 'selected-a' },
    { scenario: 'a revoked unscoped selection', legacy: 'removed', expected: 'oldest-a' },
    {
      scenario: 'an unscoped selection in another organization',
      legacy: 'foreign',
      expected: 'oldest-a',
    },
    {
      scenario: 'a scoped selection before a legacy selection',
      legacy: 'oldest-a',
      scoped: 'selected-a',
      expected: 'selected-a',
    },
    {
      scenario: 'a revoked scoped selection before a legacy selection',
      legacy: 'selected-a',
      scoped: 'removed',
      expected: 'oldest-a',
    },
  ])('migrates $scenario within the current organization', async ({ legacy, scoped, expected }) => {
    writeGlobalConfig({
      id: 'installation',
      cloud: {
        currentTeamId: legacy,
        teams: {
          ...(scoped ? { 'org-a': { currentTeamId: scoped } } : {}),
          'org-b': { currentTeamId: 'remembered-b' },
        },
      },
    });
    vi.mocked(fetchWithProxy)
      .mockResolvedValueOnce(Response.json({ organization: { id: 'org-a' } }))
      .mockResolvedValueOnce(
        Response.json([
          team('foreign', 'org-b', '2020-01-01'),
          team('oldest-a', 'org-a', '2023-01-01'),
          team('selected-a', 'org-a'),
        ]),
      );

    await expect(resolveTeamId()).resolves.toMatchObject({ id: expected, organizationId: 'org-a' });

    expect(readGlobalConfig().cloud).toEqual({
      currentOrganizationId: 'org-a',
      selectionContext: expect.stringMatching(/^[a-f0-9]{64}$/),
      teams: {
        'org-a': { currentTeamId: expected },
        'org-b': { currentTeamId: 'remembered-b' },
      },
    });
    expect(fs.readFileSync(path.join(directory, 'promptfoo.yaml'), 'utf8')).not.toContain(
      'environment-a',
    );
  });

  it('preserves a legacy environment selection during an outage, then clears it after an authoritative empty lookup', async () => {
    const legacy: GlobalConfig = {
      id: 'installation',
      cloud: { currentTeamId: 'selected-a', teams: { 'org-b': { currentTeamId: 'remembered-b' } } },
    };
    writeGlobalConfig(legacy);
    vi.mocked(fetchWithProxy)
      .mockResolvedValueOnce(Response.json({ organization: { id: 'org-a' } }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }));

    await expect(resolveTeamId()).rejects.toThrow('Failed to get user teams');
    expect(readGlobalConfig()).toEqual(legacy);

    vi.mocked(fetchWithProxy)
      .mockResolvedValueOnce(Response.json({ organization: { id: 'org-a' } }))
      .mockResolvedValueOnce(Response.json([team('foreign', 'org-b')]));

    await expect(resolveTeamId()).rejects.toThrow("No accessible teams in organization 'org-a'");
    expect(readGlobalConfig().cloud).toEqual({ teams: legacy.cloud?.teams });
  });

  it.each([
    ['fallback', [team('replacement', 'org-a')]],
    ['empty', []],
  ] as const)(
    'does not apply a stale %s response to a newer login or selection',
    async (_label, teams) => {
      for (const change of ['login', 'team', 'logout']) {
        cloudConfig.setCurrentOrganization('org-a');
        cloudConfig.setCurrentTeamId('removed', 'org-a');
        let release!: (response: Response) => void;
        vi.mocked(fetchWithProxy).mockReturnValue(
          new Promise((resolve) => {
            release = resolve;
          }),
        );
        const pending = resolveTeamId();
        if (change === 'login') {
          writeGlobalConfig({
            id: 'installation',
            cloud: {
              apiKey: 'new-key',
              currentOrganizationId: 'org-b',
              teams: { 'org-b': { currentTeamId: 'new-team' } },
            },
          });
        } else if (change === 'team') {
          cloudConfig.setCurrentTeamId('newer-choice', 'org-a');
        } else {
          cloudConfig.delete();
        }
        const newer = fs.readFileSync(path.join(directory, 'promptfoo.yaml'), 'utf8');
        release(Response.json(teams));

        await expect(pending).rejects.toThrow('Cloud login or team selection changed');
        expect(fs.readFileSync(path.join(directory, 'promptfoo.yaml'), 'utf8')).toBe(newer);
        writeGlobalConfig({ id: 'installation' });
      }
    },
  );

  it('keeps organization discovery and team lookup on the captured credential', async () => {
    writeGlobalConfig(remembered);
    const newer: GlobalConfig = {
      id: 'installation',
      cloud: {
        apiKey: 'new-key',
        apiHost: 'https://new.example.com',
        currentOrganizationId: 'org-b',
      },
    };
    vi.mocked(fetchWithProxy).mockImplementation(async (url) => {
      if (String(url).endsWith('/users/me')) {
        writeGlobalConfig(newer);
        return Response.json({ organization: { id: 'org-a' } });
      }
      return Response.json([team('selected-a', 'org-a')]);
    });

    await expect(resolveTeamId()).rejects.toThrow('Cloud login or team selection changed');

    expect(readGlobalConfig()).toEqual(newer);
    expect(fetchWithProxy).toHaveBeenCalledTimes(2);
    for (const [url, options] of vi.mocked(fetchWithProxy).mock.calls) {
      expect(new URL(String(url)).origin).toBe('https://cloud.example.com');
      expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer environment-a');
    }
  });

  it('allows identical parallel resolutions and preserves unrelated account updates', async () => {
    writeGlobalConfig(remembered);
    const release: Array<(response: Response) => void> = [];
    vi.mocked(fetchWithProxy).mockImplementation(async (url) => {
      if (String(url).endsWith('/users/me')) {
        return Response.json({ organization: { id: 'org-a' } });
      }
      return new Promise((resolve) => release.push(resolve));
    });
    const pending = Promise.all([resolveTeamId(), resolveTeamId()]);
    await vi.waitFor(() => expect(release).toHaveLength(2));
    writeGlobalConfig({ ...readGlobalConfig(), account: { email: 'updated@example.test' } });
    for (const resolve of release) {
      resolve(Response.json([team('selected-a', 'org-a')]));
    }

    await expect(pending).resolves.toMatchObject([{ id: 'selected-a' }, { id: 'selected-a' }]);
    expect(readGlobalConfig().account?.email).toBe('updated@example.test');
    expect(cloudConfig.getRequestConfig().teamId).toBe('selected-a');
  });

  it('coalesces pending environment recovery and retries after a lookup failure', async () => {
    writeGlobalConfig(remembered);
    vi.mocked(fetchWithProxy).mockRejectedValue(new Error('Offline'));
    await expect(ensureCloudTeamContext()).rejects.toThrow('Offline');
    expect(readGlobalConfig()).toEqual(remembered);
    vi.mocked(fetchWithProxy).mockClear();
    mockTokenTeams();

    await Promise.all([ensureCloudTeamContext(), ensureCloudTeamContext()]);

    expect(fetchWithProxy).toHaveBeenCalledTimes(2);
    expect(cloudConfig.getRequestConfig().teamId).toBe('selected-a');
    expect(cloudConfig.hasPendingEnvironmentSelection()).toBe(false);
  });

  it('does not recover teams for a fresh credential, a foreign endpoint, or an explicit target', async () => {
    await ensureCloudTeamContext();
    writeGlobalConfig(remembered);
    await ensureCloudTeamContext('https://other.example.com/api/v1/task');
    await ensureCloudTeamContext('https://cloud.example.com/api/v1/task', 'target-a');
    expect(fetchWithProxy).not.toHaveBeenCalled();
    expect(cloudConfig.hasPendingEnvironmentSelection()).toBe(true);
  });

  it('rejects joined recovery callers if the session changes just after resolution', async () => {
    writeGlobalConfig(remembered);
    const requestConfig = cloudConfig.getRequestConfig.bind(cloudConfig);
    const newer = {
      id: 'installation',
      cloud: { apiKey: 'new-key', currentOrganizationId: 'new-org' },
    };
    const snapshot = vi.spyOn(cloudConfig, 'getRequestConfig').mockImplementation(() => {
      const request = requestConfig();
      if (request.teamId === 'selected-a') {
        writeGlobalConfig(newer);
      }
      return request;
    });
    try {
      const results = await Promise.allSettled([
        ensureCloudTeamContext(),
        ensureCloudTeamContext(),
      ]);
      expect(results).toEqual([
        {
          status: 'rejected',
          reason: expect.objectContaining({
            message: expect.stringContaining('Cloud login changed'),
          }),
        },
        {
          status: 'rejected',
          reason: expect.objectContaining({
            message: expect.stringContaining('Cloud login changed'),
          }),
        },
      ]);
      expect(readGlobalConfig()).toEqual(newer);
    } finally {
      snapshot.mockRestore();
    }
  });

  it('follows A → B → A token rotation and remembers each organization’s selected team', async () => {
    await expect(resolveCloudTeam()).resolves.toMatchObject({ id: 'oldest-a' });
    cloudConfig.setCurrentTeamId('selected-a', 'org-a');
    const originalContext = readGlobalConfig().cloud?.selectionContext;

    vi.stubEnv('PROMPTFOO_API_KEY', 'environment-b');
    expect(cloudConfig.getCurrentOrganizationId()).toBeUndefined();
    expect(cloudConfig.getRequestConfig().teamId).toBeUndefined();
    await expect(resolveCloudTeam()).resolves.toMatchObject({ id: 'oldest-b' });
    cloudConfig.setCurrentTeamId('selected-b', 'org-b');

    vi.stubEnv('PROMPTFOO_API_KEY', 'environment-a');
    await expect(resolveCloudTeam()).resolves.toMatchObject({ id: 'selected-a' });
    expect(readGlobalConfig()).toEqual({
      ...remembered,
      cloud: { ...remembered.cloud, selectionContext: originalContext },
    });
    expect(
      vi.mocked(fetchWithProxy).mock.calls.filter(([url]) => String(url).endsWith('/users/me')),
    ).toHaveLength(3);
    const persisted = fs.readFileSync(path.join(directory, 'promptfoo.yaml'), 'utf8');
    expect(persisted).not.toContain('environment-a');
    expect(persisted).not.toContain('environment-b');
  });

  it('keeps an explicit organization for an unchanged environment credential across instances', async () => {
    cloudConfig.setCurrentOrganization('org-b');
    cloudConfig.setCurrentTeamId('selected-b', 'org-b');
    vi.mocked(fetchWithProxy).mockResolvedValue(
      Response.json([team('oldest-a', 'org-a'), team('selected-b', 'org-b')]),
    );

    await expect(resolveCloudTeam()).resolves.toMatchObject({ id: 'selected-b' });
    expect(new CloudConfig().getCurrentOrganizationId()).toBe('org-b');
    expect(new CloudConfig().getRequestConfig().teamId).toBe('selected-b');
    expect(fetchWithProxy).toHaveBeenCalledExactlyOnceWith(
      'https://cloud.example.com/api/v1/users/me/teams',
      expect.anything(),
    );
    expect(readGlobalConfig().cloud?.apiKey).toBeUndefined();
    expect(readGlobalConfig().cloud?.selectionContext).toMatch(/^[a-f0-9]{64}$/);
    expect(fs.readFileSync(path.join(directory, 'promptfoo.yaml'), 'utf8')).not.toContain(
      'environment-a',
    );
  });

  it.each([
    ['PROMPTFOO_API_KEY', 'environment-b'],
    ['PROMPTFOO_API_KEY', ''],
    ['PROMPTFOO_CLOUD_API_URL', 'https://other.example.com'],
    ['PROMPTFOO_CLOUD_AUTH_HEADER', 'X-Cloud-Key'],
  ])('does not reuse the active selection after %s changes', (variable, value) => {
    cloudConfig.setCurrentOrganization('org-a');
    cloudConfig.setCurrentTeamId('selected-a', 'org-a');
    const before = fs.readFileSync(path.join(directory, 'promptfoo.yaml'), 'utf8');
    const sessionId = cloudConfig.getRequestConfig().sessionId;

    vi.stubEnv(variable, value);

    expect(cloudConfig.getCurrentOrganizationId()).toBeUndefined();
    expect(cloudConfig.getRequestConfig().teamId).toBeUndefined();
    expect(cloudConfig.getRequestConfig().sessionId).not.toBe(sessionId);
    expect(fs.readFileSync(path.join(directory, 'promptfoo.yaml'), 'utf8')).toBe(before);
    expect(fetchWithProxy).not.toHaveBeenCalled();
  });

  it('preserves an explicit selection during a team lookup outage', async () => {
    cloudConfig.setCurrentOrganization('org-b');
    cloudConfig.setCurrentTeamId('selected-b', 'org-b');
    const before = fs.readFileSync(path.join(directory, 'promptfoo.yaml'), 'utf8');
    vi.mocked(fetchWithProxy).mockRejectedValue(new Error('Offline'));

    await expect(resolveCloudTeam()).rejects.toThrow('Offline');

    expect(cloudConfig.getCurrentOrganizationId()).toBe('org-b');
    expect(cloudConfig.getRequestConfig().teamId).toBe('selected-b');
    expect(fs.readFileSync(path.join(directory, 'promptfoo.yaml'), 'utf8')).toBe(before);
  });

  it('rejects a team resolved while the effective credential changes', async () => {
    cloudConfig.setCurrentOrganization('org-a');
    cloudConfig.setCurrentTeamId('selected-a', 'org-a');
    vi.mocked(fetchWithProxy).mockImplementation(async () => {
      vi.stubEnv('PROMPTFOO_API_KEY', 'environment-b');
      return Response.json([team('selected-a', 'org-a')]);
    });

    await expect(resolveCloudTeam()).rejects.toThrow('Cloud login or team selection changed');
  });

  it('uses the actual token organization’s remembered team with fallback disabled', async () => {
    writeGlobalConfig(remembered);
    vi.stubEnv('PROMPTFOO_API_KEY', 'environment-b');

    await expect(resolveTeamId(undefined, false)).resolves.toMatchObject({ id: 'selected-b' });

    expect(readGlobalConfig()).toEqual({
      ...remembered,
      cloud: {
        ...remembered.cloud,
        currentOrganizationId: 'org-b',
        selectionContext: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    });
  });

  it.each(['network', 'unauthorized', 'missing organization', 'teams unavailable'])(
    'preserves all preferences after %s and recovers on the next operation',
    async (failure) => {
      writeGlobalConfig(remembered);
      vi.stubEnv('PROMPTFOO_API_KEY', 'environment-b');
      vi.mocked(fetchWithProxy).mockImplementation(async (url) => {
        if (String(url).endsWith('/users/me')) {
          if (failure === 'network') {
            throw new Error('Offline');
          }
          if (failure === 'unauthorized') {
            return new Response(null, { status: 401 });
          }
          return Response.json({
            organization: failure === 'missing organization' ? null : { id: 'org-b' },
          });
        }
        return new Response(null, { status: 503, statusText: 'Service Unavailable' });
      });

      await expect(resolveCloudTeam()).rejects.toThrow();
      expect(readGlobalConfig()).toEqual(remembered);

      mockTokenTeams();
      await expect(resolveCloudTeam()).resolves.toMatchObject({ id: 'selected-b' });
      expect(readGlobalConfig().cloud?.teams).toEqual(remembered.cloud?.teams);
    },
  );

  it('clears only a revoked preference in the actual token organization after an empty lookup', async () => {
    writeGlobalConfig(remembered);
    vi.stubEnv('PROMPTFOO_API_KEY', 'environment-b');
    vi.mocked(fetchWithProxy)
      .mockResolvedValueOnce(Response.json({ organization: { id: 'org-b' } }))
      .mockResolvedValueOnce(Response.json([]));

    await expect(resolveCloudTeam()).rejects.toThrow("No accessible teams in organization 'org-b'");

    expect(readGlobalConfig()).toEqual({
      ...remembered,
      cloud: {
        currentOrganizationId: 'org-a',
        teams: { 'org-a': { currentTeamId: 'selected-a' } },
      },
    });
  });

  it('keeps a saved login’s credential and explicit selected organization over the environment', async () => {
    const config: GlobalConfig = {
      ...remembered,
      cloud: { ...remembered.cloud, apiKey: 'saved-key', apiHost: 'https://saved.example.com' },
    };
    writeGlobalConfig(config);
    vi.stubEnv('PROMPTFOO_API_KEY', 'environment-b');
    vi.mocked(fetchWithProxy).mockResolvedValue(
      Response.json([team('selected-a', 'org-a'), team('older-b', 'org-b', '2020-01-01')]),
    );

    await expect(resolveCloudTeam()).resolves.toMatchObject({ id: 'selected-a' });

    expect(fetchWithProxy).toHaveBeenCalledExactlyOnceWith(
      'https://saved.example.com/api/v1/users/me/teams',
      expect.objectContaining({
        headers: { Authorization: 'Bearer saved-key', 'Content-Type': 'application/json' },
      }),
    );
    expect(readGlobalConfig()).toEqual(config);
  });
});
