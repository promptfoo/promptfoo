import { Command } from 'commander';
import { authCommand } from '../../src/commands/auth';
import { fetchWithProxy } from '../../src/fetch';
import { getUserEmail, setUserEmail } from '../../src/globalConfig/accounts';
import { cloudConfig } from '../../src/globalConfig/cloud';
import logger from '../../src/logger';
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
jest.mock('readline', () => ({
  createInterface: jest.fn().mockReturnValue({
    question: jest.fn((query, cb) => cb('test@example.com')),
    close: jest.fn(),
  }),
}));

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('auth command', () => {
  let program: Command;

  beforeEach(() => {
    jest.clearAllMocks();
    program = new Command();
    authCommand(program);

    // Mock validateAndSetApiToken to emit the success message
    jest.mocked(cloudConfig.validateAndSetApiToken).mockImplementation(async () => {
      logger.info(expect.stringContaining('Successfully logged in'));
      logger.info(expect.any(String)); // 'Logged in as:'
      logger.info(expect.any(String)); // User
      logger.info(expect.any(String)); // Organization
      logger.info(expect.any(String)); // App URL
      return {
        user: mockCloudUser,
        organization: mockOrganization,
        app: mockApp,
      };
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

      jest.mocked(cloudConfig.validateAndSetApiToken).mockResolvedValueOnce({
        user: mockCloudUser,
        organization: mockOrganization,
        app: mockApp,
      });

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--api-key', 'test-key']);

      expect(setUserEmail).toHaveBeenCalledWith('test@example.com');
      expect(cloudConfig.validateAndSetApiToken).toHaveBeenCalledWith(
        expect.any(String),
        undefined,
      );
    });

    it('should handle interactive login flow successfully', async () => {
      jest.mocked(fetchWithProxy).mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          body: {},
        }),
      );

      jest.mocked(cloudConfig.validateAndSetApiToken).mockResolvedValueOnce({
        user: mockCloudUser,
        organization: mockOrganization,
        app: mockApp,
      });

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test']);

      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('A login link has been sent'),
      );
      expect(setUserEmail).toHaveBeenCalledWith('test@example.com');
      expect(cloudConfig.validateAndSetApiToken).toHaveBeenCalledWith(
        expect.any(String),
        undefined,
      );
    });

    it('should handle login request failure', async () => {
      jest.mocked(fetchWithProxy).mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          statusText: 'Bad Request',
        }),
      );

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test']);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send login request: Bad Request'),
      );
      expect(process.exitCode).toBe(1);
    });

    it('should handle token validation failure', async () => {
      jest.mocked(fetchWithProxy).mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          body: {},
        }),
      );

      jest
        .mocked(cloudConfig.validateAndSetApiToken)
        .mockRejectedValueOnce(new Error('Invalid token'));

      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test']);

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Authentication failed: Invalid token'),
      );
      expect(process.exitCode).toBe(1);
    });

    it('should overwrite existing email in config after successful login', async () => {
      const newCloudUser = {
        ...mockCloudUser,
        email: 'new@example.com',
      };

      jest.mocked(getUserEmail).mockReturnValue('old@example.com');
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          body: { user: newCloudUser },
        }),
      );

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
      expect(cloudConfig.validateAndSetApiToken).toHaveBeenCalledWith(
        expect.any(String),
        undefined,
      );
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          'Updating local email configuration from old@example.com to new@example.com',
        ),
      );
    });
  });

  describe('logout', () => {
    it('should unset email in config after logout', async () => {
      jest.mocked(getUserEmail).mockReturnValue('test@example.com');

      const logoutCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'logout');
      await logoutCmd?.parseAsync(['node', 'test']);

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
            organization: { name: 'Test Org' },
          },
        }),
      );

      const whoamiCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'whoami');
      await whoamiCmd?.parseAsync(['node', 'test']);

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Currently logged in as:'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('test@example.com'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Test Org'));
    });

    it('should handle not logged in state', async () => {
      jest.mocked(getUserEmail).mockReturnValue(null);
      jest.mocked(cloudConfig.getApiKey).mockReturnValue(undefined);

      const whoamiCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'whoami');
      await whoamiCmd?.parseAsync(['node', 'test']);

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Not logged in'));
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

      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to get user info'));
      expect(process.exitCode).toBe(1);
    });
  });
});
