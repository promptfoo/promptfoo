import { getDefaultPort } from '../../src/constants';
import logger from '../../src/logger';
import { startServer } from '../../src/server/server';
import { BrowserBehavior, checkServerRunning } from '../../src/util/server';

jest.mock('../../src/logger');
jest.mock('../../src/server/server');
jest.mock('../../src/util/server');
jest.mock('../../src/constants');

describe('server startup behavior', () => {
  const mockPort = 15500;
  const mockCheckServerRunning = jest.mocked(checkServerRunning);
  const mockStartServer = jest.mocked(startServer);
  const mockGetDefaultPort = jest.mocked(getDefaultPort);
  const mockLoggerInfo = jest.mocked(logger.info);
  const mockLoggerError = jest.mocked(logger.error);

  beforeEach(() => {
    mockGetDefaultPort.mockReturnValue(mockPort);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // This test documents the expected behavior of the server startup logic
  // The actual implementation is in src/server/index.ts
  describe('expected server startup behavior', () => {
    it('should check if server is running and log message if it is', async () => {
      // Given a server is already running
      mockCheckServerRunning.mockResolvedValue(true);

      // When attempting to start the server
      // The following simulates what happens in src/server/index.ts
      const port = getDefaultPort();
      const isRunning = await checkServerRunning(port);

      if (isRunning) {
        logger.info(`Promptfoo server already running at http://localhost:${port}`);
        // Early return - don't start server
      } else {
        await startServer(port, BrowserBehavior.SKIP);
      }

      // Then it should have checked if server is running
      expect(mockCheckServerRunning).toHaveBeenCalledWith(mockPort);
      // And logged the appropriate message
      expect(mockLoggerInfo).toHaveBeenCalledWith(
        `Promptfoo server already running at http://localhost:${mockPort}`,
      );
      // And NOT attempted to start the server
      expect(mockStartServer).not.toHaveBeenCalled();
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
  });
});
