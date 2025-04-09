import { Command } from 'commander';
import { authCommand } from '../../src/commands/auth';
import { fetchWithProxy } from '../../src/fetch';
import { getUserEmail, setUserEmail } from '../../src/globalConfig/accounts';
import { cloudConfig } from '../../src/globalConfig/cloud';
import logger from '../../src/logger';
import telemetry from '../../src/telemetry';
import { createMockResponse } from '../util/utils';

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

jest.mock('../../src/globalConfig/accounts');
jest.mock('../../src/globalConfig/cloud');
jest.mock('../../src/logger');
jest.mock('../../src/telemetry');
jest.mock('../../src/fetch');

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('auth command', () => {
  let program: Command;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();
    program = new Command();
    authCommand(program);

    jest.mocked(cloudConfig.validateAndSetApiToken).mockResolvedValue({
      user: mockCloudUser,
      organization: mockOrganization,
      app: mockApp,
    });

    jest.spyOn(telemetry as any, 'record').mockImplementation(() => {});
    jest.spyOn(telemetry as any, 'send').mockImplementation(() => Promise.resolve());
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
      expect(telemetry.record).toHaveBeenCalledWith('command_used', { name: 'auth login' });
      expect(telemetry.send).toHaveBeenCalledTimes(1);
    });

    it('should show login instructions when no API key is provided', async () => {
      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test']);

      expect(logger.info).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('Please login or sign up at https://promptfoo.app'),
      );
      expect(logger.info).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('https://promptfoo.app/welcome'),
      );
      expect(telemetry.record).toHaveBeenCalledWith('command_used', { name: 'auth login' });
      expect(telemetry.send).toHaveBeenCalledTimes(1);
    });

    it('should use custom host when provided', async () => {
      const customHost = 'https://custom-api.example.com';
      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--api-key', 'test-key', '--host', customHost]);

      expect(cloudConfig.validateAndSetApiToken).toHaveBeenCalledWith('test-key', customHost);
      expect(telemetry.record).toHaveBeenCalledWith('command_used', { name: 'auth login' });
      expect(telemetry.send).toHaveBeenCalledTimes(1);
    });

    it('should handle login request failure', async () => {
      jest
        .mocked(cloudConfig.validateAndSetApiToken)
        .mockRejectedValueOnce(new Error('Bad Request'));

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--api-key', 'test-key']);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Authentication failed: Bad Request'),
      );
      expect(process.exitCode).toBe(1);
      expect(telemetry.record).toHaveBeenCalledWith('command_used', { name: 'auth login' });
      expect(telemetry.send).toHaveBeenCalledTimes(1);
    });

    it('should overwrite existing email in config after successful login', async () => {
      const newCloudUser = { ...mockCloudUser, email: 'new@example.com' };
      jest.mocked(getUserEmail).mockReturnValue('old@example.com');
      jest.mocked(cloudConfig.validateAndSetApiToken).mockResolvedValueOnce({
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
      expect(telemetry.record).toHaveBeenCalledWith('command_used', { name: 'auth login' });
      expect(telemetry.send).toHaveBeenCalledTimes(1);
    });
  });

  describe('logout', () => {
    it('should unset email and delete cloud config after logout', async () => {
      const logoutCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'logout');
      await logoutCmd?.parseAsync(['node', 'test']);

      expect(cloudConfig.delete).toHaveBeenCalledTimes(1);
      expect(setUserEmail).toHaveBeenCalledWith('');
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully logged out'));
    });
  });

  describe('whoami', () => {
    it('should show user info when logged in', async () => {
      jest.mocked(getUserEmail).mockReturnValue('test@example.com');
      jest.mocked(cloudConfig.getApiKey).mockReturnValue('test-api-key');
      jest.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');
      jest.mocked(cloudConfig.getAppUrl).mockReturnValue('https://app.example.com');

      jest.mocked(fetchWithProxy).mockResolvedValueOnce(
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
      expect(telemetry.record).toHaveBeenCalledWith('command_used', { name: 'auth whoami' });
      expect(telemetry.send).toHaveBeenCalledTimes(1);
    });

    it('should handle not logged in state', async () => {
      jest.mocked(getUserEmail).mockReturnValue(null);
      jest.mocked(cloudConfig.getApiKey).mockReturnValue(undefined);

      const whoamiCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'whoami');
      await whoamiCmd?.parseAsync(['node', 'test']);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Not logged in. Run promptfoo auth login to login.'),
      );
    });

    it('should handle API error', async () => {
      jest.mocked(getUserEmail).mockReturnValue('test@example.com');
      jest.mocked(cloudConfig.getApiKey).mockReturnValue('test-api-key');
      jest.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');

      jest.mocked(fetchWithProxy).mockResolvedValueOnce(
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

      telemetry.record('command_used', { name: 'auth whoami' });
      telemetry.send();

      process.exitCode = 0;
    });
  });
});
