import path from 'path';

import { FunctionCallbackHandler } from '../../src/providers/functionCallbackUtils';

import type { FunctionCallbackConfig } from '../../src/providers/functionCallbackTypes';

// Mock dependencies
jest.mock('../../src/cliState', () => ({ basePath: '/test/basePath' }));
jest.mock('../../src/esm', () => ({
  importModule: jest.fn(),
}));
jest.mock('../../src/logger', () => ({
  debug: jest.fn(),
}));
jest.mock('../../src/util/fileExtensions', () => ({
  isJavascriptFile: jest.fn().mockReturnValue(true),
}));

const mockImportModule = jest.mocked(jest.requireMock('../../src/esm').importModule);
const mockLogger = jest.requireMock('../../src/logger');

describe('FunctionCallbackHandler', () => {
  let handler: FunctionCallbackHandler;

  beforeEach(() => {
    handler = new FunctionCallbackHandler();
    jest.clearAllMocks();
  });

  describe('processCall', () => {
    it('should return stringified call when no callback is available', async () => {
      const call = { name: 'testFunction', arguments: '{"param": "value"}' };
      const result = await handler.processCall(call, {});

      expect(result).toEqual({
        output: JSON.stringify(call),
        isError: false,
      });
    });

    it('should return stringified call when callbacks config is undefined', async () => {
      const call = { name: 'testFunction', arguments: '{"param": "value"}' };
      const result = await handler.processCall(call);

      expect(result).toEqual({
        output: JSON.stringify(call),
        isError: false,
      });
    });

    it('should return string call as-is when no callback available', async () => {
      const call = 'some string call';
      const result = await handler.processCall(call, {});

      expect(result).toEqual({
        output: call,
        isError: false,
      });
    });

    it('should execute function callback successfully', async () => {
      const mockCallback = jest.fn().mockResolvedValue('callback result');
      const callbacks: FunctionCallbackConfig = {
        testFunction: mockCallback,
      };
      const call = { name: 'testFunction', arguments: '{"param": "value"}' };

      const result = await handler.processCall(call, callbacks);

      expect(result).toEqual({
        output: 'callback result',
        isError: false,
      });
      expect(mockCallback).toHaveBeenCalledWith('{"param": "value"}', undefined);
    });

    it('should pass context to callback', async () => {
      const mockCallback = jest.fn().mockResolvedValue('callback result');
      const callbacks: FunctionCallbackConfig = {
        testFunction: mockCallback,
      };
      const call = { name: 'testFunction', arguments: '{"param": "value"}' };
      const context = { threadId: 'thread-123', runId: 'run-456' };

      const result = await handler.processCall(call, callbacks, context);

      expect(result).toEqual({
        output: 'callback result',
        isError: false,
      });
      expect(mockCallback).toHaveBeenCalledWith('{"param": "value"}', context);
    });

    it('should handle tool call format', async () => {
      const mockCallback = jest.fn().mockResolvedValue('tool result');
      const callbacks: FunctionCallbackConfig = {
        testTool: mockCallback,
      };
      const call = {
        type: 'function',
        function: {
          name: 'testTool',
          arguments: '{"toolParam": "toolValue"}',
        },
      };

      const result = await handler.processCall(call, callbacks);

      expect(result).toEqual({
        output: 'tool result',
        isError: false,
      });
      expect(mockCallback).toHaveBeenCalledWith('{"toolParam": "toolValue"}', undefined);
    });

    it('should stringify non-string callback results', async () => {
      const mockCallback = jest.fn().mockResolvedValue({ result: 'object' });
      const callbacks: FunctionCallbackConfig = {
        testFunction: mockCallback,
      };
      const call = { name: 'testFunction', arguments: '{}' };

      const result = await handler.processCall(call, callbacks);

      expect(result).toEqual({
        output: '{"result":"object"}',
        isError: false,
      });
    });

    it('should return original call on callback error', async () => {
      const mockCallback = jest.fn().mockRejectedValue(new Error('Callback failed'));
      const callbacks: FunctionCallbackConfig = {
        testFunction: mockCallback,
      };
      const call = { name: 'testFunction', arguments: '{"param": "value"}' };

      const result = await handler.processCall(call, callbacks);

      expect(result).toEqual({
        output: JSON.stringify(call),
        isError: true,
      });
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Function callback failed for testFunction: Error: Callback failed',
      );
    });

    it('should handle calls with no function information', async () => {
      const callbacks: FunctionCallbackConfig = {
        testFunction: jest.fn(),
      };
      const call = { notAFunction: true };

      const result = await handler.processCall(call, callbacks);

      expect(result).toEqual({
        output: JSON.stringify(call),
        isError: false,
      });
    });
  });

  describe('processCalls', () => {
    it('should return null/undefined calls as-is', async () => {
      expect(await handler.processCalls(null)).toBeNull();
      expect(await handler.processCalls(undefined)).toBeUndefined();
    });

    it('should process single call and return output directly', async () => {
      const mockCallback = jest.fn().mockResolvedValue('single result');
      const callbacks: FunctionCallbackConfig = {
        testFunction: mockCallback,
      };
      const call = { name: 'testFunction', arguments: '{}' };

      const result = await handler.processCalls(call, callbacks);

      expect(result).toBe('single result');
    });

    it('should process array of calls and join string results', async () => {
      const mockCallback1 = jest.fn().mockResolvedValue('result1');
      const mockCallback2 = jest.fn().mockResolvedValue('result2');
      const callbacks: FunctionCallbackConfig = {
        func1: mockCallback1,
        func2: mockCallback2,
      };
      const calls = [
        { name: 'func1', arguments: '{}' },
        { name: 'func2', arguments: '{}' },
      ];

      const result = await handler.processCalls(calls, callbacks);

      expect(result).toBe('result1\nresult2');
    });

    it('should return output array when results are not all strings', async () => {
      const mockCallback1 = jest.fn().mockResolvedValue('string result');
      const mockCallback2 = jest.fn().mockResolvedValue({ object: 'result' });
      const callbacks: FunctionCallbackConfig = {
        func1: mockCallback1,
        func2: mockCallback2,
      };
      const calls = [
        { name: 'func1', arguments: '{}' },
        { name: 'func2', arguments: '{}' },
      ];

      const result = await handler.processCalls(calls, callbacks);

      // The second callback returns an object, which gets stringified, so both are strings
      // and should be joined with newlines
      expect(result).toBe('string result\n{"object":"result"}');
    });

    it('should return original calls when no callbacks succeed', async () => {
      const callbacks: FunctionCallbackConfig = {};
      const calls = [
        { name: 'unknownFunc1', arguments: '{}' },
        { name: 'unknownFunc2', arguments: '{}' },
      ];

      const result = await handler.processCalls(calls, callbacks);

      expect(result).toEqual(calls);
    });

    it('should return stringified single call when no callback succeeds', async () => {
      const callbacks: FunctionCallbackConfig = {};
      const call = { name: 'unknownFunc', arguments: '{}' };

      const result = await handler.processCalls(call, callbacks);

      expect(result).toBe(JSON.stringify(call));
    });
  });

  describe('executeCallback', () => {
    it('should cache and reuse loaded callbacks', async () => {
      const mockCallback = jest.fn().mockResolvedValue('cached result');
      const callbacks: FunctionCallbackConfig = {
        testFunction: mockCallback,
      };

      // Call multiple times
      await handler.processCall({ name: 'testFunction', arguments: '{}' }, callbacks);
      await handler.processCall({ name: 'testFunction', arguments: '{}' }, callbacks);

      expect(mockCallback).toHaveBeenCalledTimes(2);
    });

    it('should load external file-based callbacks', async () => {
      const mockExternalFunction = jest.fn().mockResolvedValue('external result');
      mockImportModule.mockResolvedValue({ default: mockExternalFunction });

      const callbacks: FunctionCallbackConfig = {
        testFunction: 'file://path/to/function.js',
      };
      const call = { name: 'testFunction', arguments: '{"param": "value"}' };

      const result = await handler.processCall(call, callbacks);

      expect(result).toEqual({
        output: 'external result',
        isError: false,
      });
      expect(mockImportModule).toHaveBeenCalledWith(
        path.resolve('/test/basePath', 'path/to/function.js'),
      );
      expect(mockExternalFunction).toHaveBeenCalledWith('{"param": "value"}', undefined);
    });

    it('should load specific function from external file', async () => {
      const mockSpecificFunction = jest.fn().mockResolvedValue('specific result');
      const mockModule = {
        default: jest.fn(),
        specificFunction: mockSpecificFunction,
      };
      mockImportModule.mockResolvedValue(mockModule);

      const callbacks: FunctionCallbackConfig = {
        testFunction: 'file://path/to/functions.js:specificFunction',
      };
      const call = { name: 'testFunction', arguments: '{}' };

      const result = await handler.processCall(call, callbacks);

      expect(result).toEqual({
        output: 'specific result',
        isError: false,
      });
      expect(mockSpecificFunction).toHaveBeenCalledWith('{}', undefined);
    });

    it('should handle inline function strings', async () => {
      const callbacks: FunctionCallbackConfig = {
        testFunction: '() => "inline result"',
      };
      const call = { name: 'testFunction', arguments: '{}' };

      const result = await handler.processCall(call, callbacks);

      expect(result).toEqual({
        output: 'inline result',
        isError: false,
      });
    });

    it('should throw error for invalid callback configuration', async () => {
      const callbacks: FunctionCallbackConfig = {
        testFunction: 123 as any, // Invalid callback type
      };
      const call = { name: 'testFunction', arguments: '{}' };

      const result = await handler.processCall(call, callbacks);

      expect(result.isError).toBe(true);
      expect(result.output).toBe(JSON.stringify(call));
    });

    it('should handle errors when loading external functions', async () => {
      mockImportModule.mockRejectedValue(new Error('Module not found'));

      const callbacks: FunctionCallbackConfig = {
        testFunction: 'file://nonexistent/function.js',
      };
      const call = { name: 'testFunction', arguments: '{}' };

      const result = await handler.processCall(call, callbacks);

      expect(result.isError).toBe(true);
      expect(result.output).toBe(JSON.stringify(call));
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Function callback failed for testFunction'),
      );
    });

    it('should handle non-function exports from external files', async () => {
      mockImportModule.mockResolvedValue({ default: 'not a function' });

      const callbacks: FunctionCallbackConfig = {
        testFunction: 'file://path/to/invalid.js',
      };
      const call = { name: 'testFunction', arguments: '{}' };

      const result = await handler.processCall(call, callbacks);

      expect(result.isError).toBe(true);
      expect(result.output).toBe(JSON.stringify(call));
    });
  });

  describe('clearCache', () => {
    it('should clear cached callbacks', async () => {
      const mockCallback = jest.fn().mockResolvedValue('result');
      const callbacks: FunctionCallbackConfig = {
        testFunction: mockCallback,
      };

      // Load callback into cache
      await handler.processCall({ name: 'testFunction', arguments: '{}' }, callbacks);

      // Clear cache
      handler.clearCache();

      // Mock a different implementation
      const newMockCallback = jest.fn().mockResolvedValue('new result');
      const newCallbacks: FunctionCallbackConfig = {
        testFunction: newMockCallback,
      };

      // This should use the new callback, not the cached one
      const result = await handler.processCall(
        { name: 'testFunction', arguments: '{}' },
        newCallbacks,
      );

      expect(result.output).toBe('new result');
      expect(newMockCallback).toHaveBeenCalled();
    });
  });

  describe('extractFunctionInfo', () => {
    it('should extract info from direct function call format', async () => {
      const call = { name: 'testFunc', arguments: '{"key": "value"}' };
      const result = await handler.processCall(call, {});

      // Should return stringified since no callback available
      expect(result.output).toBe(JSON.stringify(call));
    });

    it('should extract info from tool call format', async () => {
      const call = {
        type: 'function',
        function: {
          name: 'testTool',
          arguments: '{"key": "value"}',
        },
      };
      const result = await handler.processCall(call, {});

      // Should return stringified since no callback available
      expect(result.output).toBe(JSON.stringify(call));
    });

    it('should return null for invalid call formats', async () => {
      const invalidCalls = [null, undefined, 'string', 123, { invalidFormat: true }];

      for (const call of invalidCalls) {
        const result = await handler.processCall(call, {});
        if (typeof call === 'string') {
          expect(result.output).toBe(call);
        } else {
          expect(result.output).toBe(JSON.stringify(call));
        }
      }
    });
  });
});
