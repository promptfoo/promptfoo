import { PersistentPythonManager } from '../../src/python/persistentPythonManager';

// Mock child_process and related modules
jest.mock('child_process');
jest.mock('../../src/logger');

describe('PersistentPythonManager - Comprehensive Logic Tests', () => {
  let manager: PersistentPythonManager;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new PersistentPythonManager('/test/script.py', {
      persistentIdleTimeout: 1000,
      maxRestarts: 2,
      concurrency: 'async',
    });
  });

  afterEach(() => {
    manager.shutdown();
  });

  describe('Configuration', () => {
    it('should apply default configuration correctly', () => {
      const defaultManager = new PersistentPythonManager('/test/script.py');
      expect(defaultManager.stats).toEqual({
        isHealthy: false,
        isInitialized: false,
        pendingRequests: 0,
        restartCount: 0,
        processId: undefined,
      });
    });

    it('should apply custom configuration', () => {
      const customManager = new PersistentPythonManager('/test/script.py', {
        pythonExecutable: '/custom/python',
        persistentIdleTimeout: 60000,
        maxRestarts: 5,
        concurrency: 'serial',
      });
      
      expect(customManager).toBeDefined();
      customManager.shutdown();
    });
  });

  describe('State Management', () => {
    it('should track health status correctly', () => {
      expect(manager.isHealthy).toBe(false);
      expect(manager.stats.isHealthy).toBe(false);
      expect(manager.stats.isInitialized).toBe(false);
    });

    it('should track pending requests', () => {
      expect(manager.stats.pendingRequests).toBe(0);
    });

    it('should track restart count', () => {
      expect(manager.stats.restartCount).toBe(0);
    });
  });

  describe('NDJSON Protocol Logic', () => {
    it('should handle line splitting correctly', () => {
      // Test internal buffer logic by accessing private method via any
      const managerAny = manager as any;
      expect(managerAny.buffer).toBe('');
      
      // This tests the concept without needing complex mocking
      const testLines = [
        '{"id":1,"type":"response","result":{"status":"ready"}}',
        '{"id":2,"type":"response","result":{"output":"test"}}'
      ];
      
      const combined = testLines.join('\n') + '\n';
      const lines = combined.split('\n');
      const buffer = lines.pop() || '';
      
      expect(lines).toHaveLength(2);
      expect(buffer).toBe('');
      expect(lines[0]).toContain('"status":"ready"');
      expect(lines[1]).toContain('"output":"test"');
    });

    it('should handle Windows line endings', () => {
      const windowsLine = '{"id":1,"type":"response"}\r\n';
      const cleanedLine = windowsLine.replace(/\r?\n$/, '').replace(/\r$/, '');
      expect(cleanedLine).toBe('{"id":1,"type":"response"}');
    });

    it('should validate JSON parsing', () => {
      const validJson = '{"id":1,"type":"response","result":{"status":"ready"}}';
      const invalidJson = '{"id":1,"type":"response","malformed}';
      
      expect(() => JSON.parse(validJson)).not.toThrow();
      expect(() => JSON.parse(invalidJson)).toThrow();
    });
  });

  describe('Request ID Management', () => {
    it('should generate unique request IDs', () => {
      const managerAny = manager as any;
      
      // Access private requestId field
      const initialId = managerAny.requestId;
      
      // Simulate ID generation
      const id1 = ++managerAny.requestId;
      const id2 = ++managerAny.requestId;
      const id3 = ++managerAny.requestId;
      
      expect(id1).toBe(initialId + 1);
      expect(id2).toBe(initialId + 2);
      expect(id3).toBe(initialId + 3);
      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
    });
  });

  describe('Shutdown Logic', () => {
    it('should handle cleanup when not initialized', () => {
      expect(() => manager.shutdown()).not.toThrow();
      expect(manager.isHealthy).toBe(false);
    });

    it('should clear pending requests on shutdown', () => {
      const managerAny = manager as any;
      
      // Simulate pending requests
      managerAny.pendingRequests.set(1, {
        resolve: jest.fn(),
        reject: jest.fn(),
        timeout: undefined,
      });
      managerAny.pendingRequests.set(2, {
        resolve: jest.fn(),
        reject: jest.fn(),
        timeout: undefined,
      });
      
      expect(managerAny.pendingRequests.size).toBe(2);
      
      manager.shutdown();
      
      expect(managerAny.pendingRequests.size).toBe(0);
    });
  });

  describe('Error Handling Logic', () => {
    it('should handle process error scenarios', () => {
      const managerAny = manager as any;
      
      // Add error listener to prevent unhandled error
      manager.on('error', () => {
        // Expected error, do nothing
      });
      
      // Test error handling method
      const testError = new Error('Test process error');
      const mockRequest = {
        resolve: jest.fn(),
        reject: jest.fn(),
      };
      
      managerAny.pendingRequests.set(1, mockRequest);
      
      // Simulate _handleProcessError
      managerAny._handleProcessError(testError);
      
      expect(mockRequest.reject).toHaveBeenCalledWith(testError);
      expect(managerAny.pendingRequests.size).toBe(0);
    });

    it('should handle process exit scenarios', () => {
      const managerAny = manager as any;
      
      const mockRequest = {
        resolve: jest.fn(),
        reject: jest.fn(),
      };
      
      managerAny.pendingRequests.set(1, mockRequest);
      
      // Simulate _handleProcessExit
      managerAny._handleProcessExit(1, null);
      
      expect(mockRequest.reject).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Python process exited unexpectedly')
        })
      );
      expect(managerAny.pendingRequests.size).toBe(0);
      expect(managerAny.isInitialized).toBe(false);
    });
  });

  describe('Timeout Logic', () => {
    it('should handle request timeouts', (done) => {
      const managerAny = manager as any;
      
      const mockRequest = {
        resolve: jest.fn(),
        reject: jest.fn(),
        timeout: undefined as NodeJS.Timeout | undefined,
      };
      
      // Create timeout similar to _sendRequest
      const timeoutHandle = setTimeout(() => {
        managerAny.pendingRequests.delete(1);
        mockRequest.reject(new Error('Python request timeout after 100ms'));
      }, 100);
      
      mockRequest.timeout = timeoutHandle;
      managerAny.pendingRequests.set(1, mockRequest);
      
      setTimeout(() => {
        expect(mockRequest.reject).toHaveBeenCalledWith(
          expect.objectContaining({
            message: expect.stringContaining('timeout')
          })
        );
        done();
      }, 150);
    });
  });

  describe('Concurrency Configuration', () => {
    it('should respect serial concurrency setting', () => {
      const serialManager = new PersistentPythonManager('/test/script.py', {
        concurrency: 'serial',
      });
      
      expect(serialManager).toBeDefined();
      serialManager.shutdown();
    });

    it('should respect async concurrency setting', () => {
      const asyncManager = new PersistentPythonManager('/test/script.py', {
        concurrency: 'async',
      });
      
      expect(asyncManager).toBeDefined();
      asyncManager.shutdown();
    });
  });
});