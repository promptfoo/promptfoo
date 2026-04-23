import select from '@inquirer/select';
import { Command } from 'commander';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { authCommand } from '../../src/commands/auth';
import { isNonInteractive } from '../../src/envars';
import { getUserEmail, setUserEmail } from '../../src/globalConfig/accounts';
import { cloudConfig } from '../../src/globalConfig/cloud';
import { readGlobalConfig, writeGlobalConfig } from '../../src/globalConfig/globalConfig';
import logger from '../../src/logger';
import { AUTH_CANCELLED, initInkAuth, shouldUseInkAuth } from '../../src/ui/auth';
import { getUserTeams, resolveTeamId } from '../../src/util/cloud';
import { fetchWithProxy } from '../../src/util/fetch/index';
import { openAuthBrowser } from '../../src/util/server';
import { createMockResponse, mockGlobal, stripAnsi } from '../util/utils';

vi.mock('@inquirer/select');

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
vi.mock('../../src/globalConfig/globalConfig');
vi.mock('../../src/logger');
vi.mock('../../src/ui/auth', () => ({
  AUTH_CANCELLED: Symbol('AUTH_CANCELLED'),
  initInkAuth: vi.fn(),
  shouldUseInkAuth: vi.fn(() => false),
}));
vi.mock('../../src/util/cloud');
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
    (cloudConfig as unknown as { reload: ReturnType<typeof vi.fn> }).reload = vi.fn();

    // Set up a basic mock that just returns the expected data
    vi.mocked(cloudConfig.validateApiToken).mockResolvedValue({
      user: mockCloudUser,
      organization: mockOrganization,
      app: mockApp,
      hasActiveLicense: false,
    });

    // performApiKeyLogin always calls getUserTeams() to load/cache teams
    vi.mocked(getUserTeams).mockResolvedValue([]);
    vi.mocked(readGlobalConfig).mockReturnValue({ id: 'config-id' } as any);
    vi.mocked(shouldUseInkAuth).mockReturnValue(false);
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

      expect(setUserEmail).toHaveBeenCalledWith('test@example.com');
      expect(cloudConfig.validateApiToken).toHaveBeenCalledWith('test-key', undefined);
      expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledWith(
        'test-key',
        undefined,
        mockCloudUser,
        mockApp,
        false,
      );
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully logged in'));
    });

    it('should prompt for browser opening when no API key is provided in interactive environment', async () => {
      // Mock interactive environment
      vi.mocked(isNonInteractive).mockImplementation(function () {
        return false;
      });
      vi.mocked(cloudConfig.getAppUrl).mockImplementation(function () {
        return 'https://www.promptfoo.app';
      });

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
      vi.mocked(isNonInteractive).mockImplementation(function () {
        return true;
      });
      vi.mocked(cloudConfig.getAppUrl).mockImplementation(function () {
        return 'https://www.promptfoo.app';
      });

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test']);

      expect(logger.error).toHaveBeenCalledWith(
        'Authentication required. Please set PROMPTFOO_API_KEY environment variable or run `promptfoo auth login` in an interactive environment.',
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

    it('should use custom host for browser opening when provided in interactive environment', async () => {
      // Mock interactive environment
      vi.mocked(isNonInteractive).mockImplementation(function () {
        return false;
      });
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

      expect(cloudConfig.validateApiToken).toHaveBeenCalledWith('test-key', customHost);
      expect(cloudConfig.saveValidatedApiToken).toHaveBeenCalledWith(
        'test-key',
        customHost,
        mockCloudUser,
        mockApp,
        false,
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
      vi.mocked(getUserEmail).mockImplementation(function () {
        return 'old@example.com';
      });
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

      expect(setUserEmail).toHaveBeenCalledWith('new@example.com');
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          'Updating local email configuration from old@example.com to new@example.com',
        ),
      );
    });

    it('should handle non-Error objects in the catch block', async () => {
      // Mock validateApiToken to throw a non-Error object
      vi.mocked(cloudConfig.validateApiToken).mockImplementationOnce(function () {
        throw 'String error message'; // This will test line 57 in auth.ts
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

    it('should roll back persisted auth state when Ink team selection is cancelled', async () => {
      const snapshot = {
        id: 'config-id',
        cloud: { apiKey: 'old-key', currentOrganizationId: 'old-org' },
        account: { email: 'old@example.com' },
      } as any;
      const teams = [
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

      vi.mocked(readGlobalConfig).mockReturnValue(snapshot);
      vi.mocked(getUserTeams).mockResolvedValue(teams);
      vi.mocked(shouldUseInkAuth).mockReturnValue(true);
      vi.mocked(initInkAuth).mockResolvedValue({
        controller: {
          setStatusMessage: vi.fn(),
          showTeamSelector: vi.fn(),
          complete: vi.fn(),
          error: vi.fn(),
        },
        teamSelection: Promise.resolve(AUTH_CANCELLED),
        result: Promise.resolve(AUTH_CANCELLED),
        cleanup: vi.fn(),
      } as any);

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--api-key', 'test-key']);

      expect(writeGlobalConfig).toHaveBeenCalledWith(snapshot);
      expect(
        (cloudConfig as unknown as { reload: ReturnType<typeof vi.fn> }).reload,
      ).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Login cancelled.');
      expect(process.exitCode).toBeUndefined();
    });

    it('should roll back persisted auth state when Ink login is cancelled before team selection', async () => {
      const snapshot = {
        id: 'config-id',
        cloud: { apiKey: 'old-key', currentOrganizationId: 'old-org' },
        account: { email: 'old@example.com' },
      } as any;
      const singleTeam = {
        id: 'team-1',
        name: 'Default',
        slug: 'default',
        organizationId: '1',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };

      vi.mocked(readGlobalConfig).mockReturnValue(snapshot);
      vi.mocked(getUserTeams).mockResolvedValue([singleTeam]);
      vi.mocked(shouldUseInkAuth).mockReturnValue(true);
      const controller = {
        setStatusMessage: vi.fn(),
        showTeamSelector: vi.fn(),
        complete: vi.fn(),
        error: vi.fn(),
      };
      vi.mocked(initInkAuth).mockResolvedValue({
        controller,
        teamSelection: Promise.resolve(undefined),
        result: Promise.resolve(AUTH_CANCELLED),
        cleanup: vi.fn(),
      } as any);

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--api-key', 'test-key']);

      expect(writeGlobalConfig).toHaveBeenCalledWith(snapshot);
      expect(
        (cloudConfig as unknown as { reload: ReturnType<typeof vi.fn> }).reload,
      ).toHaveBeenCalled();
      expect(controller.complete).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('Login cancelled.');
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

      expect(cloudConfig.setCurrentTeamId).toHaveBeenCalledWith('team-2', '1');
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

      expect(cloudConfig.setCurrentOrganization).toHaveBeenCalledWith('org-2');
      expect(cloudConfig.cacheTeams).toHaveBeenCalledWith([mockTeams[1]], 'org-2');
      expect(cloudConfig.setCurrentTeamId).toHaveBeenCalledWith('team-2', 'org-2');
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

      expect(getUserTeams).toHaveBeenCalledWith(customHost, 'test-key');
      expect(cloudConfig.setCurrentOrganization).toHaveBeenCalledWith('org-2');
      expect(cloudConfig.cacheTeams).toHaveBeenCalledWith([mockTeams[1]], 'org-2');
      expect(cloudConfig.setCurrentTeamId).toHaveBeenCalledWith('team-2', 'org-2');
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

      expect(cloudConfig.setCurrentOrganization).toHaveBeenCalledWith('org-2');
      expect(cloudConfig.cacheTeams).toHaveBeenCalledWith([mockTeams[1]], 'org-2');
      expect(cloudConfig.setCurrentTeamId).toHaveBeenCalledWith('team-2', 'org-2');
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

      expect(cloudConfig.setCurrentTeamId).toHaveBeenCalledWith('team-2', 'org-2');
    });

    it('should log and persist the resolved organization when the default org has no teams', async () => {
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

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--api-key', 'test-key']);

      expect(cloudConfig.setCurrentOrganization).toHaveBeenCalledWith('org-2');
      expect(cloudConfig.cacheTeams).toHaveBeenCalledWith([mockTeams[0]], 'org-2');
      expect(cloudConfig.setCurrentTeamId).toHaveBeenCalledWith('team-2', 'org-2');
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Organization:'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('org-2'));
    });

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

      expect(select).not.toHaveBeenCalled();
      expect(cloudConfig.setCurrentTeamId).toHaveBeenCalledWith('team-1', '1');
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
          slug: 'security',
          organizationId: '1',
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ];

      vi.mocked(getUserTeams).mockResolvedValue(mockTeams);
      vi.mocked(isNonInteractive).mockReturnValue(false);
      vi.mocked(select).mockResolvedValue('team-2');

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--api-key', 'test-key']);

      expect(select).toHaveBeenCalledWith({
        message: 'Select a team to use:',
        choices: expect.arrayContaining([
          expect.objectContaining({ name: 'Default', value: 'team-1' }),
          expect.objectContaining({ name: 'Security Team', value: 'team-2' }),
        ]),
      });
      expect(cloudConfig.setCurrentTeamId).toHaveBeenCalledWith('team-2', '1');
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

      expect(select).not.toHaveBeenCalled();
      expect(cloudConfig.setCurrentTeamId).toHaveBeenCalledWith('team-2', '1');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('You have access to 2 teams'),
      );
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('--team flag'));
    });

    it('should use default team with --no-interactive flag when multiple teams exist', async () => {
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
      // isNonInteractive returns false — but --no-interactive flag is passed
      vi.mocked(isNonInteractive).mockReturnValue(false);

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--api-key', 'test-key', '--no-interactive']);

      expect(select).not.toHaveBeenCalled();
      expect(cloudConfig.setCurrentTeamId).toHaveBeenCalledWith('team-1', '1');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('You have access to 2 teams'),
      );
    });

    it('should open browser when --no-interactive is passed without API key in TTY', async () => {
      // --no-interactive only disables the Ink UI, not the browser-based login flow
      vi.mocked(isNonInteractive).mockReturnValue(false);
      vi.mocked(cloudConfig.getAppUrl).mockReturnValue('https://www.promptfoo.app');

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--no-interactive']);

      expect(openAuthBrowser).toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('should exit with error in non-interactive (CI) environment without API key', async () => {
      vi.mocked(isNonInteractive).mockReturnValue(true);
      vi.mocked(cloudConfig.getAppUrl).mockReturnValue('https://www.promptfoo.app');

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test']);

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Authentication required'));
      expect(process.exitCode).toBe(1);
      expect(openAuthBrowser).not.toHaveBeenCalled();
    });

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
      vi.mocked(select).mockRejectedValue(new Error('User cancelled'));

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--api-key', 'test-key']);

      expect(cloudConfig.setCurrentTeamId).toHaveBeenCalledWith('team-2', '1');
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('(default)'));
    });
  });

  describe('logout', () => {
    it('should unset email and delete cloud config after logout', async () => {
      vi.mocked(getUserEmail).mockImplementation(function () {
        return 'test@example.com';
      });
      vi.mocked(cloudConfig.getApiKey).mockImplementation(function () {
        return 'api-key';
      });

      const logoutCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'logout');
      await logoutCmd?.parseAsync(['node', 'test']);

      expect(cloudConfig.delete).toHaveBeenCalledWith();
      expect(setUserEmail).toHaveBeenCalledWith('');
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully logged out'));
    });

    it('should show "already logged out" message when no session exists', async () => {
      vi.mocked(getUserEmail).mockImplementation(function () {
        return null;
      });
      vi.mocked(cloudConfig.getApiKey).mockImplementation(function () {
        return undefined;
      });

      const logoutCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'logout');
      await logoutCmd?.parseAsync(['node', 'test']);

      expect(cloudConfig.delete).not.toHaveBeenCalled();
      expect(setUserEmail).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("You're already logged out"),
      );
    });
  });

  describe('whoami', () => {
    it('should show user info when logged in', async () => {
      vi.mocked(getUserEmail).mockImplementation(function () {
        return 'test@example.com';
      });
      vi.mocked(cloudConfig.getApiKey).mockImplementation(function () {
        return 'test-api-key';
      });
      vi.mocked(cloudConfig.getApiHost).mockImplementation(function () {
        return 'https://api.example.com';
      });
      vi.mocked(cloudConfig.getAppUrl).mockImplementation(function () {
        return 'https://app.example.com';
      });

      vi.mocked(resolveTeamId).mockResolvedValueOnce({
        id: 'team-1',
        name: 'Default Team',
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
    });

    it('should handle not logged in state', async () => {
      // Reset logger mock before test
      vi.mocked(logger.info).mockClear();

      vi.mocked(getUserEmail).mockImplementation(function () {
        return null;
      });
      vi.mocked(cloudConfig.getApiKey).mockImplementation(function () {
        return undefined;
      });

      const whoamiCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'whoami');
      await whoamiCmd?.parseAsync(['node', 'test']);

      // Get the actual logged message
      const infoMessages = vi.mocked(logger.info).mock.calls.map((call) => call[0]);

      // Verify it contains our expected text
      expect(infoMessages).toHaveLength(1);
      expect(infoMessages[0]).toContain('Not logged in');
      expect(infoMessages[0]).toContain('promptfoo auth login');

      // No telemetry is recorded in this case (as per implementation)
    });

    it('should handle API error', async () => {
      vi.mocked(getUserEmail).mockImplementation(function () {
        return 'test@example.com';
      });
      vi.mocked(cloudConfig.getApiKey).mockImplementation(function () {
        return 'test-api-key';
      });
      vi.mocked(cloudConfig.getApiHost).mockImplementation(function () {
        return 'https://api.example.com';
      });

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
      vi.mocked(getUserEmail).mockImplementation(function () {
        return 'test@example.com';
      });
      vi.mocked(cloudConfig.getApiKey).mockImplementation(function () {
        return 'test-api-key';
      });
      vi.mocked(cloudConfig.getApiHost).mockImplementation(function () {
        return 'https://api.example.com';
      });

      // Mock response with an empty body to test line 120 in auth.ts
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
      vi.mocked(getUserEmail).mockImplementation(function () {
        return 'test@example.com';
      });
      vi.mocked(cloudConfig.getApiKey).mockImplementation(function () {
        return 'test-api-key';
      });
      vi.mocked(cloudConfig.getApiHost).mockImplementation(function () {
        return 'https://api.example.com';
      });

      // Mock fetchWithProxy to throw a non-Error object to test line 120 in auth.ts
      vi.mocked(fetchWithProxy).mockImplementationOnce(function () {
        throw 'String error from fetch'; // This is not an Error instance
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
