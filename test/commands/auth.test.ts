import { Command } from 'commander';
// Import opener directly at the top level
import opener from 'opener';
import { authCommand } from '../../src/commands/auth';
import { fetchWithProxy } from '../../src/fetch';
import { getUserEmail, setUserEmail } from '../../src/globalConfig/accounts';
import { cloudConfig } from '../../src/globalConfig/cloud';
import logger from '../../src/logger';
import * as cliUtils from '../../src/util/cli';
import { createMockResponse } from '../util/utils';

// Mock modules first
jest.mock('opener', () => jest.fn().mockImplementation(() => Promise.resolve()));
jest.mock('../../src/globalConfig/accounts');
jest.mock('../../src/globalConfig/cloud');
jest.mock('../../src/logger');
jest.mock('../../src/telemetry');
jest.mock('../../src/fetch');
jest.mock('../../src/util/cli');
jest.mock('readline', () => ({
  createInterface: jest.fn().mockReturnValue({
    question: jest.fn((query, cb) => cb('test-token')),
    close: jest.fn(),
  }),
}));

// Get access to the mocked readline interface
const readlineInterface = jest.requireMock('readline').createInterface();

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

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('auth command', () => {
  let program: Command;

  beforeEach(() => {
    jest.clearAllMocks();
    program = new Command();
    authCommand(program);

    // Mock the cli utils
    jest.mocked(cliUtils.isInteractiveSession).mockReturnValue(true);
    jest.mocked(cliUtils.promptYesNo).mockResolvedValue(true);
    jest.mocked(cliUtils.promptForInput).mockResolvedValue('test-token');

    // Reset readline mocks
    readlineInterface.question.mockImplementation(
      (_question: string, cb: (answer: string) => void) => cb('test-token'),
    );

    // Mock validateAndSetApiToken to emit the success message and return
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
      // Setup mocks
      jest.mocked(cloudConfig.validateAndSetApiToken).mockResolvedValueOnce({
        user: mockCloudUser,
        organization: mockOrganization,
        app: mockApp,
      });

      jest.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');

      // Run command
      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--api-key', 'test-key']);

      // Verify
      expect(setUserEmail).toHaveBeenCalledWith('test@example.com');
      expect(cloudConfig.validateAndSetApiToken).toHaveBeenCalledWith(
        'test-key',
        'https://api.example.com',
      );
    });

    it('should handle interactive login flow successfully', async () => {
      // Setup mocks
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

      jest.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');

      // Set up specific response for this test
      readlineInterface.question.mockImplementationOnce(
        (_question: string, cb: (answer: string) => void) => cb('test-token'),
      );

      // Run command with --no-browser to ensure email flow
      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--no-browser']);

      // Verify
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('A login link has been sent'),
      );
      expect(cloudConfig.validateAndSetApiToken).toHaveBeenCalledWith(
        'test-token',
        'https://api.example.com',
      );
      expect(setUserEmail).toHaveBeenCalledWith('test@example.com');
    });

    it('should handle browser-based authentication when explicitly enabled', async () => {
      // Setup mocks
      jest.mocked(cloudConfig.validateAndSetApiToken).mockResolvedValueOnce({
        user: mockCloudUser,
        organization: mockOrganization,
        app: mockApp,
      });

      jest.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');
      jest.mocked(cloudConfig.getAppUrl).mockReturnValue('https://app.example.com');

      // Set up specific response for this test
      readlineInterface.question.mockImplementationOnce(
        (_question: string, cb: (answer: string) => void) => cb('test-token'),
      );

      // Run command
      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--browser']);

      // Verify
      expect(opener).toHaveBeenCalledWith('https://app.example.com/welcome');
      expect(cloudConfig.validateAndSetApiToken).toHaveBeenCalledWith(
        'test-token',
        'https://api.example.com',
      );
      expect(setUserEmail).toHaveBeenCalledWith('test@example.com');
    });

    it('should not use browser-based auth when explicitly disabled', async () => {
      // Setup mocks
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

      jest.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');

      // Run command
      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--no-browser']);

      // Verify
      expect(opener).not.toHaveBeenCalled();
      expect(fetchWithProxy).toHaveBeenCalledWith(
        'https://api.example.com/users/login?fromCLI=true',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );
      expect(setUserEmail).toHaveBeenCalledWith('test@example.com');
    });

    it('should fall back to email flow if opening browser fails', async () => {
      // Mock opener to throw an error for this test only
      jest.mocked(opener).mockImplementationOnce(() => {
        throw new Error('Failed to open browser');
      });

      // Setup mocks
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

      jest.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');
      jest.mocked(cloudConfig.getAppUrl).mockReturnValue('https://app.example.com');

      // Run command
      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test']);

      // Verify
      expect(opener).toHaveBeenCalledWith('https://app.example.com/welcome');
      expect(fetchWithProxy).toHaveBeenCalledWith(
        'https://api.example.com/users/login?fromCLI=true',
        expect.any(Object),
      );
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to open browser'));
      expect(setUserEmail).toHaveBeenCalledWith('test@example.com');
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
