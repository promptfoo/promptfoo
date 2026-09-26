import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authCommand } from '../../src/commands/auth';
import { getUserEmail } from '../../src/globalConfig/accounts';
import { cloudConfig } from '../../src/globalConfig/cloud';
import { readGlobalConfig, writeGlobalConfig } from '../../src/globalConfig/globalConfig';
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
    process.exitCode = undefined;
    configDirectory = mkdtempSync(path.join(tmpdir(), 'promptfoo-auth-persistence-'));
    setConfigDirectoryPath(configDirectory);
    restoreEnv = mockProcessEnv({
      PROMPTFOO_API_KEY: 'environment-key',
      PROMPTFOO_CLOUD_API_URL: 'https://cloud.example.test',
    });
  });

  afterEach(() => {
    process.exitCode = undefined;
    setConfigDirectoryPath(undefined);
    rmSync(configDirectory, { recursive: true, force: true });
    restoreEnv();
    vi.resetAllMocks();
  });

  describe.each([
    { scenario: 'a non-array response', teams: { teams: [] } },
    { scenario: 'a null team', teams: [null] },
    {
      scenario: 'a malformed team mixed with valid teams',
      teams: [
        {
          id: 'valid',
          name: 'Valid',
          slug: 'valid',
          organizationId: 'new-org',
          createdAt: '2024-01-01',
        },
        { id: 'invalid', name: null, organizationId: 'new-org' },
      ],
    },
  ])('login with $scenario', ({ teams }) => {
    it.each([
      { choice: 'implicit selection', options: [] },
      { choice: 'an explicit organization', options: ['--org', 'new-org'] },
      { choice: 'an explicit team', options: ['--team', 'valid'] },
    ])('preserves saved preferences with $choice', async ({ options }) => {
      writeGlobalConfig({
        id: 'installation',
        account: { email: 'old@example.test', emailValidated: true },
        cloud: {
          apiKey: 'old-key',
          currentOrganizationId: 'old-org',
          teams: {
            'old-org': { currentTeamId: 'old-team' },
            'new-org': { currentTeamId: 'remembered-team' },
          },
        },
      });
      const saved = readGlobalConfig();
      vi.mocked(fetchWithProxy).mockImplementation(async (url) =>
        String(url).endsWith('/users/me')
          ? Response.json({
              user: { id: 'new-user', name: 'New user', email: 'new@example.test' },
              organization: { id: 'new-org', name: 'New organization' },
              app: { url: 'https://cloud.example.test' },
            })
          : Response.json(teams),
      );
      const program = new Command();
      authCommand(program);

      await program.parseAsync([
        'node',
        'test',
        'auth',
        'login',
        '--api-key',
        'new-key',
        ...options,
      ]);

      if (options.length) {
        expect(process.exitCode).toBe(1);
        expect(readGlobalConfig()).toEqual(saved);
        expect(logger.info).not.toHaveBeenCalledWith(
          expect.stringContaining('Successfully logged in'),
        );
      } else {
        expect(process.exitCode).toBeUndefined();
        expect(readGlobalConfig().cloud).toMatchObject({
          apiKey: 'new-key',
          currentOrganizationId: 'new-org',
          teams: saved.cloud?.teams,
        });
        expect(logger.warn).toHaveBeenCalledWith(
          'Could not refresh team context; keeping the saved team preference.',
          expect.anything(),
        );
      }
    });
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
      selectionContext: expect.stringMatching(/^[a-f0-9]{64}$/),
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

  it('keeps an explicitly selected team for a multi-organization environment credential', async () => {
    vi.mocked(fetchWithProxy).mockImplementation(async (url) =>
      String(url).endsWith('/users/me')
        ? Response.json({
            user: { email: 'user@example.test' },
            organization: { id: 'org-a', name: 'Organization A' },
          })
        : Response.json(
            ['a', 'b'].map((suffix) => ({
              id: `team-${suffix}`,
              organizationId: `org-${suffix}`,
              name: `Team ${suffix.toUpperCase()}`,
              slug: `team-${suffix}`,
              createdAt: '2024-01-01',
            })),
          ),
    );
    const run = async (...args: string[]) => {
      const program = new Command();
      authCommand(program);
      await program.parseAsync(['node', 'test', 'auth', ...args]);
    };

    await run('teams', 'set', 'team-b');
    await run('teams', 'current');
    await run('whoami');

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Current team:'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Current Team: Team B'));
    expect(cloudConfig.getCurrentOrganizationId()).toBe('org-b');
    expect(cloudConfig.getRequestConfig().teamId).toBe('team-b');
    expect(readGlobalConfig().cloud?.apiKey).toBeUndefined();

    vi.mocked(fetchWithProxy).mockRejectedValue(new Error('Offline'));
    await run('whoami');
    expect(cloudConfig.getCurrentOrganizationId()).toBe('org-b');
    expect(cloudConfig.getRequestConfig().teamId).toBe('team-b');
  });

  it('recovers a legacy environment selection when showing the current team', async () => {
    writeGlobalConfig({
      id: 'installation',
      cloud: { currentOrganizationId: 'org-a', teams: { 'org-a': { currentTeamId: 'selected' } } },
    });
    vi.mocked(fetchWithProxy).mockImplementation(async (url) =>
      String(url).endsWith('/users/me')
        ? Response.json({ organization: { id: 'org-a' } })
        : Response.json([
            {
              id: 'selected',
              name: 'Selected',
              slug: 'selected',
              organizationId: 'org-a',
              createdAt: '2024-01-01',
            },
          ]),
    );
    const program = new Command();
    authCommand(program);

    await program.parseAsync(['node', 'test', 'auth', 'teams', 'current']);

    expect(logger.info).toHaveBeenCalledWith('Current team: Selected');
    expect(cloudConfig.getRequestConfig().teamId).toBe('selected');
    expect(readGlobalConfig().cloud?.apiKey).toBeUndefined();
  });

  it.each(['login', 'selection'])(
    'does not overwrite a newer %s after looking up an explicit team',
    async (change) => {
      cloudConfig.setCurrentOrganization('org-a');
      cloudConfig.setCurrentTeamId('old-team', 'org-a');
      let newer: ReturnType<typeof readGlobalConfig>;
      vi.mocked(fetchWithProxy).mockImplementation(async () => {
        if (change === 'login') {
          writeGlobalConfig({
            id: 'installation',
            cloud: {
              apiKey: 'new-key',
              currentOrganizationId: 'org-b',
              teams: { 'org-b': { currentTeamId: 'new-team' } },
            },
          });
        } else {
          cloudConfig.setCurrentTeamId('new-choice', 'org-a');
        }
        newer = readGlobalConfig();
        return Response.json([
          {
            id: 'chosen',
            name: 'Chosen',
            slug: 'chosen',
            organizationId: 'org-a',
            createdAt: '2024-01-01',
          },
        ]);
      });
      const program = new Command();
      authCommand(program);

      await program.parseAsync(['node', 'test', 'auth', 'teams', 'set', 'chosen']);

      expect(process.exitCode).toBe(1);
      expect(readGlobalConfig()).toEqual(newer!);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Cloud login or team selection changed'),
      );
    },
  );

  it.each(['identity', 'teams', 'teams unavailable'])(
    'rejects mixed whoami identity when login changes during %s lookup',
    async (stage) => {
      cloudConfig.setCurrentOrganization('old-org');
      cloudConfig.setCurrentTeamId('old-team', 'old-org');
      const newer = {
        id: 'installation',
        cloud: {
          apiKey: 'new-key',
          apiHost: 'https://new.example.test',
          appUrl: 'https://new-app.example.test',
          currentOrganizationId: 'new-org',
          teams: { 'new-org': { currentTeamId: 'new-team' } },
        },
      };
      vi.mocked(fetchWithProxy).mockImplementation(async (url) => {
        if (String(url).endsWith('/users/me')) {
          if (stage === 'identity') {
            writeGlobalConfig(newer);
          }
          return Response.json({
            user: { email: 'old@example.test' },
            organization: { id: 'old-org', name: 'Old organization' },
          });
        }
        writeGlobalConfig(newer);
        if (stage === 'teams unavailable') {
          throw new Error('Offline');
        }
        return Response.json([
          {
            id: 'old-team',
            name: 'Old team',
            slug: 'old-team',
            organizationId: 'old-org',
            createdAt: '2024-01-01',
          },
        ]);
      });
      const program = new Command();
      authCommand(program);

      await program.parseAsync(['node', 'test', 'auth', 'whoami']);

      expect(process.exitCode).toBe(1);
      expect(readGlobalConfig()).toEqual(newer);
      expect(logger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Currently logged in as:'),
      );
      expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('old@example.test'));
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Cloud login or team selection changed'),
      );
      if (stage === 'identity') {
        expect(fetchWithProxy).toHaveBeenCalledOnce();
      }
    },
  );
});
