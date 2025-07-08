import { isCI } from '../../src/envars';
import logger from '../../src/logger';
import {
  clearGlobalAbortController,
  getGlobalAbortController,
  setupSignalHandlers,
} from '../../src/util/abortController';

// Mock dependencies before imports
jest.mock('../../src/envars', () => ({
  isCI: jest.fn(),
}));

jest.mock('../../src/logger', () => ({
  info: jest.fn(),
}));

const mockIsCI = jest.mocked(isCI);
const mockLoggerInfo = jest.mocked(logger.info);

describe('abortController', () => {
  let mockProcess: {
    on: jest.Mock;
    exit: jest.Mock;
  };
  let originalProcess: NodeJS.Process;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Clear any existing abort controller
    clearGlobalAbortController();

    // Mock process object
    mockProcess = {
      on: jest.fn(),
      exit: jest.fn(),
    };

    // Store original process and replace with mock
    originalProcess = global.process;
    global.process = mockProcess as any;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.resetAllMocks();
    // Restore original process
    global.process = originalProcess;
  });

  describe('setupSignalHandlers', () => {
    it('should register SIGINT and SIGTERM handlers', () => {
      setupSignalHandlers();

      expect(mockProcess.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
      expect(mockProcess.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    });

    it('should handle SIGINT signal when no abort controller exists', () => {
      setupSignalHandlers();

      const sigintHandler = mockProcess.on.mock.calls.find((call) => call[0] === 'SIGINT')?.[1];

      expect(sigintHandler).toBeDefined();

      // Call the handler
      sigintHandler();

      expect(mockProcess.exit).toHaveBeenCalledWith(0);
    });

    it('should handle SIGINT signal when abort controller exists', () => {
      mockIsCI.mockReturnValue(false);

      setupSignalHandlers();
      const abortController = getGlobalAbortController();

      const sigintHandler = mockProcess.on.mock.calls.find((call) => call[0] === 'SIGINT')?.[1];

      expect(sigintHandler).toBeDefined();

      // Call the handler
      sigintHandler();

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        '\nReceived SIGINT. Cancelling evaluation and cleaning up...',
      );
      expect(abortController.signal.aborted).toBe(true);
    });

    it('should exit quickly in CI environment', () => {
      mockIsCI.mockReturnValue(true);

      setupSignalHandlers();
      const abortController = getGlobalAbortController();

      const sigintHandler = mockProcess.on.mock.calls.find((call) => call[0] === 'SIGINT')?.[1];

      // Call the handler
      sigintHandler();

      expect(abortController.signal.aborted).toBe(true);

      // Fast forward the timer
      jest.advanceTimersByTime(2000);

      expect(mockLoggerInfo).toHaveBeenCalledWith('Evaluation cancelled. Exiting...');
      expect(mockProcess.exit).toHaveBeenCalledWith(0);
    });

    it('should reset signalHandled flag after delay in interactive mode', () => {
      mockIsCI.mockReturnValue(false);

      setupSignalHandlers();
      const abortController = getGlobalAbortController();

      const sigintHandler = mockProcess.on.mock.calls.find((call) => call[0] === 'SIGINT')?.[1];

      // First signal
      sigintHandler();
      expect(abortController.signal.aborted).toBe(true);

      // Try to handle another signal immediately - should be ignored
      sigintHandler();

      // Should not log again since signalHandled is true
      expect(mockLoggerInfo).toHaveBeenCalledTimes(1);

      // Fast forward to reset the flag
      jest.advanceTimersByTime(5000);

      // Clear the abort controller to simulate no evaluation running
      clearGlobalAbortController();

      // Now another signal should work and exit immediately since no controller exists
      sigintHandler();
      expect(mockProcess.exit).toHaveBeenCalledWith(0);
    });

    it('should handle SIGTERM signal', () => {
      mockIsCI.mockReturnValue(false);

      setupSignalHandlers();
      const abortController = getGlobalAbortController();

      const sigtermHandler = mockProcess.on.mock.calls.find((call) => call[0] === 'SIGTERM')?.[1];

      expect(sigtermHandler).toBeDefined();

      // Call the handler
      sigtermHandler();

      expect(mockLoggerInfo).toHaveBeenCalledWith(
        '\nReceived SIGTERM. Cancelling evaluation and cleaning up...',
      );
      expect(abortController.signal.aborted).toBe(true);
    });
  });

  describe('getGlobalAbortController', () => {
    it('should create a new abort controller if none exists', () => {
      const controller = getGlobalAbortController();

      expect(controller).toBeInstanceOf(AbortController);
      expect(controller.signal.aborted).toBe(false);
    });

    it('should return the same controller on subsequent calls', () => {
      const controller1 = getGlobalAbortController();
      const controller2 = getGlobalAbortController();

      expect(controller1).toBe(controller2);
    });

    it('should create a new controller if the current one is aborted', () => {
      const controller1 = getGlobalAbortController();
      controller1.abort();

      const controller2 = getGlobalAbortController();

      expect(controller1).not.toBe(controller2);
      expect(controller1.signal.aborted).toBe(true);
      expect(controller2.signal.aborted).toBe(false);
    });
  });

  describe('clearGlobalAbortController', () => {
    it('should clear the global abort controller', () => {
      const controller = getGlobalAbortController();
      expect(controller).toBeDefined();

      clearGlobalAbortController();

      const newController = getGlobalAbortController();
      expect(newController).not.toBe(controller);
    });

    it('should reset the signalHandled flag', () => {
      mockIsCI.mockReturnValue(false);

      setupSignalHandlers();
      getGlobalAbortController();

      const sigintHandler = mockProcess.on.mock.calls.find((call) => call[0] === 'SIGINT')?.[1];

      // Trigger signal to set signalHandled flag
      sigintHandler();

      clearGlobalAbortController();

      // Should be able to handle signals again immediately
      const _newController = getGlobalAbortController();
      sigintHandler();

      expect(mockLoggerInfo).toHaveBeenCalledTimes(2); // Both signals should be processed
    });
  });

  describe('integration scenarios', () => {
    it('should handle multiple sequential abort controllers correctly', () => {
      const controller1 = getGlobalAbortController();
      expect(controller1.signal.aborted).toBe(false);

      controller1.abort();
      expect(controller1.signal.aborted).toBe(true);

      const controller2 = getGlobalAbortController();
      expect(controller2.signal.aborted).toBe(false);
      expect(controller2).not.toBe(controller1);

      clearGlobalAbortController();

      const controller3 = getGlobalAbortController();
      expect(controller3).not.toBe(controller1);
      expect(controller3).not.toBe(controller2);
      expect(controller3.signal.aborted).toBe(false);
    });

    it('should handle signal when controller is cleared mid-process', () => {
      setupSignalHandlers();
      getGlobalAbortController();

      clearGlobalAbortController();

      const sigintHandler = mockProcess.on.mock.calls.find((call) => call[0] === 'SIGINT')?.[1];

      // Should exit immediately since no controller exists
      sigintHandler();
      expect(mockProcess.exit).toHaveBeenCalledWith(0);
    });
  });
});
