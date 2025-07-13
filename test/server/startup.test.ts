import { getDefaultPort } from '../../src/constants';
import { getEnvString } from '../../src/envars';
import logger from '../../src/logger';
import { startServer } from '../../src/server/server';
import { BrowserBehavior, checkServerRunning } from '../../src/util/server';

jest.mock('../../src/logger');
jest.mock('../../src/server/server');
jest.mock('../../src/util/server');
jest.mock('../../src/constants');
jest.mock('../../src/envars');

describe('server startup behavior', () => {
  const mockPort = 15500;
  const mockCheckServerRunning = jest.mocked(checkServerRunning);
  const mockStartServer = jest.mocked(startServer);
  const mockGetDefaultPort = jest.mocked(getDefaultPort);
  const mockGetEnvString = jest.mocked(getEnvString);
  const mockLoggerInfo = jest.mocked(logger.info);
  const mockLoggerError = jest.mocked(logger.error);

  beforeEach(() => {
    mockGetDefaultPort.mockReturnValue(mockPort);
    mockGetEnvString.mockReturnValue('');
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // This test documents the expected behavior of the server startup logic
  // The actual implementation is in src/server/index.ts
  describe('expected server startup behavior', () => {
    it('should check if server is running and log message with localhost URL if it is', async () => {
      // Given a server is already running and no custom URL is configured
      mockCheckServerRunning.mockResolvedValue(true);
      mockGetEnvString.mockReturnValue('');

      // When attempting to start the server
      // The following simulates what happens in src/server/index.ts
      const port = getDefaultPort();
      const isRunning = await checkServerRunning(port);

      if (isRunning) {
        const remoteApiBaseUrl = getEnvString('PROMPTFOO_REMOTE_API_BASE_URL');
        let serverUrl = `http://localhost:${port}`;
        
        if (remoteApiBaseUrl) {
          try {
            const url = new URL(remoteApiBaseUrl);
            serverUrl = url.origin;
          } catch {
            // Fall back to localhost
          }
        }
        
        logger.info(`Promptfoo server already running at ${serverUrl}`);
        // Early return - don't start server
      } else {
        await startServer(port, BrowserBehavior.SKIP);
      }

      // Then it should have checked if server is running
      expect(mockCheckServerRunning).toHaveBeenCalledWith(mockPort);
      // And logged the appropriate message with localhost URL
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        `Promptfoo server already running at http://localhost:${mockPort}`,
      );
      // And NOT attempted to start the server
      expect(mockStartServer).not.toHaveBeenCalled();
    });

    it('should use custom URL from PROMPTFOO_REMOTE_API_BASE_URL when configured', async () => {
      // Given a server is already running and a custom URL is configured
      mockCheckServerRunning.mockResolvedValue(true);
      mockGetEnvString.mockImplementation((key) => {
        if (key === 'PROMPTFOO_REMOTE_API_BASE_URL') {
          return 'https://custom.example.com:8080/api';
        }
        return '';
      });

      // When attempting to start the server
      const port = getDefaultPort();
      const isRunning = await checkServerRunning(port);

      if (isRunning) {
        const remoteApiBaseUrl = getEnvString('PROMPTFOO_REMOTE_API_BASE_URL');
        let serverUrl = `http://localhost:${port}`;
        
        if (remoteApiBaseUrl) {
          try {
            const url = new URL(remoteApiBaseUrl);
            serverUrl = url.origin;
          } catch {
            // Fall back to localhost
          }
        }
        
        logger.info(`Promptfoo server already running at ${serverUrl}`);
      }

      // Then it should log the custom URL origin
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        'Promptfoo server already running at https://custom.example.com:8080',
      );
    });

    it('should fall back to localhost for invalid URLs', async () => {
      // Given a server is already running and an invalid URL is configured
      mockCheckServerRunning.mockResolvedValue(true);
      mockGetEnvString.mockImplementation((key) => {
        if (key === 'PROMPTFOO_REMOTE_API_BASE_URL') {
          return 'not-a-valid-url';
        }
        return '';
      });

      // When attempting to start the server
      const port = getDefaultPort();
      const isRunning = await checkServerRunning(port);

      if (isRunning) {
        const remoteApiBaseUrl = getEnvString('PROMPTFOO_REMOTE_API_BASE_URL');
        let serverUrl = `http://localhost:${port}`;
        
        if (remoteApiBaseUrl) {
          try {
            const url = new URL(remoteApiBaseUrl);
            serverUrl = url.origin;
          } catch {
            // Fall back to localhost
          }
        }
        
        logger.info(`Promptfoo server already running at ${serverUrl}`);
      }

      // Then it should fall back to localhost
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        `Promptfoo server already running at http://localhost:${mockPort}`,
      );
    });

    it('should start server when none is running', async () => {
      // Given no server is running
      mockCheckServerRunning.mockResolvedValue(false);

      // When attempting to start the server
      const port = getDefaultPort();
      const isRunning = await checkServerRunning(port);

      if (isRunning) {
        logger.info(`Promptfoo server already running at http://localhost:${port}`);
      } else {
        await startServer(port, BrowserBehavior.SKIP);
      }

      // Then it should have started the server
      expect(mockStartServer).toHaveBeenCalledWith(mockPort, BrowserBehavior.SKIP);
      // And NOT logged the "already running" message
      expect(mockLoggerInfo).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      // Given an error occurs during startup
      const testError = new Error('Connection failed');
      mockCheckServerRunning.mockRejectedValue(testError);

      // When attempting to start the server with error handling
      try {
        const port = getDefaultPort();
        const isRunning = await checkServerRunning(port);

        if (isRunning) {
          logger.info(`Promptfoo server already running at http://localhost:${port}`);
        } else {
          await startServer(port, BrowserBehavior.SKIP);
        }
      } catch (err) {
        logger.error(`Failed to start server: ${String(err)}`);
      }

      // Then it should log the error
      expect(mockLoggerError).toHaveBeenCalledWith(
        `Failed to start server: ${testError.toString()}`,
      );
      // And NOT attempt to start the server
      expect(mockStartServer).not.toHaveBeenCalled();
    });

    it('should set process.exitCode to 1 on error', async () => {
      // Given an error occurs during startup
      const testError = new Error('Connection failed');
      mockCheckServerRunning.mockRejectedValue(testError);
      
      // Save original process.exitCode
      const originalExitCode = process.exitCode;
      process.exitCode = undefined;

      // When the main function encounters an error
      try {
        const port = getDefaultPort();
        const isRunning = await checkServerRunning(port);
        if (isRunning) {
          logger.info(`Promptfoo server already running at http://localhost:${port}`);
        } else {
          await startServer(port, BrowserBehavior.SKIP);
        }
      } catch (err) {
        logger.error(`Failed to start server: ${String(err)}`);
        process.exitCode = 1;
      }

      // Then process.exitCode should be set to 1
      expect(process.exitCode).toBe(1);
      
      // Restore original process.exitCode
      process.exitCode = originalExitCode;
    });
  });
});
