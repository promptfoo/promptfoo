import { Command } from 'commander';
import { authCommand } from '../../src/commands/auth';
import { fetchWithProxy } from '../../src/fetch';
import { getUserEmail, setUserEmail } from '../../src/globalConfig/accounts';
import { cloudConfig } from '../../src/globalConfig/cloud';
import logger from '../../src/logger';

// Mock a complete CloudUser object
const mockCloudUser = {
  id: '1',
  email: 'test@example.com',
  name: 'Test User',
  createdAt: new Date(),
  updatedAt: new Date(),
};

// Mock organization and app objects
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

// Mock Response object factory
const createMockResponse = (options: { ok: boolean; body?: any; statusText?: string }) => {
  return {
    ok: options.ok,
    headers: new Headers(),
    redirected: false,
    status: options.ok ? 200 : 400,
    statusText: options.statusText || (options.ok ? 'OK' : 'Bad Request'),
    type: 'basic' as ResponseType,
    url: 'https://api.example.com',
    json: () => Promise.resolve(options.body || {}),
    text: () => Promise.resolve(''),
    blob: () => Promise.resolve(new Blob()),
    formData: () => Promise.resolve(new FormData()),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    bodyUsed: false,
    body: null,
    clone () {
      return this;
    },
  } as Response;
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
  });

  describe('login', () => {
    it('should set email in config after successful login with API key', async () => {
      // Mock successful login response
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          body: { user: mockCloudUser },
        }),
      );

      // Mock cloud config validation
      jest.mocked(cloudConfig.validateAndSetApiToken).mockResolvedValueOnce({
        user: mockCloudUser,
        organization: mockOrganization,
        app: mockApp,
      });

      // Execute login command
      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--api-key', 'test-key']);

      // Verify email was set
      expect(setUserEmail).toHaveBeenCalledWith('test@example.com');
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully logged in'));
    });

    it('should handle interactive login flow successfully', async () => {
      // Mock successful login response
      jest.mocked(fetchWithProxy).mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          body: {},
        }),
      );

      // Mock cloud config validation
      jest.mocked(cloudConfig.validateAndSetApiToken).mockResolvedValueOnce({
        user: mockCloudUser,
        organization: mockOrganization,
        app: mockApp,
      });

      // Execute login command without API key
      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test']);

      // Verify login flow
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('A login link has been sent'),
      );
      expect(setUserEmail).toHaveBeenCalledWith('test@example.com');
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully logged in'));
    });

    it('should handle login request failure', async () => {
      // Mock failed login response
      jest.mocked(fetchWithProxy).mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          statusText: 'Bad Request',
        }),
      );

      // Execute login command without API key
      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test']);

      // Verify error handling
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send login request: Bad Request'),
      );
      expect(process.exitCode).toBe(1);
    });

    it('should handle token validation failure', async () => {
      // Mock successful login response but failed token validation
      jest.mocked(fetchWithProxy).mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          body: {},
        }),
      );

      jest
        .mocked(cloudConfig.validateAndSetApiToken)
        .mockRejectedValueOnce(new Error('Invalid token'));

      // Execute login command without API key
      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test']);

      // Verify error handling
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

      // Mock existing email
      jest.mocked(getUserEmail).mockReturnValue('old@example.com');

      // Mock successful login response
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          body: { user: newCloudUser },
        }),
      );

      // Mock cloud config validation
      jest.mocked(cloudConfig.validateAndSetApiToken).mockResolvedValueOnce({
        user: newCloudUser,
        organization: mockOrganization,
        app: mockApp,
      });

      // Execute login command
      const loginCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'login');
      await loginCmd?.parseAsync(['node', 'test', '--api-key', 'test-key']);

      // Verify email was overwritten
      expect(setUserEmail).toHaveBeenCalledWith('new@example.com');
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully logged in'));
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining(
          'Updating local email configuration from old@example.com to new@example.com',
        ),
      );
    });
  });

  describe('logout', () => {
    it('should unset email in config after logout', async () => {
      // Mock existing email
      jest.mocked(getUserEmail).mockReturnValue('test@example.com');

      // Execute logout command
      const logoutCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'logout');
      await logoutCmd?.parseAsync(['node', 'test']);

      // Verify email was unset
      expect(setUserEmail).toHaveBeenCalledWith('');
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Successfully logged out'));
    });
  });

  describe('whoami', () => {
    it('should show user info when logged in', async () => {
      // Mock logged in state
      jest.mocked(getUserEmail).mockReturnValue('test@example.com');
      jest.mocked(cloudConfig.getApiKey).mockReturnValue('test-api-key');
      jest.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');
      jest.mocked(cloudConfig.getAppUrl).mockReturnValue('https://app.example.com');

      // Mock successful user info response
      jest.mocked(fetchWithProxy).mockResolvedValueOnce(
        createMockResponse({
          ok: true,
          body: {
            user: mockCloudUser,
            organization: { name: 'Test Org' },
          },
        }),
      );

      // Execute whoami command
      const whoamiCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'whoami');
      await whoamiCmd?.parseAsync(['node', 'test']);

      // Verify output
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Currently logged in as:'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('test@example.com'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Test Org'));
    });

    it('should handle not logged in state', async () => {
      // Mock not logged in state
      jest.mocked(getUserEmail).mockReturnValue(null);
      jest.mocked(cloudConfig.getApiKey).mockReturnValue(undefined);

      // Execute whoami command
      const whoamiCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'whoami');
      await whoamiCmd?.parseAsync(['node', 'test']);

      // Verify output
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Not logged in'));
    });

    it('should handle API error', async () => {
      // Mock logged in state but API error
      jest.mocked(getUserEmail).mockReturnValue('test@example.com');
      jest.mocked(cloudConfig.getApiKey).mockReturnValue('test-api-key');
      jest.mocked(cloudConfig.getApiHost).mockReturnValue('https://api.example.com');

      // Mock failed user info response
      jest.mocked(fetchWithProxy).mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          statusText: 'Internal Server Error',
        }),
      );

      // Execute whoami command
      const whoamiCmd = program.commands
        .find((cmd) => cmd.name() === 'auth')
        ?.commands.find((cmd) => cmd.name() === 'whoami');
      await whoamiCmd?.parseAsync(['node', 'test']);

      // Verify error handling
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Failed to get user info'));
      expect(process.exitCode).toBe(1);
    });
  });
});
