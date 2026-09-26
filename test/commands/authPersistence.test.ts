import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authCommand } from '../../src/commands/auth';
import { getUserEmail } from '../../src/globalConfig/accounts';
import { cloudConfig } from '../../src/globalConfig/cloud';
import { readGlobalConfig } from '../../src/globalConfig/globalConfig';
import logger from '../../src/logger';
import { setConfigDirectoryPath } from '../../src/util/config/manage';
import { fetchWithProxy } from '../../src/util/fetch/index';
import { mockProcessEnv } from '../util/utils';

vi.mock('../../src/util/fetch/index');
vi.mock('../../src/logger');

describe('auth command with persisted configuration', () => {
  let configDirectory: string;
  let restoreEnv: () => void;

  beforeEach(() => {
    vi.resetAllMocks();
    configDirectory = mkdtempSync(path.join(tmpdir(), 'promptfoo-auth-persistence-'));
    setConfigDirectoryPath(configDirectory);
    restoreEnv = mockProcessEnv({
      PROMPTFOO_API_KEY: 'environment-key',
      PROMPTFOO_CLOUD_API_URL: 'https://cloud.example.test',
    });
  });

  afterEach(() => {
    setConfigDirectoryPath(undefined);
    rmSync(configDirectory, { recursive: true, force: true });
    restoreEnv();
    vi.resetAllMocks();
  });

  it('clears the context saved by environment-only whoami after the key is removed', async () => {
    vi.mocked(fetchWithProxy).mockImplementation(async (url) => {
      if (String(url).endsWith('/users/me')) {
        return Response.json({
          user: { email: 'user@example.test' },
          organization: { id: 'env-org', name: 'Environment Org' },
        });
      }
      if (String(url).endsWith('/users/me/teams')) {
        return Response.json([
          {
            id: 'env-team',
            organizationId: 'env-org',
            name: 'Environment Team',
            slug: 'environment-team',
            createdAt: '2024-01-01',
          },
        ]);
      }
      throw new Error('Unexpected Cloud request');
    });
    const program = new Command();
    authCommand(program);

    await program.parseAsync(['node', 'test', 'auth', 'whoami']);

    expect(getUserEmail()).toBeNull();
    expect(readGlobalConfig().cloud).toEqual({
      currentOrganizationId: 'env-org',
      teams: { 'env-org': { currentTeamId: 'env-team' } },
    });

    const restoreWithoutKey = mockProcessEnv({ PROMPTFOO_API_KEY: undefined });
    try {
      expect(cloudConfig.getApiKey()).toBeUndefined();
      await program.parseAsync(['node', 'test', 'auth', 'logout']);

      expect(readGlobalConfig().cloud).toBeUndefined();
      expect(getUserEmail()).toBeNull();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("You're already logged out"),
      );
    } finally {
      restoreWithoutKey();
    }
  });
});
