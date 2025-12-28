import select from '@inquirer/select';
import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authCommand } from '../../src/commands/auth';
import { isNonInteractive } from '../../src/envars';
import { getUserEmail, setUserEmail } from '../../src/globalConfig/accounts';
import { cloudConfig } from '../../src/globalConfig/cloud';
import logger from '../../src/logger';
import { getDefaultTeam, getUserTeams, resolveTeamFromIdentifier } from '../../src/util/cloud';
import { fetchWithProxy } from '../../src/util/fetch/index';
import { openAuthBrowser } from '../../src/util/server';
import { createMockResponse, stripAnsi } from '../util/utils';

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
vi.mock('../../src/logger');
vi.mock('../../src/util/cloud');
vi.mock('../../src/util/fetch/index.ts');
vi.mock('../../src/util/server');

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('auth command', () => {
  let program: Command;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();
    program = new Command();
    process.exitCode = undefined;
    authCommand(program);

    // Set up a basic mock that just returns the expected data
    vi.mocked(cloudConfig.validateAndSetApiToken).mockResolvedValue({
      user: mockCloudUser,
      organization: mockOrganization,
      app: mockApp,
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

      expect(setUserEmail).toHaveBeenCalledWith('test@example.com');
      expect(cloudConfig.validateAndSetApiToken).toHaveBeenCalledWith('test-key', undefined);
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

      expect(cloudConfig.validateAndSetApiToken).toHaveBeenCalledWith('test-key', customHost);
    });

    it('should handle login request failure', async () => {
      vi.mocked(cloudConfig.validateAndSetApiToken).mockRejectedValueOnce(new Error('Bad Request'));

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
      vi.mocked(cloudConfig.validateAndSetApiToken).mockResolvedValueOnce({
        user: newCloudUser,
        organization: mockOrganization,
        app: mockApp,
      });

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--api-key', 'test-key']);

      expect(setUserEmail).toHaveBeenCalledWith('new@example.com');
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Updating local email configuration'),
      );
    });

    it('should handle non-Error objects in the catch block', async () => {
      // Mock validateAndSetApiToken to throw a non-Error object
      vi.mocked(cloudConfig.validateAndSetApiToken).mockImplementationOnce(function () {
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
      vi.mocked(resolveTeamFromIdentifier).mockResolvedValue({
        ...mockTeams[1],
        createdAt: '2024-01-01',
      });

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--api-key', 'test-key', '--team', 'security']);

      expect(resolveTeamFromIdentifier).toHaveBeenCalledWith('security');
      expect(cloudConfig.setCurrentTeamId).toHaveBeenCalledWith('team-2', '1');
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Security Team'));
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
      vi.mocked(isNonInteractive).mockReturnValue(true);
      vi.mocked(getDefaultTeam).mockResolvedValue({ ...mockTeams[0], createdAt: '2024-01-01' });

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--api-key', 'test-key']);

      expect(select).not.toHaveBeenCalled();
      expect(cloudConfig.setCurrentTeamId).toHaveBeenCalledWith('team-1', '1');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('You have access to 2 teams'),
      );
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('--team flag'));
    });

    it('should fall back to default team when user cancels interactive selection', async () => {
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
      vi.mocked(select).mockRejectedValue(new Error('User cancelled'));
      vi.mocked(getDefaultTeam).mockResolvedValue({ ...mockTeams[0], createdAt: '2024-01-01' });

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--api-key', 'test-key']);

      expect(cloudConfig.setCurrentTeamId).toHaveBeenCalledWith('team-1', '1');
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

      vi.mocked(getDefaultTeam).mockResolvedValueOnce({
        id: 'team-1',
        name: 'Default Team',
        organizationId: 'org-1',
        createdAt: '2023-01-01T00:00:00Z',
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
