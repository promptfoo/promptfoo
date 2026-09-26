import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CloudSelectionChangedError, cloudConfig } from '../../src/globalConfig/cloud';
import { readGlobalConfig, updateGlobalConfig } from '../../src/globalConfig/globalConfig';
import { loginWithApiKey } from '../../src/util/cloudLogin';
import { getConfigDirectoryPath, setConfigDirectoryPath } from '../../src/util/config/manage';
import { fetchWithProxy } from '../../src/util/fetch/index';
import { mockProcessEnv } from './utils';

vi.mock('../../src/util/fetch/index');
vi.mock('../../src/logger');

const previousDirectory = getConfigDirectoryPath();
const validation = {
  user: { id: 'candidate-user', name: 'Candidate', email: 'candidate@example.test' },
  organization: { id: 'candidate-org', name: 'Candidate organization' },
  app: { url: 'https://cloud.example.test' },
};
const teams = ['older', 'chosen'].map((id, index) => ({
  id,
  name: id,
  slug: id,
  organizationId: validation.organization.id,
  createdAt: `202${index}-01-01`,
}));

describe('Cloud login with persisted configuration', () => {
  let directory: string;
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.resetAllMocks();
    restoreEnv = mockProcessEnv({ PROMPTFOO_API_KEY: undefined });
    directory = mkdtempSync(path.join(tmpdir(), 'promptfoo-cloud-login-'));
    setConfigDirectoryPath(directory);
    cloudConfig.saveValidatedApiToken({
      token: 'old-key',
      apiHost: validation.app.url,
      user: { id: 'old-user', name: 'Old user', email: 'old@example.test' },
      organization: { id: 'old-org', name: 'Old organization' },
      app: validation.app,
      teamId: 'old-team',
    });
  });

  afterEach(() => {
    setConfigDirectoryPath(previousDirectory);
    rmSync(directory, { recursive: true, force: true });
    restoreEnv();
    vi.resetAllMocks();
  });

  describe.each(['identity', 'teams', 'unavailable teams', 'selection'])(
    'while awaiting %s',
    (stage) => {
      it.each(['login', 'team', 'logout'])('preserves a newer %s', async (change) => {
        let release!: () => void;
        let started!: () => void;
        const waiting = new Promise<void>((resolve) => {
          started = resolve;
        });
        const held = new Promise<void>((resolve) => {
          release = resolve;
        });
        const pause = async () => {
          started();
          await held;
        };
        vi.mocked(fetchWithProxy).mockImplementation(async (url) => {
          if (String(url).endsWith('/users/me')) {
            if (stage === 'identity') {
              await pause();
            }
            return Response.json(validation);
          }
          if (stage === 'teams' || stage === 'unavailable teams') {
            await pause();
          }
          return stage === 'unavailable teams'
            ? new Response(null, { status: 503 })
            : Response.json(teams);
        });
        const pending = loginWithApiKey('candidate-key', undefined, {
          selectTeam: async (choices) => {
            if (stage === 'selection') {
              await pause();
            }
            return choices[1];
          },
        });
        await waiting;
        if (change === 'login') {
          cloudConfig.saveValidatedApiToken({
            ...validation,
            token: 'newer-key',
            apiHost: validation.app.url,
            teamId: 'newer-team',
          });
        } else if (change === 'team') {
          cloudConfig.setCurrentTeamId('newer-team', 'old-org');
        } else {
          cloudConfig.delete();
        }
        const newer = readFileSync(path.join(directory, 'promptfoo.yaml'), 'utf8');
        release();

        await expect(pending).rejects.toBeInstanceOf(CloudSelectionChangedError);
        expect(readFileSync(path.join(directory, 'promptfoo.yaml'), 'utf8')).toBe(newer);
      });
    },
  );

  it('rejects a saved-login change even when the effective environment credential stays the same', async () => {
    cloudConfig.delete();
    const restoreKey = mockProcessEnv({ PROMPTFOO_API_KEY: 'environment-key' });
    try {
      const sessionId = cloudConfig.getRequestConfig().sessionId;
      vi.mocked(fetchWithProxy).mockImplementation(async (url) => {
        if (String(url).endsWith('/users/me')) {
          cloudConfig.setApiKey('environment-key');
          return Response.json(validation);
        }
        return Response.json(teams);
      });

      await expect(loginWithApiKey('candidate-key')).rejects.toBeInstanceOf(
        CloudSelectionChangedError,
      );

      expect(cloudConfig.getRequestConfig().sessionId).toBe(sessionId);
      expect(readGlobalConfig().cloud).toEqual({ apiKey: 'environment-key' });
      expect(readGlobalConfig().account?.email).toBeUndefined();
    } finally {
      restoreKey();
    }
  });

  it('preserves unrelated config updates while completing login', async () => {
    vi.mocked(fetchWithProxy).mockImplementation(async (url) => {
      updateGlobalConfig((config) => {
        config.hasHarmfulRedteamConsent = true;
      });
      return Response.json(String(url).endsWith('/users/me') ? validation : teams);
    });

    await loginWithApiKey('candidate-key');

    expect(readGlobalConfig()).toMatchObject({
      hasHarmfulRedteamConsent: true,
      cloud: { apiKey: 'candidate-key', currentOrganizationId: 'candidate-org' },
    });
  });
});
