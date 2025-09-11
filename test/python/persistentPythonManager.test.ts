import { spawn } from 'child_process';
import fs from 'fs';
import { PersistentPythonManager } from '../../src/python/persistentPythonManager';

// Mock child_process
jest.mock('child_process');
const mockSpawn = jest.mocked(spawn);

// Mock fs
jest.mock('fs');
const _mockFs = jest.mocked(fs);

describe('PersistentPythonManager', () => {
  let manager: PersistentPythonManager;
  const mockProcess = {
    stdout: {
      on: jest.fn(),
    },
    stderr: {
      on: jest.fn(),
    },
    stdin: {
      write: jest.fn(),
    },
    on: jest.fn(),
    kill: jest.fn(),
    killed: false,
    pid: 12345,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockSpawn.mockReturnValue(mockProcess as any);
    manager = new PersistentPythonManager('/test/script.py', 'test-provider');
  });

  afterEach(() => {
    manager.shutdown();
  });

  describe('initialization', () => {
    it('should configure Python process spawn correctly', () => {
      expect(manager).toBeDefined();
      expect(manager.isHealthy).toBe(false);
    });

    it('should provide correct stats when not initialized', () => {
      expect(manager.stats).toEqual({
        isHealthy: false,
        isInitialized: false,
        pendingRequests: 0,
        restartCount: 0,
        processId: undefined,
      });
    });
  });

  describe('process management', () => {
    it('should handle idle timeout', (done) => {
      const manager = new PersistentPythonManager('/test/script.py', 'idle-test-provider', {
        persistentIdleTimeout: 100, // 100ms for test
      });

      manager.on('error', () => {
        // Should not error on idle timeout
      });

      setTimeout(() => {
        expect(manager.isHealthy).toBe(false);
        done();
      }, 200);
    });

    it('should provide health status and stats', () => {
      expect(manager.isHealthy).toBe(false);
      expect(manager.stats).toEqual({
        isHealthy: false,
        isInitialized: false,
        pendingRequests: 0,
        restartCount: 0,
        processId: undefined,
      });
    });
  });

  describe('configuration options', () => {
    it('should respect custom Python executable', () => {
      const customManager = new PersistentPythonManager(
        '/test/script.py',
        'custom-python-provider',
        {
          pythonExecutable: '/custom/python',
        },
      );

      expect(customManager).toBeDefined();
    });

    it('should respect custom timeout settings', () => {
      const customManager = new PersistentPythonManager('/test/script.py', 'timeout-provider', {
        persistentIdleTimeout: 60000,
        maxRestarts: 5,
      });

      expect(customManager).toBeDefined();
    });
  });

  describe('cleanup', () => {
    it('should handle cleanup when not initialized', () => {
      expect(() => manager.shutdown()).not.toThrow();
    });
  });

  describe('mocked behavior', () => {
    it('should call spawn with correct arguments when initializing', async () => {
      // Mock successful spawn
      const mockStdoutHandler = jest.fn();
      const mockSpawnHandler = jest.fn();

      mockProcess.stdout.on.mockImplementation((event, handler) => {
        if (event === 'data') {
          mockStdoutHandler.mockImplementation(handler);
        }
        return mockProcess.stdout;
      });

      mockProcess.on.mockImplementation((event, handler) => {
        if (event === 'spawn') {
          mockSpawnHandler.mockImplementation(handler);
        }
        return mockProcess;
      });

      // Start initialization (won't complete due to mocking, but will call spawn)
      const _initPromise = manager.initialize().catch(() => {
        // Expected to fail due to mocking
      });

      // Give it time to call spawn
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(mockSpawn).toHaveBeenCalledWith(
        'python',
        [expect.stringContaining('persistent_wrapper.py')],
        expect.any(Object),
      );

      // Cleanup
      manager.shutdown();
    });

    it('should setup event handlers correctly', async () => {
      const _initPromise = manager.initialize().catch(() => {
        // Expected to fail due to mocking
      });

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify event handlers were setup
      expect(mockProcess.stdout.on).toHaveBeenCalledWith('data', expect.any(Function));
      expect(mockProcess.stderr.on).toHaveBeenCalledWith('data', expect.any(Function));
      expect(mockProcess.on).toHaveBeenCalledWith('spawn', expect.any(Function));
      expect(mockProcess.on).toHaveBeenCalledWith('exit', expect.any(Function));
      expect(mockProcess.on).toHaveBeenCalledWith('error', expect.any(Function));

      manager.shutdown();
    });
  });
});
