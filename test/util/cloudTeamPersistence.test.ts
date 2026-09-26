import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cloudConfig } from '../../src/globalConfig/cloud';
import { readGlobalConfig, writeGlobalConfig } from '../../src/globalConfig/globalConfig';
import { resolveCloudTeam, resolveTeamId } from '../../src/util/cloud';
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
  it('follows A → B → A token rotation and remembers each organization’s selected team', async () => {
    await expect(resolveCloudTeam()).resolves.toMatchObject({ id: 'oldest-a' });
    cloudConfig.setCurrentTeamId('selected-a', 'org-a');

    vi.stubEnv('PROMPTFOO_API_KEY', 'environment-b');
    await expect(resolveCloudTeam()).resolves.toMatchObject({ id: 'oldest-b' });
    cloudConfig.setCurrentTeamId('selected-b', 'org-b');

    vi.stubEnv('PROMPTFOO_API_KEY', 'environment-a');
    await expect(resolveCloudTeam()).resolves.toMatchObject({ id: 'selected-a' });
    expect(readGlobalConfig()).toEqual(remembered);
    expect(
      vi.mocked(fetchWithProxy).mock.calls.filter(([url]) => String(url).endsWith('/users/me')),
    ).toHaveLength(3);
    const persisted = fs.readFileSync(path.join(directory, 'promptfoo.yaml'), 'utf8');
    expect(persisted).not.toContain('environment-a');
    expect(persisted).not.toContain('environment-b');
  });

  it('uses the actual token organization’s remembered team with fallback disabled', async () => {
    writeGlobalConfig(remembered);
    vi.stubEnv('PROMPTFOO_API_KEY', 'environment-b');

    await expect(resolveTeamId(undefined, false)).resolves.toMatchObject({ id: 'selected-b' });

    expect(readGlobalConfig()).toEqual({
      ...remembered,
      cloud: { ...remembered.cloud, currentOrganizationId: 'org-b' },
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
