import search from '@inquirer/search';
import { Command } from 'commander';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { authCommand } from '../../src/commands/auth';
import { isNonInteractive } from '../../src/envars';
import { getUserEmail, setUserEmail } from '../../src/globalConfig/accounts';
import { cloudConfig } from '../../src/globalConfig/cloud';
import logger from '../../src/logger';
import { getUserTeams, resolveTeamFromIdentifier, resolveTeamId } from '../../src/util/cloud';
import { fetchWithProxy } from '../../src/util/fetch/index';
import { openAuthBrowser } from '../../src/util/server';
import { createMockResponse, mockGlobal, stripAnsi } from '../util/utils';

vi.mock('@inquirer/search');

const mockCloudUser = {
  id: '1',
  email: 'test@example.com',
  name: 'Test User',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockOrganization = {
  id: '1',
  name: 'Test Org',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockApp = {
  id: '1',
  name: 'Test App',
  createdAt: new Date(),
  updatedAt: new Date(),
  url: 'https://app.example.com',
};

vi.mock('../../src/envars');
vi.mock('../../src/globalConfig/accounts');
vi.mock('../../src/globalConfig/cloud');
vi.mock('../../src/logger');
vi.mock('../../src/util/cloud', async (importOriginal) => {
  // Keep the pure team-matching helpers real; everything that talks to Cloud is mocked.
  const { findTeam, getCloudOrganizationLabel, getOldestTeam } =
    await importOriginal<typeof import('../../src/util/cloud')>();
  return {
    canCreateTargets: vi.fn(),
    findTeam,
    getCloudOrganizationLabel,
    getOldestTeam,
    getUserTeams: vi.fn(),
    resolveTeamFromIdentifier: vi.fn(),
    resolveTeamId: vi.fn(),
  };
});
vi.mock('../../src/util/fetch/index.ts');
vi.mock('../../src/util/server');

const mockFetch = vi.fn();
const restoreFetch = mockGlobal('fetch', mockFetch);

afterAll(() => {
  restoreFetch();
});

describe('auth command', () => {
  let program: Command;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    program = new Command();
    process.exitCode = undefined;
    authCommand(program);

    vi.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');
    vi.mocked(cloudConfig.getRequestConfig).mockImplementation(() => ({
      apiHost: cloudConfig.getApiHost(),
      authHeaderName: cloudConfig.getAuthHeaderName(),
      headers:
        cloudConfig.getAuthHeaders() ??
        (cloudConfig.getApiKey()
          ? { Authorization: `Bearer ${cloudConfig.getApiKey()}` }
          : undefined),
      teamId: undefined,
    }));
    vi.mocked(getUserTeams).mockResolvedValue([]);

    // Set up a basic mock that just returns the expected data
    vi.mocked(cloudConfig.validateApiToken).mockResolvedValue({
      user: mockCloudUser,
      organization: mockOrganization,
      app: mockApp,
      hasActiveLicense: false,
    });
  });

  describe('login', () => {
    it('should set email in config after successful login with API key', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          body: { user: mockCloudUser },
        }),
      );

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--api-key', 'test-key']);

      expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledWith(
        expect.objectContaining({ user: expect.objectContaining({ email: 'test@example.com' }) }),
      );
      expect(cloudConfig.validateApiToken).toHaveBeenCalledWith(
        'test-key',
        'https://api.example.com',
        undefined,
      );
      expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'test-key',
          apiHost: 'https://api.example.com',
          user: mockCloudUser,
          app: mockApp,
          hasActiveLicense: false,
          authHeaderName: undefined,
        }),
      );
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully logged in'));
    });

    it('should prompt for browser opening when no API key is provided in interactive environment', async () => {
      // Mock interactive environment
      vi.mocked(isNonInteractive).mockReturnValue(false);
      vi.mocked(cloudConfig.getAppUrl).mockReturnValue('https://www.promptfoo.app');

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test']);

      expect(openAuthBrowser).toHaveBeenCalledWith(
        'https://www.promptfoo.app/',
        'https://www.promptfoo.app/welcome',
        0, // BrowserBehavior.ASK
      );
    });

    it('should exit with error when no API key is provided in non-interactive environment', async () => {
      // Mock non-interactive environment (CI, cron, SSH without TTY, etc.)
      vi.mocked(isNonInteractive).mockReturnValue(true);
      vi.mocked(cloudConfig.getAppUrl).mockReturnValue('https://www.promptfoo.app');

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test']);

      expect(logger.error).toHaveBeenCalledWith(
        'No API key supplied. Run `promptfoo auth login --api-key <apiKey>` to save a login. For environment-only authentication, set PROMPTFOO_API_KEY and run the desired command directly.',
      );
      // Check that both info calls were made
      const infoCalls = vi.mocked(logger.info).mock.calls;
      const infoMessages = infoCalls.map((call) => stripAnsi(String(call[0])));
      expect(infoCalls.length).toBeGreaterThanOrEqual(2);

      expect(
        infoMessages.some((message) =>
          message.includes('Manual login URL: https://www.promptfoo.app/'),
        ),
      ).toBe(true);
      expect(
        infoMessages.some((message) =>
          message.includes('After login, get your API token at: https://www.promptfoo.app/welcome'),
        ),
      ).toBe(true);
      expect(process.exitCode).toBe(1);
      expect(openAuthBrowser).not.toHaveBeenCalled();
    });

    it('explains the final API-key command after opening the browser', async () => {
      vi.mocked(cloudConfig.getAppUrl).mockReturnValue('https://www.promptfoo.app');
      await program.parseAsync(['node', 'test', 'auth', 'login']);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          'To finish CLI login, copy your API key and run: promptfoo auth login --api-key <apiKey>',
        ),
      );
      expect(cloudConfig.saveValidatedApiToken).not.toHaveBeenCalled();
    });

    it.each([false, true])(
      'handles team lookup failure before saving (explicit: %s)',
      async (explicit) => {
        vi.mocked(cloudConfig.getCurrentTeamId).mockReturnValue('stale-team');
        vi.mocked(getUserTeams).mockRejectedValue(new Error('Teams unavailable'));
        await program.parseAsync([
          'node',
          'test',
          'auth',
          'login',
          '--api-key',
          'candidate-key',
          ...(explicit ? ['--org', '1'] : []),
        ]);
        expect(getUserTeams).toHaveBeenCalledWith(
          'https://api.example.com',
          'candidate-key',
          undefined,
        );
        if (explicit) {
          expect(cloudConfig.saveValidatedApiToken).not.toHaveBeenCalled();
          expect(process.exitCode).toBe(1);
        } else {
          expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledOnce();
          expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledWith(
            expect.objectContaining({
              token: 'candidate-key',
              organizationId: '1',
              teamId: undefined,
            }),
          );
        }
        expect(setUserEmail).not.toHaveBeenCalled();
        process.exitCode = undefined;
      },
    );

    it('keeps the previous session when an explicitly requested team does not exist', async () => {
      await program.parseAsync([
        'node',
        'test',
        'auth',
        'login',
        '--api-key',
        'candidate-key',
        '--team',
        'missing',
      ]);
      expect(cloudConfig.saveValidatedApiToken).not.toHaveBeenCalled();
      expect(cloudConfig.setCurrentOrganization).not.toHaveBeenCalled();
      expect(setUserEmail).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
      process.exitCode = undefined;
    });

    it('should use custom host for browser opening when provided in interactive environment', async () => {
      // Mock interactive environment
      vi.mocked(isNonInteractive).mockReturnValue(false);
      const customHost = 'https://custom.promptfoo.com';

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--host', customHost]);

      expect(openAuthBrowser).toHaveBeenCalledWith(
        'https://custom.promptfoo.com/',
        'https://custom.promptfoo.com/welcome',
        0, // BrowserBehavior.ASK
      );
    });

    it('should use custom host when provided', async () => {
      const customHost = 'https://custom-api.example.com';
      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--api-key', 'test-key', '--host', customHost]);

      expect(cloudConfig.validateApiToken).toHaveBeenCalledWith('test-key', customHost, undefined);
      expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'test-key',
          apiHost: customHost,
          user: mockCloudUser,
          app: mockApp,
          hasActiveLicense: false,
          authHeaderName: undefined,
        }),
      );
    });

    it('should validate and persist an explicit --auth-header-name', async () => {
      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync([
        'node',
        'test',
        '--api-key',
        'test-key',
        '--auth-header-name',
        'X-Promptfoo-Api-Key',
      ]);

      expect(cloudConfig.validateApiToken).toHaveBeenCalledWith(
        'test-key',
        'https://api.example.com',
        'X-Promptfoo-Api-Key',
      );
      expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'test-key',
          apiHost: 'https://api.example.com',
          user: mockCloudUser,
          app: mockApp,
          hasActiveLicense: false,
          authHeaderName: 'X-Promptfoo-Api-Key',
        }),
      );
    });

    it('should fall back to the currently configured auth header name when --auth-header-name is omitted', async () => {
      vi.mocked(cloudConfig.getAuthHeaderName).mockReturnValue('X-Existing-Header');

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--api-key', 'test-key']);

      expect(cloudConfig.validateApiToken).toHaveBeenCalledWith(
        'test-key',
        'https://api.example.com',
        'X-Existing-Header',
      );
      // The resolved header name (the one actually used to validate) is what
      // gets persisted, not the raw (unset) CLI flag value.
      expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'test-key',
          apiHost: 'https://api.example.com',
          user: mockCloudUser,
          app: mockApp,
          hasActiveLicense: false,
          authHeaderName: 'X-Existing-Header',
        }),
      );
    });

    it('should persist the auth header name resolved from PROMPTFOO_CLOUD_AUTH_HEADER when --auth-header-name is omitted', async () => {
      // cloudConfig is fully mocked in this file, so getAuthHeaderName() doesn't run the
      // real resolveAuthHeaderName() env-var fallback — mock it to return what that
      // fallback would resolve to, reproducing an env-var-only (no --auth-header-name flag)
      // login so the resolved value (not undefined) is what gets saved.
      vi.mocked(cloudConfig.getAuthHeaderName).mockReturnValue('X-Env-Header');

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--api-key', 'test-key']);

      expect(cloudConfig.validateApiToken).toHaveBeenCalledWith(
        'test-key',
        'https://api.example.com',
        'X-Env-Header',
      );
      expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledWith(
        expect.objectContaining({
          token: 'test-key',
          apiHost: 'https://api.example.com',
          user: mockCloudUser,
          app: mockApp,
          hasActiveLicense: false,
          authHeaderName: 'X-Env-Header',
        }),
      );
    });

    it('should handle login request failure', async () => {
      vi.mocked(cloudConfig.validateApiToken).mockRejectedValueOnce(new Error('Bad Request'));

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--api-key', 'test-key']);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Authentication failed: Bad Request'),
      );
      expect(process.exitCode).toBe(1);
    });

    it('should overwrite existing email in config after successful login', async () => {
      const newCloudUser = { ...mockCloudUser, email: 'new@example.com' };
      vi.mocked(getUserEmail).mockReturnValue('old@example.com');
      vi.mocked(cloudConfig.validateApiToken).mockResolvedValueOnce({
        user: newCloudUser,
        organization: mockOrganization,
        app: mockApp,
        hasActiveLicense: false,
      });

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--api-key', 'test-key']);

      expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledWith(
        expect.objectContaining({ user: expect.objectContaining({ email: 'new@example.com' }) }),
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Updating local email configuration'),
      );
    });

    it('should handle non-Error objects in the catch block', async () => {
      vi.mocked(cloudConfig.validateApiToken).mockImplementationOnce(function () {
        // Intentionally throw a non-Error value to exercise defensive error-message handling.
        throw 'String error message';
      });

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--api-key', 'test-key']);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Authentication failed: String error message'),
      );
      expect(process.exitCode).toBe(1);

      // Reset exitCode
      process.exitCode = 0;
    });

    it('should use --team flag to set specific team', async () => {
      const mockTeams = [
        {
          id: 'team-1',
          name: 'Default',
          slug: 'default',
          organizationId: '1',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
        {
          id: 'team-2',
          name: 'Security Team',
          slug: 'security',
          organizationId: '1',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ];

      vi.mocked(getUserTeams).mockResolvedValue(mockTeams);

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--api-key', 'test-key', '--team', 'security']);

      expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: 'team-2', organizationId: '1' }),
      );
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Security Team'));
    });

    it('should resolve --team across organizations when --org is omitted', async () => {
      const mockTeams = [
        {
          id: 'team-1',
          name: 'Default',
          slug: 'default',
          organizationId: '1',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
        {
          id: 'team-2',
          name: 'Security Team',
          slug: 'security',
          organizationId: 'org-2',
          createdAt: '2024-01-02',
          updatedAt: '2024-01-02',
        },
      ];

      vi.mocked(getUserTeams).mockResolvedValue(mockTeams);

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--api-key', 'test-key', '--team', 'security']);

      expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-2' }),
      );
      expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: 'team-2', organizationId: 'org-2' }),
      );
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('should use the custom host when resolving --team before saving API key login', async () => {
      const customHost = 'https://api.promptfoo.example';
      const mockTeams = [
        {
          id: 'team-1',
          name: 'Default',
          slug: 'default',
          organizationId: '1',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
        {
          id: 'team-2',
          name: 'Security Team',
          slug: 'security',
          organizationId: 'org-2',
          createdAt: '2024-01-02',
          updatedAt: '2024-01-02',
        },
      ];

      vi.mocked(getUserTeams).mockResolvedValue(mockTeams);

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync([
        'node',
        'test',
        '--api-key',
        'test-key',
        '--host',
        customHost,
        '--team',
        'security',
      ]);

      expect(getUserTeams).toHaveBeenCalledWith(customHost, 'test-key', undefined);
      expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-2' }),
      );
      expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: 'team-2', organizationId: 'org-2' }),
      );
    });

    it('should scope team selection and current organization to --org', async () => {
      const mockTeams = [
        {
          id: 'team-1',
          name: 'Default',
          slug: 'default',
          organizationId: '1',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
        {
          id: 'team-2',
          name: 'Security Team',
          slug: 'security',
          organizationId: 'org-2',
          createdAt: '2024-01-02',
          updatedAt: '2024-01-02',
        },
      ];

      vi.mocked(getUserTeams).mockResolvedValue(mockTeams);

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--api-key', 'test-key', '--org', 'org-2']);

      expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-2' }),
      );
      expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: 'team-2', organizationId: 'org-2' }),
      );
    });

    it('should prefer an exact team name over a slug match when --org and --team are provided', async () => {
      const mockTeams = [
        {
          id: 'team-1',
          name: 'Slug Match',
          slug: 'shared',
          organizationId: 'org-2',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
        {
          id: 'team-2',
          name: 'Shared',
          slug: 'shared-name',
          organizationId: 'org-2',
          createdAt: '2024-01-02',
          updatedAt: '2024-01-02',
        },
      ];

      vi.mocked(getUserTeams).mockResolvedValue(mockTeams);

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync([
        'node',
        'test',
        '--api-key',
        'test-key',
        '--org',
        'org-2',
        '--team',
        'shared',
      ]);

      expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: 'team-2', organizationId: 'org-2' }),
      );
    });

    it.each([
      { flags: [], organizationId: '1', warn: true },
      { flags: ['--org', '1'], organizationId: '1', warn: false },
      { flags: ['--org', 'org-2'], organizationId: 'org-2', warn: false },
      { flags: ['--team', 'security'], organizationId: 'org-2', warn: false },
    ])(
      'requires an explicit switch when the key organization has no teams: $flags',
      async ({ flags, organizationId, warn }) => {
        const mockTeams = [
          {
            id: 'team-2',
            name: 'Security Team',
            slug: 'security',
            organizationId: 'org-2',
            createdAt: '2024-01-02',
            updatedAt: '2024-01-02',
          },
        ];

        vi.mocked(getUserTeams).mockResolvedValue(mockTeams);
        vi.mocked(cloudConfig.getCurrentTeamId).mockReturnValue('team-2');

        await program.parseAsync([
          'node',
          'test',
          'auth',
          'login',
          '--api-key',
          'test-key',
          ...flags,
        ]);

        expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledTimes(1);
        expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledWith(
          expect.objectContaining({ organizationId: organizationId }),
        );
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully logged in'));
        if (organizationId === '1') {
          expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledWith(
            expect.objectContaining({ teamId: null }),
          );
          expect(cloudConfig.clearCurrentTeamId).not.toHaveBeenCalled();
          expect(search).not.toHaveBeenCalled();
          expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Test Org'));
        } else {
          expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledWith(
            expect.objectContaining({ teamId: 'team-2', organizationId: 'org-2' }),
          );
          expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('org-2'));
        }
        if (warn) {
          expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('promptfoo auth login --api-key <apiKey>'),
          );
        } else {
          expect(logger.warn).not.toHaveBeenCalled();
        }
      },
    );

    it('should fail login when --org does not match any accessible team organization', async () => {
      vi.mocked(getUserTeams).mockResolvedValue([
        {
          id: 'team-1',
          name: 'Default',
          slug: 'default',
          organizationId: '1',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ]);

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--api-key', 'test-key', '--org', 'missing-org']);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          "Authentication failed: Organization 'missing-org' not found in your accessible teams.",
        ),
      );
      expect(cloudConfig.saveValidatedApiToken).not.toHaveBeenCalled();
      expect(setUserEmail).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('should reject unknown --org when no teams are returned', async () => {
      vi.mocked(getUserTeams).mockResolvedValue([]);

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--api-key', 'test-key', '--org', 'missing-org']);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          "Authentication failed: Organization 'missing-org' not found in your accessible teams. Available organizations: 1",
        ),
      );
      expect(cloudConfig.saveValidatedApiToken).not.toHaveBeenCalled();
      expect(setUserEmail).not.toHaveBeenCalled();
      expect(process.exitCode).toBe(1);
    });

    it('should auto-select single team without prompting', async () => {
      const mockTeams = [
        {
          id: 'team-1',
          name: 'Only Team',
          slug: 'only',
          organizationId: '1',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ];

      vi.mocked(getUserTeams).mockResolvedValue(mockTeams);

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--api-key', 'test-key']);

      expect(search).not.toHaveBeenCalled();
      expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: 'team-1', organizationId: '1' }),
      );
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Only Team'));
    });

    it('should prompt for team selection when multiple teams exist in interactive mode', async () => {
      const mockTeams = [
        {
          id: 'team-1',
          name: 'Default',
          slug: 'default',
          organizationId: '1',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
        {
          id: 'team-2',
          name: 'Security Team',
          slug: 'security-alpha',
          organizationId: '1',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ];

      vi.mocked(getUserTeams).mockResolvedValue(mockTeams);
      vi.mocked(isNonInteractive).mockReturnValue(false);
      vi.mocked(search).mockResolvedValue('team-2');

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--api-key', 'test-key']);

      expect(vi.mocked(search).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(cloudConfig.saveValidatedApiToken).mock.invocationCallOrder[0],
      );
      expect(search).toHaveBeenCalledWith({
        message: 'Select a team to use:',
        source: expect.any(Function),
      });

      const source = vi.mocked(search).mock.calls[0]?.[0].source;
      const signal = new AbortController().signal;
      await expect(source?.(undefined, { signal })).resolves.toEqual([
        expect.objectContaining({ name: 'Default', value: 'team-1', description: 'default' }),
        expect.objectContaining({
          name: 'Security Team',
          value: 'team-2',
          description: 'security-alpha',
        }),
      ]);
      await expect(source?.('sec', { signal })).resolves.toEqual([
        expect.objectContaining({
          name: 'Security Team',
          value: 'team-2',
          description: 'security-alpha',
        }),
      ]);
      await expect(source?.('alpha', { signal })).resolves.toEqual([
        expect.objectContaining({
          name: 'Security Team',
          value: 'team-2',
          description: 'security-alpha',
        }),
      ]);
      await expect(source?.('DEFAULT', { signal })).resolves.toEqual([
        expect.objectContaining({ name: 'Default', value: 'team-1', description: 'default' }),
      ]);
      expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: 'team-2', organizationId: '1' }),
      );
    });

    it('should use default team with warning in non-interactive mode when multiple teams exist', async () => {
      const mockTeams = [
        {
          id: 'team-1',
          name: 'Default',
          slug: 'default',
          organizationId: '1',
          createdAt: '2024-01-02',
          updatedAt: '2024-01-01',
        },
        {
          id: 'team-2',
          name: 'Security Team',
          slug: 'security',
          organizationId: '1',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ];

      vi.mocked(getUserTeams).mockResolvedValue(mockTeams);
      vi.mocked(isNonInteractive).mockReturnValue(true);

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--api-key', 'test-key']);

      expect(search).not.toHaveBeenCalled();
      expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: 'team-2', organizationId: '1' }),
      );
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('You have access to 2 teams'),
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('promptfoo auth teams set <team>'),
      );
    });

    it("restores the organization's saved team instead of prompting or picking the oldest", async () => {
      vi.mocked(getUserTeams).mockResolvedValue([
        {
          id: 'oldest',
          name: 'Oldest',
          slug: 'oldest',
          organizationId: '1',
          createdAt: '2023-01-01',
          updatedAt: '2023-01-01',
        },
        {
          id: 'saved',
          name: 'Saved',
          slug: 'saved',
          organizationId: '1',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ]);
      vi.mocked(cloudConfig.getCurrentTeamId).mockImplementation((organizationId) =>
        organizationId === '1' ? 'saved' : undefined,
      );

      await program.parseAsync(['node', 'test', 'auth', 'login', '--api-key', 'test-key']);

      expect(search).not.toHaveBeenCalled();
      expect(logger.warn).not.toHaveBeenCalled();
      expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: 'saved', organizationId: '1' }),
      );
    });

    it('prefers the key organization when --team matches a name in several organizations', async () => {
      vi.mocked(getUserTeams).mockResolvedValue([
        {
          id: 'other-default',
          name: 'Default',
          slug: 'default',
          organizationId: 'org-2',
          createdAt: '2023-01-01',
          updatedAt: '2023-01-01',
        },
        {
          id: 'own-default',
          name: 'Default',
          slug: 'default',
          organizationId: '1',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ]);

      await program.parseAsync([
        'node',
        'test',
        'auth',
        'login',
        '--api-key',
        'k',
        '--team',
        'default',
      ]);

      expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: '1' }),
      );
      expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: 'own-default', organizationId: '1' }),
      );
    });

    it('uses the oldest team without prompting after an interactive login finds a stale saved selection', async () => {
      vi.mocked(isNonInteractive).mockReturnValue(false);
      vi.mocked(cloudConfig.getCurrentTeamId).mockReturnValue('removed');
      vi.mocked(getUserTeams).mockResolvedValue([
        {
          id: 'newer',
          name: 'Newer',
          slug: 'newer',
          organizationId: '1',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
        {
          id: 'oldest',
          name: 'Oldest',
          slug: 'oldest',
          organizationId: '1',
          createdAt: '2023-01-01',
          updatedAt: '2023-01-01',
        },
      ]);

      await program.parseAsync(['node', 'test', 'auth', 'login', '--api-key', 'key']);

      expect(search).not.toHaveBeenCalled();
      expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: 'oldest', organizationId: '1' }),
      );
    });

    it.each(['name', 'slug'] as const)(
      'prefers an exact team ID in another organization over a local %s',
      async (field) => {
        const team = { createdAt: '2024-01-01', updatedAt: '2024-01-01' };
        vi.mocked(getUserTeams).mockResolvedValue([
          {
            ...team,
            id: 'local',
            name: 'Local',
            slug: 'local',
            organizationId: '1',
            [field]: 'target-id',
          },
          { ...team, id: 'target-id', name: 'Target', slug: 'target', organizationId: 'org-2' },
        ]);

        await program.parseAsync([
          'node',
          'test',
          'auth',
          'login',
          '--api-key',
          'k',
          '--team',
          'target-id',
        ]);

        expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledWith(
          expect.objectContaining({ organizationId: 'org-2' }),
        );
        expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledWith(
          expect.objectContaining({ teamId: 'target-id', organizationId: 'org-2' }),
        );
      },
    );

    it('should fall back to default team when user cancels interactive selection', async () => {
      const mockTeams = [
        {
          id: 'team-1',
          name: 'Default',
          slug: 'default',
          organizationId: '1',
          createdAt: '2024-01-02',
          updatedAt: '2024-01-01',
        },
        {
          id: 'team-2',
          name: 'Security Team',
          slug: 'security',
          organizationId: '1',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ];

      vi.mocked(getUserTeams).mockResolvedValue(mockTeams);
      vi.mocked(isNonInteractive).mockReturnValue(false);
      vi.mocked(search).mockRejectedValue(new Error('User cancelled'));

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--api-key', 'test-key']);

      expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledWith(
        expect.objectContaining({ teamId: 'team-2', organizationId: '1' }),
      );
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Security Team'));
    });
  });

  describe('teams', () => {
    const runTeamsCommand = async (...args: string[]) => {
      const output: string[] = [];
      for (const level of ['info', 'warn', 'error'] as const) {
        vi.mocked(logger[level]).mockImplementation((message) => {
          output.push(stripAnsi(String(message)));
        });
      }
      await program.parseAsync(['node', 'test', 'auth', 'teams', ...args]);
      return output;
    };

    beforeEach(() => {
      vi.mocked(cloudConfig.isEnabled).mockReturnValue(true);
      vi.mocked(cloudConfig.getCurrentOrganizationId).mockReturnValue('org-1');
    });

    it('lists team and organization IDs so duplicate team names can be selected', async () => {
      vi.mocked(getUserTeams).mockResolvedValue([
        {
          id: 'team-a',
          name: 'Engineering',
          slug: 'engineering',
          organizationId: 'org-1',
          createdAt: '2024',
          updatedAt: '2024',
        },
        {
          id: 'team-b',
          name: 'Engineering',
          slug: 'engineering',
          organizationId: 'org-2',
          createdAt: '2024',
          updatedAt: '2024',
        },
      ]);
      const output = (await runTeamsCommand('list')).join('\n');
      expect(output).toContain('ID: team-a  Organization: org-1');
      expect(output).toContain('ID: team-b  Organization: org-2');
    });

    describe('current', () => {
      it('shows the team resolved by the shared fallback, which never switches organizations', async () => {
        vi.mocked(cloudConfig.getCurrentTeamId).mockReturnValue('saved');
        vi.mocked(resolveTeamId).mockResolvedValue({
          id: 'saved',
          name: 'Saved',
          organizationId: 'org-1',
        });

        expect(await runTeamsCommand('current')).toEqual(['Current team: Saved']);
        expect(resolveTeamId).toHaveBeenCalledWith();
        expect(cloudConfig.setCurrentOrganization).not.toHaveBeenCalled();
      });

      it('reports a failed lookup without touching the saved selection', async () => {
        vi.mocked(cloudConfig.getCurrentTeamId).mockReturnValue('saved');
        vi.mocked(resolveTeamId).mockRejectedValue(new Error('Service Unavailable'));

        expect(await runTeamsCommand('current')).toEqual([
          'Failed to get current team: Service Unavailable',
        ]);
        expect(process.exitCode).toBe(1);
        expect(cloudConfig.clearCurrentTeamId).not.toHaveBeenCalled();
        expect(cloudConfig.setCurrentTeamId).not.toHaveBeenCalled();
      });

      it('does not query teams when no team is currently selected', async () => {
        expect(await runTeamsCommand('current')).toEqual(['No team currently selected']);
        expect(resolveTeamId).not.toHaveBeenCalled();
      });
    });

    describe('set', () => {
      it.each([
        { organizationId: 'org-1', output: 'Switched to team: Chosen' },
        { organizationId: 'org-2', output: 'Switched to team: Chosen (organization org-2)' },
      ])(
        'makes a team in $organizationId the active selection',
        async ({ organizationId, output }) => {
          vi.mocked(resolveTeamFromIdentifier).mockResolvedValue({
            id: 'chosen',
            name: 'Chosen',
            organizationId,
            createdAt: '2024-01-01',
          });

          expect(await runTeamsCommand('set', 'chosen')).toEqual([output]);
          expect(cloudConfig.setCurrentOrganization).toHaveBeenCalledWith(organizationId);
          expect(cloudConfig.setCurrentTeamId).toHaveBeenCalledWith('chosen', organizationId);
        },
      );
    });
  });

  describe('logout', () => {
    it('should unset email and delete cloud config after logout', async () => {
      vi.mocked(getUserEmail).mockReturnValue('test@example.com');
      vi.mocked(cloudConfig.getApiKey).mockReturnValue('api-key');

      const logoutCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'logout');
      await logoutCmd?.parseAsync(['node', 'test']);

      expect(cloudConfig.delete).toHaveBeenCalledWith();
      expect(setUserEmail).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully logged out'));
    });

    it('reports environment authentication that remains after deleting the saved session', async () => {
      vi.mocked(cloudConfig.getApiKey).mockReturnValue('environment-key');
      vi.mocked(cloudConfig.isEnabled).mockReturnValue(true);
      await program.parseAsync(['node', 'test', 'auth', 'logout']);
      expect(cloudConfig.delete).toHaveBeenCalledOnce();
      expect(logger.warn).toHaveBeenCalledWith(
        'Saved credentials cleared. PROMPTFOO_API_KEY still provides authentication; unset it to log out completely.',
      );
      expect(logger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Successfully logged out'),
      );
    });

    it('reports a failed logout without claiming success', async () => {
      vi.mocked(cloudConfig.getApiKey).mockReturnValue('saved-key');
      vi.mocked(cloudConfig.delete).mockImplementation(() => {
        throw new Error('Write failed');
      });
      await program.parseAsync(['node', 'test', 'auth', 'logout']);
      expect(process.exitCode).toBe(1);
      expect(logger.error).toHaveBeenCalledWith(
        'Logout failed; saved credentials could not be cleared.',
        expect.any(Object),
      );
      expect(logger.info).not.toHaveBeenCalledWith(
        expect.stringContaining('Successfully logged out'),
      );
      process.exitCode = undefined;
    });

    it('should show "already logged out" message when no session exists', async () => {
      vi.mocked(getUserEmail).mockReturnValue(null);
      vi.mocked(cloudConfig.getApiKey).mockReturnValue(undefined);

      const logoutCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'logout');
      await logoutCmd?.parseAsync(['node', 'test']);

      expect(cloudConfig.delete).toHaveBeenCalledOnce();
      expect(setUserEmail).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("You're already logged out"),
      );
    });
  });

  describe('whoami', () => {
    beforeEach(() => {
      vi.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');
      vi.mocked(cloudConfig.getAuthHeaderName).mockReturnValue('Authorization');
    });

    it('queries the effective API key even when there is no saved email', async () => {
      vi.mocked(getUserEmail).mockReturnValue(null);
      vi.mocked(cloudConfig.getApiKey).mockReturnValue('environment-key');
      vi.mocked(cloudConfig.getAuthHeaders).mockReturnValue({
        Authorization: 'Bearer environment-key',
      });
      vi.mocked(fetchWithProxy).mockResolvedValue(
        Response.json({ user: mockCloudUser, organization: mockOrganization }),
      );
      vi.mocked(resolveTeamId).mockResolvedValue({
        id: 'team-1',
        name: 'Team One',
        organizationId: '1',
      });
      await program.parseAsync(['node', 'test', 'auth', 'whoami']);
      expect(fetchWithProxy).toHaveBeenCalledWith(
        'https://api.example.com/api/v1/users/me',
        expect.objectContaining({ headers: { Authorization: 'Bearer environment-key' } }),
      );
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('test@example.com'));
      expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('Not logged in'));
    });

    it('uses one request snapshot for the host and credential', async () => {
      vi.mocked(cloudConfig.getRequestConfig).mockReturnValue({
        apiHost: 'https://snapshot.example.com',
        authHeaderName: 'X-Cloud-Key',
        headers: { 'X-Cloud-Key': 'Bearer snapshot-key' },
        teamId: undefined,
      });
      vi.mocked(fetchWithProxy).mockResolvedValue(
        Response.json({ user: mockCloudUser, organization: mockOrganization }),
      );
      await program.parseAsync(['node', 'test', 'auth', 'whoami']);
      expect(cloudConfig.getRequestConfig).toHaveBeenCalledOnce();
      expect(fetchWithProxy).toHaveBeenCalledWith('https://snapshot.example.com/api/v1/users/me', {
        headers: { 'X-Cloud-Key': 'Bearer snapshot-key' },
        skipCloudAuthInjection: true,
      });
      expect(cloudConfig.getApiHost).not.toHaveBeenCalled();
      expect(cloudConfig.getAuthHeaders).not.toHaveBeenCalled();
    });

    it('should show user info when logged in', async () => {
      vi.mocked(getUserEmail).mockReturnValue('test@example.com');
      vi.mocked(cloudConfig.getApiKey).mockReturnValue('test-api-key');
      vi.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');
      vi.mocked(cloudConfig.getAppUrl).mockReturnValue('https://app.example.com');

      vi.mocked(resolveTeamId).mockResolvedValueOnce({
        id: 'team-1',
        name: 'Default Team',
        organizationId: 'org-1',
      });

      vi.mocked(fetchWithProxy).mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          body: {
            user: mockCloudUser,
            organization: mockOrganization,
          },
        }),
      );

      const whoamiCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'whoami');
      await whoamiCmd?.parseAsync(['node', 'test']);

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Currently logged in as:'));
      const messages = vi
        .mocked(logger.info)
        .mock.calls.map(([message]) => stripAnsi(String(message)))
        .join('\n');
      expect(messages).toContain('API URL: https://api.example.com');
      expect(messages).toContain('Auth header: Authorization');
    });

    it.each([true, false])(
      'shows the selected organization when team lookup succeeds: %s',
      async (teamExists) => {
        vi.mocked(getUserEmail).mockReturnValue(mockCloudUser.email);
        vi.mocked(cloudConfig.getApiKey).mockReturnValue('test-key');
        vi.mocked(cloudConfig.getCurrentOrganizationId).mockReturnValue('org-2');
        vi.mocked(fetchWithProxy).mockResolvedValueOnce(
          createMockResponse({
            ok: true,
            body: { user: mockCloudUser, organization: mockOrganization },
          }),
        );
        if (teamExists) {
          vi.mocked(resolveTeamId).mockResolvedValue({
            id: 'team-2',
            name: 'Selected team',
            organizationId: 'org-2',
          });
        } else {
          vi.mocked(resolveTeamId).mockRejectedValue(new Error('Team unavailable'));
        }

        await program.parseAsync(['node', 'test', 'auth', 'whoami']);

        const messages = vi
          .mocked(logger.info)
          .mock.calls.map(([message]) => stripAnsi(String(message)))
          .join('\n');
        expect(messages).toContain('Organization: org-2');
        expect(messages).not.toContain(mockOrganization.name);
        if (teamExists) {
          expect(messages).toContain('Current Team: Selected team');
        } else {
          expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Team unavailable'));
        }
      },
    );

    it('shows effective auth settings on failure without exposing URL credentials or the API key', async () => {
      vi.mocked(getUserEmail).mockReturnValue('test@example.com');
      vi.mocked(cloudConfig.getApiKey).mockReturnValue('synthetic-cloud-secret');
      vi.mocked(cloudConfig.getApiHost).mockReturnValue(
        'https://gateway-user:gateway-password@api.example.com/v1/01234567-89ab-4cde-8fab-0123456789ab?token=synthetic-query-secret',
      );
      vi.mocked(cloudConfig.getAuthHeaderName).mockReturnValue('X-Promptfoo-Api-Key');
      vi.mocked(fetchWithProxy).mockResolvedValueOnce(
        createMockResponse({ ok: false, status: 401, statusText: 'Unauthorized' }),
      );

      const whoamiCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'whoami');
      await whoamiCmd?.parseAsync(['node', 'test']);

      const messages = vi
        .mocked(logger.info)
        .mock.calls.map(([message]) => stripAnsi(String(message)))
        .join('\n');
      expect(messages).toContain('api.example.com');
      expect(messages).toContain('/v1/%5BREDACTED%5D');
      expect(messages).toContain('Auth header: X-Promptfoo-Api-Key');
      expect(messages).not.toContain('gateway-user');
      expect(messages).not.toContain('gateway-password');
      expect(messages).not.toContain('synthetic-query-secret');
      expect(messages).not.toContain('synthetic-cloud-secret');
      expect(messages).not.toContain('01234567-89ab-4cde-8fab-0123456789ab');
      expect(process.exitCode).toBe(1);
      process.exitCode = 0;
    });

    it.each([undefined])(
      'shows safe auth settings without a saved email (API key: %s)',
      async (apiKey) => {
        vi.mocked(getUserEmail).mockReturnValue(null);
        vi.mocked(cloudConfig.getApiKey).mockReturnValue(apiKey);
        vi.mocked(cloudConfig.getApiHost).mockReturnValue(
          'https://gateway-user:gateway-password@api.example.com/v1/%74oken_privateTenantCredential123?token=synthetic-query-secret',
        );
        vi.mocked(cloudConfig.getAuthHeaderName).mockReturnValue('X-Promptfoo-Api-Key');

        const whoamiCmd = program.commands
          .find((cmd) => cmd.name() === 'auth')
          ?.commands.find((cmd) => cmd.name() === 'whoami');
        await whoamiCmd?.parseAsync(['node', 'test']);

        const messages = vi
          .mocked(logger.info)
          .mock.calls.map(([message]) => stripAnsi(String(message)))
          .join('\n');
        expect(messages).toContain('API URL:');
        expect(messages).toContain('api.example.com');
        expect(messages).toContain('/v1/%5BREDACTED%5D');
        expect(messages).toContain('Auth header: X-Promptfoo-Api-Key');
        expect(messages).toContain('Not logged in');
        expect(messages).toContain('promptfoo auth login');
        expect(messages).not.toContain('gateway-user');
        expect(messages).not.toContain('gateway-password');
        expect(messages).not.toContain('synthetic-query-secret');
        expect(messages).not.toContain('synthetic-env-key');
        expect(messages).not.toContain('privateTenantCredential123');
        expect(fetchWithProxy).not.toHaveBeenCalled();
      },
    );

    it('should handle API error', async () => {
      vi.mocked(getUserEmail).mockReturnValue('test@example.com');
      vi.mocked(cloudConfig.getApiKey).mockReturnValue('test-api-key');
      vi.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');

      vi.mocked(fetchWithProxy).mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          statusText: 'Internal Server Error',
        }),
      );

      const whoamiCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'whoami');
      await whoamiCmd?.parseAsync(['node', 'test']);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'Failed to get user info: Failed to fetch user info: Internal Server Error',
        ),
      );
      expect(process.exitCode).toBe(1);

      process.exitCode = 0;
    });

    it('should handle failed API response with empty body', async () => {
      vi.mocked(getUserEmail).mockReturnValue('test@example.com');
      vi.mocked(cloudConfig.getApiKey).mockReturnValue('test-api-key');
      vi.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');

      // Mock response with an empty body to exercise error-body fallback handling.
      vi.mocked(fetchWithProxy).mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          statusText: 'Internal Server Error',
          // Providing no body or an empty body
        }),
      );

      const whoamiCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'whoami');
      await whoamiCmd?.parseAsync(['node', 'test']);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(
          'Failed to get user info: Failed to fetch user info: Internal Server Error',
        ),
      );
      expect(process.exitCode).toBe(1);

      // Reset exitCode
      process.exitCode = 0;
    });

    it('should handle non-Error object in the catch block', async () => {
      vi.mocked(getUserEmail).mockReturnValue('test@example.com');
      vi.mocked(cloudConfig.getApiKey).mockReturnValue('test-api-key');
      vi.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');

      // Intentionally throw a non-Error value to exercise defensive error-message handling.
      vi.mocked(fetchWithProxy).mockImplementationOnce(function () {
        throw 'String error from fetch';
      });

      const whoamiCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'whoami');
      await whoamiCmd?.parseAsync(['node', 'test']);

      expect(logger.error).toHaveBeenCalledWith('Failed to get user info: String error from fetch');
      expect(process.exitCode).toBe(1);

      // Reset exitCode
      process.exitCode = 0;
    });
  });
});
